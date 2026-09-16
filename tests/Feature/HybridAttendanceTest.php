<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\HomeLocation;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class HybridAttendanceTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Role::findOrCreate('Employee', 'web');
        Role::findOrCreate('HR', 'web');
        config(['dtr.attendance.async_face_verification' => false]);
    }

    private function makeHybridEmployee(): Employee
    {
        $employee = Employee::factory()->create(['work_arrangement' => 'hybrid']);
        $employee->user->syncRoles(['Employee']);

        return $employee;
    }

    private function attachApprovedHome(Employee $employee, array $attrs = []): HomeLocation
    {
        $home = HomeLocation::factory()->approved()->create(array_merge([
            'latitude' => 14.6000000,
            'longitude' => 121.0000000,
            'radius_meters' => 150,
            'created_by' => $employee->user_id,
            'reviewed_by' => $employee->user_id,
        ], $attrs));

        $employee->homeLocations()->attach($home->id, [
            'is_primary' => true,
            'assigned_at' => now(),
        ]);

        return $home;
    }

    private function punchAt(float $lat, float $lng): array
    {
        return [
            'latitude' => $lat,
            'longitude' => $lng,
            'accuracy_meters' => 8,
            'selfie' => UploadedFile::fake()->image('selfie.jpg'),
        ];
    }

    #[Test]
    public function hybrid_can_submit_home_location(): void
    {
        $employee = $this->makeHybridEmployee();

        $this->actingAs($employee->user, 'sanctum')->postJson('/api/home-location', [
            'latitude' => 14.61,
            'longitude' => 121.01,
            'label' => 'Hybrid Home',
        ])->assertCreated()
            ->assertJsonPath('data.status', 'pending');
    }

    #[Test]
    public function hr_can_set_hybrid_work_arrangement(): void
    {
        $hr = User::factory()->create();
        $hr->syncRoles(['HR']);
        $employee = Employee::factory()->create(['work_arrangement' => 'onsite']);

        $this->actingAs($hr, 'sanctum')->putJson("/api/admin/employees/{$employee->id}", [
            'work_arrangement' => 'hybrid',
            'first_name' => $employee->first_name,
            'last_name' => $employee->last_name,
            'email' => $employee->user->email,
            'employee_id' => $employee->user->employee_id,
            'department_id' => $employee->department_id,
            'position_id' => $employee->position_id,
            'branch_id' => $employee->branch_id,
        ])->assertOk()
            ->assertJsonPath('data.work_arrangement', 'hybrid');
    }

    #[Test]
    public function hybrid_without_home_cannot_punch(): void
    {
        Storage::fake('public');
        $employee = $this->makeHybridEmployee();

        $this->actingAs($employee->user, 'sanctum')
            ->postJson('/api/attendance/time-in', $this->punchAt(
                (float) $employee->branch->latitude + 0.0001,
                (float) $employee->branch->longitude + 0.0001,
            ))
            ->assertUnprocessable()
            ->assertJsonPath('code', 'home_location_required');
    }

    #[Test]
    public function hybrid_punches_at_branch_when_home_approved(): void
    {
        Storage::fake('public');
        $employee = $this->makeHybridEmployee();
        $this->attachApprovedHome($employee, [
            'latitude' => 14.7000000,
            'longitude' => 121.1000000,
            'radius_meters' => 150,
        ]);

        $this->actingAs($employee->user, 'sanctum')
            ->postJson('/api/attendance/time-in', $this->punchAt(
                (float) $employee->branch->latitude + 0.0001,
                (float) $employee->branch->longitude + 0.0001,
            ))
            ->assertCreated()
            ->assertJsonPath('data.gps_location.verified_against_type', 'branch')
            ->assertJsonPath('data.gps_location.is_within_radius', true);
    }

    #[Test]
    public function hybrid_punches_at_home_when_away_from_branch(): void
    {
        Storage::fake('public');
        $employee = $this->makeHybridEmployee();
        $home = $this->attachApprovedHome($employee, [
            'latitude' => 14.7000000,
            'longitude' => 121.1000000,
            'radius_meters' => 200,
        ]);

        $this->actingAs($employee->user, 'sanctum')
            ->postJson('/api/attendance/time-in', $this->punchAt(
                (float) $home->latitude + 0.0001,
                (float) $home->longitude + 0.0001,
            ))
            ->assertCreated()
            ->assertJsonPath('data.gps_location.verified_against_type', 'home_location')
            ->assertJsonPath('data.gps_location.verified_against_id', $home->id);
    }

    #[Test]
    public function hybrid_outside_both_returns_gps_out_of_range(): void
    {
        Storage::fake('public');
        $employee = $this->makeHybridEmployee();
        $this->attachApprovedHome($employee, [
            'latitude' => 14.7000000,
            'longitude' => 121.1000000,
        ]);

        $this->actingAs($employee->user, 'sanctum')
            ->postJson('/api/attendance/time-in', $this->punchAt(10.0, 120.0))
            ->assertUnprocessable()
            ->assertJsonPath('code', 'gps_out_of_range');
    }

    #[Test]
    public function hybrid_nearest_wins_when_both_in_range(): void
    {
        Storage::fake('public');
        $employee = $this->makeHybridEmployee();
        $branch = $employee->branch;
        $branch->update(['radius_meters' => 500]);

        $this->attachApprovedHome($employee, [
            'latitude' => (float) $branch->latitude + 0.0003,
            'longitude' => (float) $branch->longitude,
            'radius_meters' => 500,
        ]);

        $this->actingAs($employee->user, 'sanctum')
            ->postJson('/api/attendance/time-in', $this->punchAt(
                (float) $branch->latitude,
                (float) $branch->longitude,
            ))
            ->assertCreated()
            ->assertJsonPath('data.gps_location.verified_against_type', 'branch');
    }
}
