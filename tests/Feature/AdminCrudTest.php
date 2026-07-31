<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Employee;
use App\Models\Schedule;
use App\Models\Shift;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class AdminCrudTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['Super Admin', 'HR', 'Employee'] as $role) {
            Role::findOrCreate($role, 'web');
        }
    }

    private function makeAdmin(): Employee
    {
        $employee = Employee::factory()->create();
        $employee->user->update(['employee_id' => 'HR-TEST']);
        $employee->user->syncRoles(['HR']);

        return $employee;
    }

    private function branchPayload(array $overrides = []): array
    {
        return array_merge([
            'name' => 'Cebu Branch',
            'code' => 'CEB-001',
            'address' => '123 Osmeña Blvd, Cebu City',
            'latitude' => 10.3157,
            'longitude' => 123.8854,
            'radius_meters' => 300,
            'is_active' => true,
        ], $overrides);
    }

    private function shiftPayload(array $overrides = []): array
    {
        return array_merge([
            'name' => 'Morning Shift',
            'start_time' => '08:00:00',
            'end_time' => '17:00:00',
            'grace_minutes' => 10,
            'break_start' => '12:00:00',
            'break_end' => '13:00:00',
            'is_active' => true,
        ], $overrides);
    }

    private function employeePayload(array $overrides = []): array
    {
        return array_merge([
            'employee_id' => 'NEW-EMP-001',
            'name' => 'Juan Dela Cruz',
            'email' => 'juan@example.com',
            'password' => 'secret123',
            'role' => 'Employee',
            'branch_id' => Branch::factory()->create()->id,
            'first_name' => 'Juan',
            'middle_name' => 'P',
            'last_name' => 'Dela Cruz',
            'department' => 'IT',
            'position' => 'Software Engineer',
            'date_hired' => now()->toDateString(),
            'is_active' => true,
        ], $overrides);
    }

    public function test_hr_can_create_branch(): void
    {
        $admin = $this->makeAdmin();

        $this->actingAs($admin->user, 'sanctum')
            ->postJson('/api/admin/branches', $this->branchPayload())
            ->assertCreated()
            ->assertJsonPath('data.code', 'CEB-001');

        $this->assertDatabaseHas('branches', ['code' => 'CEB-001', 'is_active' => true]);
    }

    public function test_branch_code_must_be_unique(): void
    {
        Branch::factory()->create(['code' => 'CEB-001']);
        $admin = $this->makeAdmin();

        $this->actingAs($admin->user, 'sanctum')
            ->postJson('/api/admin/branches', $this->branchPayload())
            ->assertUnprocessable()
            ->assertJsonValidationErrors('code');
    }

    public function test_branch_with_employees_cannot_be_deleted(): void
    {
        $branch = Branch::factory()->create();
        Employee::factory()->create(['branch_id' => $branch->id]);
        $admin = $this->makeAdmin();

        $this->actingAs($admin->user, 'sanctum')
            ->deleteJson("/api/admin/branches/{$branch->id}")
            ->assertStatus(422)
            ->assertJsonPath('code', 'branch_has_employees');
    }

    public function test_empty_branch_can_be_deleted(): void
    {
        $branch = Branch::factory()->create();
        $admin = $this->makeAdmin();

        $this->actingAs($admin->user, 'sanctum')
            ->deleteJson("/api/admin/branches/{$branch->id}")
            ->assertOk();

        $this->assertDatabaseMissing('branches', ['id' => $branch->id]);
    }

    public function test_hr_can_update_shift(): void
    {
        $shift = Shift::factory()->create();
        $admin = $this->makeAdmin();

        $this->actingAs($admin->user, 'sanctum')
            ->patchJson("/api/admin/shifts/{$shift->id}", ['grace_minutes' => 15])
            ->assertOk()
            ->assertJsonPath('data.grace_minutes', 15);
    }

    public function test_shift_in_use_cannot_be_deleted(): void
    {
        $shift = Shift::factory()->create();
        $employee = Employee::factory()->create();
        Schedule::create([
            'employee_id' => $employee->id,
            'shift_id' => $shift->id,
            'date' => now()->toDateString(),
        ]);
        $admin = $this->makeAdmin();

        $this->actingAs($admin->user, 'sanctum')
            ->deleteJson("/api/admin/shifts/{$shift->id}")
            ->assertStatus(422)
            ->assertJsonPath('code', 'shift_in_use');
    }

    public function test_hr_can_create_employee_with_account_and_role(): void
    {
        $admin = $this->makeAdmin();

        $this->actingAs($admin->user, 'sanctum')
            ->postJson('/api/admin/employees', $this->employeePayload())
            ->assertCreated()
            ->assertJsonPath('data.employee_id', 'NEW-EMP-001')
            ->assertJsonPath('data.roles', ['Employee']);

        $this->assertDatabaseHas('users', ['employee_id' => 'NEW-EMP-001']);
        $this->assertDatabaseHas('employees', ['department' => 'IT']);
    }

    public function test_duplicate_employee_id_is_rejected(): void
    {
        $admin = $this->makeAdmin();
        $this->actingAs($admin->user, 'sanctum')
            ->postJson('/api/admin/employees', $this->employeePayload())
            ->assertCreated();

        $this->actingAs($admin->user, 'sanctum')
            ->postJson('/api/admin/employees', $this->employeePayload(['email' => 'other@example.com']))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('employee_id');
    }

    public function test_hr_can_update_employee_role_and_branch(): void
    {
        $admin = $this->makeAdmin();
        $employee = Employee::factory()->create();
        $employee->user->syncRoles(['Employee']);
        $newBranch = Branch::factory()->create();

        $this->actingAs($admin->user, 'sanctum')
            ->patchJson("/api/admin/employees/{$employee->id}", [
                'role' => 'Super Admin',
                'branch_id' => $newBranch->id,
            ])
            ->assertOk()
            ->assertJsonPath('data.roles', ['Super Admin'])
            ->assertJsonPath('data.branch.id', $newBranch->id);
    }

    public function test_deleting_employee_deactivates_account(): void
    {
        $admin = $this->makeAdmin();
        $employee = Employee::factory()->create();

        $this->actingAs($admin->user, 'sanctum')
            ->deleteJson("/api/admin/employees/{$employee->id}")
            ->assertOk();

        $this->assertDatabaseHas('users', ['id' => $employee->user_id, 'is_active' => false]);
    }

    public function test_employee_role_cannot_access_admin_endpoints(): void
    {
        $employee = Employee::factory()->create();
        $employee->user->syncRoles(['Employee']);

        $this->actingAs($employee->user, 'sanctum')
            ->getJson('/api/admin/branches')
            ->assertForbidden()
            ->assertJsonPath('code', 'forbidden');
    }
}
