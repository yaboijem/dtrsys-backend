<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Branch;
use App\Models\Employee;
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
            ->assertJsonPath('data.gps_location.is_within_radius', true)
            ->assertJsonPath('data.branch.name', $employee->branch->name)
            ->assertJsonStructure(['data' => ['photo' => ['path']]]);

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
    public function huge_accuracy_cannot_bypass_the_geofence(): void
    {
        $employee = $this->makeEmployee();

        $this->actingAs($employee->user, 'sanctum')->postJson('/api/attendance/time-in', [
            ...$this->punchPayload($employee->branch, [
                'latitude' => (float) $employee->branch->latitude - 1,
                'longitude' => (float) $employee->branch->longitude - 1,
                'accuracy_meters' => 99999999,
            ]),
            'selfie' => UploadedFile::fake()->image('selfie.jpg'),
        ])->assertUnprocessable()
            ->assertJsonPath('code', 'gps_accuracy_too_poor');

        $this->assertDatabaseCount('attendance', 0);
    }

    #[Test]
    public function accuracy_above_the_branch_ceiling_is_rejected(): void
    {
        $employee = $this->makeEmployee();

        $this->actingAs($employee->user, 'sanctum')->postJson('/api/attendance/time-in', [
            ...$this->punchPayload($employee->branch, ['accuracy_meters' => 101]),
            'selfie' => UploadedFile::fake()->image('selfie.jpg'),
        ])->assertUnprocessable()
            ->assertJsonPath('code', 'gps_accuracy_too_poor');
    }

    #[Test]
    public function accuracy_at_the_branch_ceiling_is_accepted(): void
    {
        Storage::fake('public');
        $employee = $this->makeEmployee();

        $this->actingAs($employee->user, 'sanctum')->postJson('/api/attendance/time-in', [
            ...$this->punchPayload($employee->branch, ['accuracy_meters' => 100]),
            'selfie' => UploadedFile::fake()->image('selfie.jpg'),
        ])->assertCreated();
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
    public function offline_sync_endpoint_is_not_available(): void
    {
        $employee = $this->makeEmployee();

        $this->actingAs($employee->user, 'sanctum')
            ->postJson('/api/attendance/sync', ['records' => '[]'])
            ->assertNotFound();
    }

    #[Test]
    public function punch_requires_gps_consent(): void
    {
        $employee = Employee::factory()->withoutConsents()->create();
        $employee->user->syncRoles(['Employee']);

        $this->actingAs($employee->user, 'sanctum')
            ->post('/api/attendance/time-in', $this->punchPayload($employee->branch, [
                'selfie' => UploadedFile::fake()->image('selfie.jpg'),
            ]))
            ->assertStatus(422)
            ->assertJsonPath('code', 'gps_consent_required');
    }
}
