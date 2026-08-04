<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Branch;
use App\Models\Device;
use App\Models\Employee;
use App\Models\Schedule;
use App\Models\Shift;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class AttendanceApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Role::findOrCreate('Employee', 'web');

        // Classic API tests expect synchronous face verification (verified photo / mismatch rollback).
        config(['dtr.attendance.async_face_verification' => false]);
    }

    private function makeEmployee(): Employee
    {
        $employee = Employee::factory()->create();
        $employee->user->update(['employee_id' => 'EMP-API']);
        $employee->user->syncRoles(['Employee']);

        return $employee;
    }

    private function punchPayload(Branch $branch, array $overrides = []): array
    {
        return array_merge([
            'latitude' => (float) $branch->latitude + 0.0001,
            'longitude' => (float) $branch->longitude + 0.0001,
            'accuracy_meters' => 8,
        ], $overrides);
    }

    #[Test]
    public function employee_can_time_in_with_selfie_and_gps(): void
    {
        Storage::fake('public');
        $employee = $this->makeEmployee();

        $response = $this->actingAs($employee->user, 'sanctum')->postJson('/api/attendance/time-in', [
            ...$this->punchPayload($employee->branch),
            'selfie' => UploadedFile::fake()->image('selfie.jpg'),
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.type', 'time_in')
            ->assertJsonPath('data.photo.is_verified', true)
            ->assertJsonPath('data.gps_location.is_within_radius', true)
            ->assertJsonPath('data.branch.name', $employee->branch->name);

        $this->assertDatabaseHas('attendance', [
            'employee_id' => $employee->id,
            'type' => 'time_in',
        ]);
    }

    #[Test]
    public function selfie_is_required_for_time_in(): void
    {
        $employee = $this->makeEmployee();

        $this->actingAs($employee->user, 'sanctum')
            ->postJson('/api/attendance/time-in', $this->punchPayload($employee->branch))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('selfie');
    }

    #[Test]
    public function duplicate_time_in_returns_409(): void
    {
        $employee = $this->makeEmployee();

        $this->actingAs($employee->user, 'sanctum')->postJson('/api/attendance/time-in', [
            ...$this->punchPayload($employee->branch),
            'selfie' => UploadedFile::fake()->image('selfie.jpg'),
        ])->assertCreated();

        $this->actingAs($employee->user, 'sanctum')->postJson('/api/attendance/time-in', [
            ...$this->punchPayload($employee->branch),
            'selfie' => UploadedFile::fake()->image('selfie.jpg'),
        ])->assertStatus(409)
            ->assertJsonPath('code', 'attendance_conflict');
    }

    #[Test]
    public function out_of_range_gps_returns_422(): void
    {
        $employee = $this->makeEmployee();

        $this->actingAs($employee->user, 'sanctum')->postJson('/api/attendance/time-in', [
            ...$this->punchPayload($employee->branch, [
                'latitude' => (float) $employee->branch->latitude - 1,
                'longitude' => (float) $employee->branch->longitude - 1,
            ]),
            'selfie' => UploadedFile::fake()->image('selfie.jpg'),
        ])->assertUnprocessable()
            ->assertJsonPath('code', 'gps_out_of_range');
    }

    #[Test]
    public function face_mismatch_returns_422_and_rolls_back(): void
    {
        Storage::fake('public');
        config(['dtr.face_verification.force_mismatch' => true]);
        $employee = $this->makeEmployee();

        $this->actingAs($employee->user, 'sanctum')->postJson('/api/attendance/time-in', [
            ...$this->punchPayload($employee->branch),
            'selfie' => UploadedFile::fake()->image('selfie.jpg'),
        ])->assertUnprocessable()
            ->assertJsonPath('code', 'face_verification_failed');

        $this->assertDatabaseCount('attendance', 0);
    }

    #[Test]
    public function employee_can_time_out_and_get_work_minutes(): void
    {
        $employee = $this->makeEmployee();

        $this->travelTo(now()->startOfDay()->setTime(8, 0));

        $this->actingAs($employee->user, 'sanctum')->postJson('/api/attendance/time-in', [
            ...$this->punchPayload($employee->branch),
            'selfie' => UploadedFile::fake()->image('selfie.jpg'),
        ])->assertCreated();

        $this->travel(4 * 60)->minutes();

        $this->actingAs($employee->user, 'sanctum')->postJson('/api/attendance/time-out', [
            ...$this->punchPayload($employee->branch),
            'selfie' => UploadedFile::fake()->image('selfie.jpg'),
        ])->assertCreated()
            ->assertJsonPath('data.type', 'time_out')
            ->assertJsonPath('data.work_minutes', 240);
    }

    #[Test]
    public function time_out_without_time_in_returns_409(): void
    {
        $employee = $this->makeEmployee();

        $this->actingAs($employee->user, 'sanctum')->postJson('/api/attendance/time-out', [
            ...$this->punchPayload($employee->branch),
            'selfie' => UploadedFile::fake()->image('selfie.jpg'),
        ])->assertStatus(409)
            ->assertJsonPath('code', 'attendance_conflict');
    }

    #[Test]
    public function history_returns_only_own_records(): void
    {
        $employee = $this->makeEmployee();
        $other = Employee::factory()->create();

        Attendance::factory()->create([
            'employee_id' => $employee->id,
            'branch_id' => $employee->branch_id,
            'type' => 'time_in',
            'timestamp' => now()->subDay(),
        ]);
        Attendance::factory()->create([
            'employee_id' => $other->id,
            'branch_id' => $other->branch_id,
            'type' => 'time_in',
            'timestamp' => now()->subDay(),
        ]);

        $this->actingAs($employee->user, 'sanctum')
            ->getJson('/api/attendance/history')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.type', 'time_in');
    }

    #[Test]
    public function history_respects_date_and_type_filters(): void
    {
        $employee = $this->makeEmployee();

        Attendance::factory()->create([
            'employee_id' => $employee->id,
            'branch_id' => $employee->branch_id,
            'type' => 'time_in',
            'timestamp' => now()->subDays(5),
        ]);
        Attendance::factory()->create([
            'employee_id' => $employee->id,
            'branch_id' => $employee->branch_id,
            'type' => 'time_out',
            'timestamp' => now()->subDays(5),
        ]);

        $this->actingAs($employee->user, 'sanctum')
            ->getJson('/api/attendance/history?from='.now()->subDays(6)->toDateString().'&to='.now()->subDays(4)->toDateString().'&type=time_out')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.type', 'time_out');
    }

    #[Test]
    public function time_out_exposes_early_timeout_flag(): void
    {
        $employee = $this->makeEmployee();
        $shift = Shift::factory()->create(['start_time' => '08:00:00', 'end_time' => '17:00:00', 'grace_minutes' => 0]);
        Schedule::create([
            'employee_id' => $employee->id,
            'shift_id' => $shift->id,
            'date' => now()->toDateString(),
        ]);

        $this->travelTo(now()->startOfDay()->setTime(8, 0));
        $this->actingAs($employee->user, 'sanctum')->postJson('/api/attendance/time-in', [
            ...$this->punchPayload($employee->branch),
            'selfie' => UploadedFile::fake()->image('selfie.jpg'),
        ])->assertCreated();

        $this->travelTo(now()->setTime(15, 0));
        $this->actingAs($employee->user, 'sanctum')->postJson('/api/attendance/time-out', [
            ...$this->punchPayload($employee->branch),
            'selfie' => UploadedFile::fake()->image('selfie.jpg'),
        ])->assertCreated()
            ->assertJsonPath('data.type', 'time_out')
            ->assertJsonPath('data.is_early_timeout', true);
    }

    #[Test]
    public function offline_records_can_be_synced(): void
    {
        $employee = $this->makeEmployee();
        Device::factory()->create([
            'employee_id' => $employee->id,
            'device_id' => 'sync-phone',
        ]);
        $branch = $employee->branch;

        $this->actingAs($employee->user, 'sanctum')->postJson('/api/attendance/sync', [
            'device_id' => 'sync-phone',
            'records' => json_encode([
                [
                    'client_uuid' => 'rec-a',
                    'type' => 'time_in',
                    'timestamp' => now()->subHours(2)->toDateTimeString(),
                    'latitude' => (float) $branch->latitude + 0.0001,
                    'longitude' => (float) $branch->longitude + 0.0001,
                    'accuracy_meters' => 10,
                ],
                [
                    'client_uuid' => 'rec-b',
                    'type' => 'time_out',
                    'timestamp' => now()->subHour()->toDateTimeString(),
                    'latitude' => (float) $branch->latitude + 0.0001,
                    'longitude' => (float) $branch->longitude + 0.0001,
                    'accuracy_meters' => 10,
                ],
            ]),
        ])->assertOk()
            ->assertJsonPath('synced', 2)
            ->assertJsonPath('failed', 0);

        $this->assertDatabaseHas('attendance', ['uuid' => 'rec-a', 'source' => 'sync']);
        $this->assertDatabaseHas('attendance', ['uuid' => 'rec-b', 'source' => 'sync']);
        $this->assertDatabaseHas('sync_logs', ['employee_id' => $employee->id, 'status' => 'success']);
    }

    #[Test]
    public function synced_time_out_before_shift_end_is_flagged_early(): void
    {
        $employee = $this->makeEmployee();
        Device::factory()->create([
            'employee_id' => $employee->id,
            'device_id' => 'sync-phone-early',
        ]);
        $branch = $employee->branch;
        $shift = Shift::factory()->create(['start_time' => '08:00:00', 'end_time' => '17:00:00', 'grace_minutes' => 0]);

        $this->travelTo(now()->startOfDay()->setTime(10, 0));
        Schedule::create([
            'employee_id' => $employee->id,
            'shift_id' => $shift->id,
            'date' => now()->toDateString(),
        ]);

        $this->actingAs($employee->user, 'sanctum')->postJson('/api/attendance/sync', [
            'device_id' => 'sync-phone-early',
            'records' => json_encode([
                [
                    'client_uuid' => 'early-in',
                    'type' => 'time_in',
                    'timestamp' => now()->setTime(8, 0)->toDateTimeString(),
                    'latitude' => (float) $branch->latitude + 0.0001,
                    'longitude' => (float) $branch->longitude + 0.0001,
                    'accuracy_meters' => 10,
                ],
                [
                    'client_uuid' => 'early-out',
                    'type' => 'time_out',
                    'timestamp' => now()->setTime(9, 0)->toDateTimeString(),
                    'latitude' => (float) $branch->latitude + 0.0001,
                    'longitude' => (float) $branch->longitude + 0.0001,
                    'accuracy_meters' => 10,
                ],
            ]),
        ])->assertOk()
            ->assertJsonPath('synced', 2)
            ->assertJsonPath('failed', 0);

        $this->assertDatabaseHas('attendance', ['uuid' => 'early-out', 'is_early_timeout' => true]);
    }

    #[Test]
    public function sync_rejects_future_timestamps(): void
    {
        $employee = $this->makeEmployee();

        $this->actingAs($employee->user, 'sanctum')->postJson('/api/attendance/sync', [
            'records' => json_encode([
                [
                    'client_uuid' => 'rec-future',
                    'type' => 'time_in',
                    'timestamp' => now()->addDay()->toDateTimeString(),
                    'latitude' => 14.55,
                    'longitude' => 121.02,
                ],
            ]),
        ])->assertOk()
            ->assertJsonPath('synced', 0)
            ->assertJsonPath('failed', 1);
    }
}
