<?php

namespace Tests\Feature;

use App\Models\AppSetting;
use App\Models\Attendance;
use App\Models\Device;
use App\Models\Employee;
use App\Models\FraudFlag;
use App\Services\SyncService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class SyncServiceTest extends TestCase
{
    use RefreshDatabase;

    private function makeEmployee(string $deviceId = 'sync-phone'): Employee
    {
        $employee = Employee::factory()->create();
        Device::factory()->create([
            'employee_id' => $employee->id,
            'device_id' => $deviceId,
        ]);

        return $employee;
    }

    private function record(array $overrides = []): array
    {
        $branch = Employee::latest('id')->first()->branch;

        return array_merge([
            'client_uuid' => fake()->uuid(),
            'type' => 'time_in',
            'timestamp' => now()->subHour()->toDateTimeString(),
            'latitude' => (float) $branch->latitude + 0.0001,
            'longitude' => (float) $branch->longitude + 0.0001,
            'accuracy_meters' => 8,
            'device_id' => 'sync-phone',
            'is_offline' => true,
        ], $overrides);
    }

    #[Test]
    public function valid_offline_records_are_synced(): void
    {
        $employee = $this->makeEmployee();

        $result = app(SyncService::class)->sync($employee->user, [
            $this->record(['client_uuid' => 'rec-1']),
            $this->record([
                'client_uuid' => 'rec-2',
                'type' => 'time_out',
                'timestamp' => now()->toDateTimeString(),
            ]),
        ], 'sync-phone');

        $this->assertSame(2, $result['synced']);
        $this->assertSame(0, $result['failed']);

        $this->assertDatabaseHas('attendance', ['uuid' => 'rec-1', 'source' => 'sync']);
        $this->assertDatabaseHas('attendance', ['uuid' => 'rec-2', 'type' => 'time_out']);
        $this->assertDatabaseHas('sync_logs', ['payload_count' => 2, 'status' => 'success']);
        $this->assertDatabaseHas('gps_locations', ['attendance_id' => $employee->attendanceRecords()->first()->id]);
    }

    #[Test]
    public function duplicate_uuids_are_skipped(): void
    {
        $employee = $this->makeEmployee();

        app(SyncService::class)->sync($employee->user, [$this->record(['client_uuid' => 'rec-1'])], 'sync-phone');
        $result = app(SyncService::class)->sync($employee->user, [$this->record(['client_uuid' => 'rec-1'])], 'sync-phone');

        $this->assertSame(0, $result['synced']);
        $this->assertSame(1, $result['duplicates']);
        $this->assertSame('duplicate', $result['records'][0]['status']);
    }

    #[Test]
    public function invalid_records_are_rejected_server_side(): void
    {
        $employee = $this->makeEmployee();

        $result = app(SyncService::class)->sync($employee->user, [
            $this->record(['client_uuid' => null]),
            $this->record(['timestamp' => now()->addDay()->toDateTimeString()]),
            $this->record(['type' => 'nap_time']),
            $this->record(['client_uuid' => 'ok-1']),
        ], 'sync-phone');

        $this->assertSame(1, $result['synced']);
        $this->assertSame(3, $result['failed']);
        $this->assertDatabaseHas('sync_logs', ['status' => 'partial']);
        $this->assertDatabaseMissing('attendance', ['uuid' => 'ok-2']);
    }

    #[Test]
    public function out_of_radius_synced_records_are_flagged(): void
    {
        $employee = $this->makeEmployee();
        $branch = $employee->branch;

        $result = app(SyncService::class)->sync($employee->user, [
            $this->record([
                'client_uuid' => 'far-away',
                'latitude' => (float) $branch->latitude - 2,
                'longitude' => (float) $branch->longitude - 2,
            ]),
        ], 'sync-phone');

        $this->assertSame(1, $result['synced']);

        $attendance = $employee->attendanceRecords()->first();
        $flag = FraudFlag::where('attendance_id', $attendance->id)->where('type', 'out_of_radius')->first();

        $this->assertNotNull($flag);
        $this->assertFalse($attendance->gpsLocation->is_within_radius);
    }

    #[Test]
    public function device_of_another_employee_is_rejected(): void
    {
        $employee = $this->makeEmployee();
        $other = $this->makeEmployee('other-phone');

        $result = app(SyncService::class)->sync($employee->user, [
            $this->record(['client_uuid' => 'evil-1']),
        ], 'other-phone');

        $this->assertSame(1, $result['failed']);
        $this->assertDatabaseMissing('attendance', ['uuid' => 'evil-1']);
    }

    #[Test]
    public function offline_break_in_and_out_are_synced(): void
    {
        $employee = $this->makeEmployee();
        // Pin midday so the full shift stays on the same calendar day as open* helpers.
        $this->travelTo(now()->startOfDay()->addHours(17));
        $t0 = now()->subHours(9);
        $result = app(SyncService::class)->sync($employee->user, [
            $this->record(['client_uuid' => 'ti', 'type' => 'time_in', 'timestamp' => $t0->toDateTimeString()]),
            $this->record(['client_uuid' => 'bi', 'type' => 'break_in', 'timestamp' => $t0->copy()->addHour()->toDateTimeString()]),
            $this->record(['client_uuid' => 'bo', 'type' => 'break_out', 'timestamp' => $t0->copy()->addHour()->addMinutes(30)->toDateTimeString()]),
            $this->record(['client_uuid' => 'to', 'type' => 'time_out', 'timestamp' => $t0->copy()->addHours(8)->toDateTimeString()]),
        ], 'sync-phone');

        $this->assertSame(4, $result['synced']);
        $bo = Attendance::where('uuid', 'bo')->first();
        $this->assertSame(30, $bo->break_minutes);
        $this->assertFalse((bool) $bo->is_overbreak);
    }

    #[Test]
    public function break_in_without_time_in_fails(): void
    {
        $employee = $this->makeEmployee();
        $result = app(SyncService::class)->sync($employee->user, [
            $this->record(['client_uuid' => 'bi', 'type' => 'break_in']),
        ], 'sync-phone');
        $this->assertSame(0, $result['synced']);
        $this->assertSame(1, $result['failed']);
    }

    #[Test]
    public function offline_break_in_fails_when_breaks_disabled(): void
    {
        $employee = $this->makeEmployee();
        $this->travelTo(now()->startOfDay()->addHours(17));
        $t0 = now()->subHours(9);

        AppSetting::current()->update(['breaks_enabled' => false]);

        $result = app(SyncService::class)->sync($employee->user, [
            $this->record(['client_uuid' => 'ti', 'type' => 'time_in', 'timestamp' => $t0->toDateTimeString()]),
            $this->record(['client_uuid' => 'bi', 'type' => 'break_in', 'timestamp' => $t0->copy()->addHour()->toDateTimeString()]),
        ], 'sync-phone');

        $this->assertSame(1, $result['synced']);
        $this->assertSame(1, $result['failed']);
        $this->assertDatabaseMissing('attendance', ['uuid' => 'bi']);
        $failed = collect($result['records'])->firstWhere('status', 'failed');
        $this->assertStringContainsString('disabled', strtolower($failed['message'] ?? ''));
    }

    #[Test]
    public function offline_break_out_succeeds_when_breaks_disabled_after_open_break(): void
    {
        $employee = $this->makeEmployee();
        $this->travelTo(now()->startOfDay()->addHours(17));
        $t0 = now()->subHours(9);

        $resultOpen = app(SyncService::class)->sync($employee->user, [
            $this->record(['client_uuid' => 'ti', 'type' => 'time_in', 'timestamp' => $t0->toDateTimeString()]),
            $this->record(['client_uuid' => 'bi', 'type' => 'break_in', 'timestamp' => $t0->copy()->addHour()->toDateTimeString()]),
        ], 'sync-phone');
        $this->assertSame(2, $resultOpen['synced']);

        AppSetting::current()->update(['breaks_enabled' => false]);

        $result = app(SyncService::class)->sync($employee->user, [
            $this->record([
                'client_uuid' => 'bo',
                'type' => 'break_out',
                'timestamp' => $t0->copy()->addHour()->addMinutes(30)->toDateTimeString(),
            ]),
        ], 'sync-phone');

        $this->assertSame(1, $result['synced']);
        $this->assertDatabaseHas('attendance', ['uuid' => 'bo', 'type' => 'break_out']);
    }

    #[Test]
    public function offline_time_in_during_open_session_rejected_even_if_synced_after_timeout(): void
    {
        $employee = $this->makeEmployee();
        $this->travelTo(now()->startOfDay()->addHours(14));

        // Live time_in, then live time_out (session closed "now").
        $tIn = now()->subHours(2);
        $tMid = now()->subHour();
        $tOut = now()->subMinutes(5);

        Attendance::factory()->create([
            'employee_id' => $employee->id,
            'branch_id' => $employee->branch_id,
            'type' => 'time_in',
            'timestamp' => $tIn,
            'source' => 'app',
            'uuid' => 'live-ti',
        ]);
        Attendance::factory()->create([
            'employee_id' => $employee->id,
            'branch_id' => $employee->branch_id,
            'type' => 'time_out',
            'timestamp' => $tOut,
            'source' => 'app',
            'uuid' => 'live-to',
        ]);

        // Offline time_in stamped while still clocked in, arrives after timeout was saved.
        $result = app(SyncService::class)->sync($employee->user, [
            $this->record([
                'client_uuid' => 'offline-ti-dup',
                'type' => 'time_in',
                'timestamp' => $tMid->toDateTimeString(),
            ]),
        ], 'sync-phone');

        $this->assertSame(0, $result['synced']);
        $this->assertSame(1, $result['failed']);
        $this->assertDatabaseMissing('attendance', ['uuid' => 'offline-ti-dup']);
        $this->assertSame(
            1,
            Attendance::where('employee_id', $employee->id)->where('type', 'time_in')->count()
        );
    }

    #[Test]
    public function second_time_in_after_timeout_same_day_still_allowed_on_sync(): void
    {
        $employee = $this->makeEmployee();
        $this->travelTo(now()->startOfDay()->addHours(18));
        $t0 = now()->startOfDay()->addHours(8);

        $result = app(SyncService::class)->sync($employee->user, [
            $this->record(['client_uuid' => 'ti1', 'type' => 'time_in', 'timestamp' => $t0->toDateTimeString()]),
            $this->record(['client_uuid' => 'to1', 'type' => 'time_out', 'timestamp' => $t0->copy()->addHours(4)->toDateTimeString()]),
            $this->record(['client_uuid' => 'ti2', 'type' => 'time_in', 'timestamp' => $t0->copy()->addHours(5)->toDateTimeString()]),
        ], 'sync-phone');

        $this->assertSame(3, $result['synced']);
        $this->assertSame(
            2,
            Attendance::where('employee_id', $employee->id)->where('type', 'time_in')->count()
        );
    }
}
