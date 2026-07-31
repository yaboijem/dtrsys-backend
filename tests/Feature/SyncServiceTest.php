<?php

namespace Tests\Feature;

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
}
