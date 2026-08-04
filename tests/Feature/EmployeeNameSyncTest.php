<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Employee;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class EmployeeNameSyncTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['Super Admin', 'HR', 'Employee'] as $role) {
            Role::findOrCreate($role, 'web');
        }
    }

    private function makeHr(): Employee
    {
        $employee = Employee::factory()->create();
        $employee->user->update(['employee_id' => 'HR-NAME']);
        $employee->user->syncRoles(['HR']);

        return $employee;
    }

    private function makeEmployee(): Employee
    {
        $employee = Employee::factory()->create([
            'first_name' => 'Juan',
            'middle_name' => null,
            'last_name' => 'Dela Cruz',
        ]);
        $employee->user->update(['name' => 'Juan Dela Cruz', 'employee_id' => 'EMP-NAME']);
        $employee->user->syncRoles(['Employee']);

        return $employee;
    }

    #[Test]
    public function updating_last_name_syncs_the_user_name_even_with_a_stale_name_field(): void
    {
        $hr = $this->makeHr();
        $employee = $this->makeEmployee();

        // The web UI sends a stale composed `name` together with the new last_name.
        $this->actingAs($hr->user, 'sanctum')->patchJson("/api/admin/employees/{$employee->id}", [
            'last_name' => 'Santos',
            'name' => 'Juan Dela Cruz',
        ])->assertOk();

        $this->assertDatabaseHas('users', [
            'id' => $employee->user_id,
            'name' => 'Juan Santos',
        ]);
    }

    #[Test]
    public function creating_an_employee_derives_the_user_name_from_name_parts(): void
    {
        $hr = $this->makeHr();

        $this->actingAs($hr->user, 'sanctum')->postJson('/api/admin/employees', [
            'employee_id' => 'NEW-EMP-NAME',
            'name' => 'Someone Else',
            'email' => 'new@example.com',
            'password' => 'secret123',
            'role' => 'Employee',
            'branch_id' => Branch::factory()->create()->id,
            'first_name' => 'Maria',
            'middle_name' => null,
            'last_name' => 'Clara',
            'department' => 'IT',
            'position' => 'Engineer',
            'date_hired' => now()->toDateString(),
            'is_active' => true,
        ])->assertCreated();

        $this->assertDatabaseHas('users', [
            'employee_id' => 'NEW-EMP-NAME',
            'name' => 'Maria Clara',
        ]);
    }

    #[Test]
    public function renaming_an_employee_updates_the_actor_name_in_recent_activities(): void
    {
        Storage::fake('public');
        $hr = $this->makeHr();
        $employee = $this->makeEmployee();

        $this->actingAs($employee->user, 'sanctum')->postJson('/api/attendance/time-in', [
            'latitude' => (float) $employee->branch->latitude + 0.0001,
            'longitude' => (float) $employee->branch->longitude + 0.0001,
            'accuracy_meters' => 8,
            'selfie' => UploadedFile::fake()->image('selfie.jpg'),
        ])->assertCreated();

        $this->actingAs($hr->user, 'sanctum')->patchJson("/api/admin/employees/{$employee->id}", [
            'last_name' => 'Santos',
            'name' => 'Juan Dela Cruz',
        ])->assertOk();

        $this->actingAs($hr->user, 'sanctum')->getJson('/api/admin/audit-logs?action=attendance.created')
            ->assertOk()
            ->assertJsonPath('data.0.actor.name', 'Juan Santos');
    }

    #[Test]
    public function recent_activity_prefers_employee_full_name_over_stale_user_name(): void
    {
        Storage::fake('public');
        config(['dtr.attendance.async_face_verification' => false]);
        $hr = $this->makeHr();
        $employee = $this->makeEmployee();

        // Simulate a stale users.name while employee name parts are current.
        $employee->update(['last_name' => 'Santos']);
        $employee->user->update(['name' => 'Juan Dela Cruz']);

        $this->actingAs($employee->user, 'sanctum')->postJson('/api/attendance/time-in', [
            'latitude' => (float) $employee->branch->latitude + 0.0001,
            'longitude' => (float) $employee->branch->longitude + 0.0001,
            'accuracy_meters' => 8,
            'selfie' => UploadedFile::fake()->image('selfie.jpg'),
        ])->assertCreated();

        $this->actingAs($hr->user, 'sanctum')->getJson('/api/admin/audit-logs?action=attendance.created')
            ->assertOk()
            ->assertJsonPath('data.0.actor.name', 'Juan Santos');
    }
}
