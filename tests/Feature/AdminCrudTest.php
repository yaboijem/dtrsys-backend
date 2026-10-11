<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Department;
use App\Models\Employee;
use App\Models\Position;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class AdminCrudTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['Super Admin', 'HR', 'Branch Manager', 'Employee'] as $role) {
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

    private function makeSuperAdmin(): Employee
    {
        $employee = Employee::factory()->create();
        $employee->user->syncRoles(['Super Admin']);

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
            'accuracy_ceiling_meters' => 100,
            'accuracy_allowance_meters' => 30,
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
            'department_id' => Department::firstOrCreate(['name' => 'IT'])->id,
            'position_id' => Position::firstOrCreate(['name' => 'Software Engineer'])->id,
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

    public function test_hr_can_set_branch_gps_accuracy_bounds(): void
    {
        $admin = $this->makeAdmin();

        $this->actingAs($admin->user, 'sanctum')
            ->postJson('/api/admin/branches', $this->branchPayload([
                'accuracy_ceiling_meters' => 150,
                'accuracy_allowance_meters' => 40,
            ]))
            ->assertCreated()
            ->assertJsonPath('data.accuracy_ceiling_meters', 150)
            ->assertJsonPath('data.accuracy_allowance_meters', 40);

        $this->assertDatabaseHas('branches', [
            'code' => 'CEB-001',
            'accuracy_ceiling_meters' => 150,
            'accuracy_allowance_meters' => 40,
        ]);
    }

    public function test_branch_accuracy_allowance_cannot_be_negative(): void
    {
        $admin = $this->makeAdmin();

        $this->actingAs($admin->user, 'sanctum')
            ->postJson('/api/admin/branches', $this->branchPayload(['accuracy_allowance_meters' => -1]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('accuracy_allowance_meters');
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

    public function test_hr_can_create_employee_with_account_and_role(): void
    {
        $admin = $this->makeAdmin();
        $payload = $this->employeePayload();

        $this->actingAs($admin->user, 'sanctum')
            ->postJson('/api/admin/employees', $payload)
            ->assertCreated()
            ->assertJsonPath('data.employee_id', 'NEW-EMP-001')
            ->assertJsonPath('data.roles', ['Employee'])
            ->assertJsonPath('data.department', 'IT')
            ->assertJsonPath('data.department_id', $payload['department_id']);

        $this->assertDatabaseHas('users', ['employee_id' => 'NEW-EMP-001']);
        $this->assertDatabaseHas('employees', ['department_id' => $payload['department_id']]);
    }

    public function test_employee_search_matches_full_name(): void
    {
        $admin = $this->makeAdmin();
        $employee = Employee::factory()->create([
            'first_name' => 'Juan',
            'middle_name' => null,
            'last_name' => 'Dela Cruz',
        ]);
        $employee->user->update([
            'name' => 'Juan Dela Cruz',
            'employee_id' => 'EMP-JUAN',
        ]);

        $this->actingAs($admin->user, 'sanctum')
            ->getJson('/api/admin/employees?search='.urlencode('Juan Dela Cruz'))
            ->assertOk()
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.id', $employee->id);

        $this->actingAs($admin->user, 'sanctum')
            ->getJson('/api/admin/employees?search=Juan')
            ->assertOk()
            ->assertJsonFragment(['id' => $employee->id]);
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
                'role' => 'Branch Manager',
                'branch_id' => $newBranch->id,
            ])
            ->assertOk()
            ->assertJsonPath('data.roles', ['Branch Manager'])
            ->assertJsonPath('data.branch.id', $newBranch->id);
    }

    public function test_hr_cannot_assign_super_admin(): void
    {
        $admin = $this->makeAdmin();

        $this->actingAs($admin->user, 'sanctum')
            ->postJson('/api/admin/employees', $this->employeePayload(['role' => 'Super Admin']))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('role');
    }

    public function test_password_change_revokes_existing_tokens(): void
    {
        $admin = $this->makeAdmin();
        $admin->user->createToken('mobile');

        $this->actingAs($admin->user, 'sanctum')
            ->patchJson("/api/admin/employees/{$admin->id}", ['password' => 'new-password-1'])
            ->assertOk();

        $this->assertSame(0, $admin->user->fresh()->tokens()->count());
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

    public function test_hr_cannot_deactivate_super_admin(): void
    {
        $admin = $this->makeAdmin();
        $superAdmin = $this->makeSuperAdmin();
        $this->makeSuperAdmin();

        $this->actingAs($admin->user, 'sanctum')
            ->deleteJson("/api/admin/employees/{$superAdmin->id}")
            ->assertForbidden()
            ->assertJsonPath('code', 'forbidden');

        $this->assertDatabaseHas('users', ['id' => $superAdmin->user_id, 'is_active' => true]);
    }

    public function test_last_super_admin_cannot_be_deactivated(): void
    {
        $superAdmin = $this->makeSuperAdmin();

        $this->actingAs($superAdmin->user, 'sanctum')
            ->deleteJson("/api/admin/employees/{$superAdmin->id}")
            ->assertStatus(422)
            ->assertJsonPath('code', 'last_super_admin');

        $this->assertDatabaseHas('users', ['id' => $superAdmin->user_id, 'is_active' => true]);
    }

    public function test_super_admin_can_deactivate_another_super_admin(): void
    {
        $superAdmin = $this->makeSuperAdmin();
        $other = $this->makeSuperAdmin();

        $this->actingAs($superAdmin->user, 'sanctum')
            ->deleteJson("/api/admin/employees/{$other->id}")
            ->assertOk();

        $this->assertDatabaseHas('users', ['id' => $other->user_id, 'is_active' => false]);
    }

    public function test_last_super_admin_cannot_be_deactivated_via_update(): void
    {
        $superAdmin = $this->makeSuperAdmin();

        $this->actingAs($superAdmin->user, 'sanctum')
            ->patchJson("/api/admin/employees/{$superAdmin->id}", ['is_active' => false])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('is_active');

        $this->assertDatabaseHas('users', ['id' => $superAdmin->user_id, 'is_active' => true]);
    }

    public function test_super_admin_can_deactivate_another_super_admin_via_update(): void
    {
        $superAdmin = $this->makeSuperAdmin();
        $other = $this->makeSuperAdmin();

        $this->actingAs($superAdmin->user, 'sanctum')
            ->patchJson("/api/admin/employees/{$other->id}", ['is_active' => false])
            ->assertOk();

        $this->assertDatabaseHas('users', ['id' => $other->user_id, 'is_active' => false]);
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
