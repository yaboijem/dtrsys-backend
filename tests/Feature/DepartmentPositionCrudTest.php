<?php

namespace Tests\Feature;

use App\Models\Department;
use App\Models\Employee;
use App\Models\Position;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class DepartmentPositionCrudTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        foreach (['Super Admin', 'HR', 'Branch Manager', 'Department Head', 'Employee'] as $role) {
            Role::findOrCreate($role, 'web');
        }
    }

    private function makeAdmin(string $role = 'HR'): Employee
    {
        $employee = Employee::factory()->create();
        $employee->user->syncRoles([$role]);

        return $employee;
    }

    #[Test]
    public function hr_can_create_and_list_department(): void
    {
        $admin = $this->makeAdmin();

        $this->actingAs($admin->user, 'sanctum')
            ->postJson('/api/admin/departments', ['name' => 'Engineering'])
            ->assertCreated()
            ->assertJsonPath('data.name', 'Engineering');

        $this->actingAs($admin->user, 'sanctum')
            ->getJson('/api/admin/departments')
            ->assertOk()
            ->assertJsonFragment(['name' => 'Engineering']);
    }

    #[Test]
    public function department_name_must_be_unique_case_insensitive(): void
    {
        Department::factory()->create(['name' => 'IT']);
        $admin = $this->makeAdmin();

        $this->actingAs($admin->user, 'sanctum')
            ->postJson('/api/admin/departments', ['name' => 'it'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('name');
    }

    #[Test]
    public function department_with_employees_cannot_be_deleted(): void
    {
        $dept = Department::factory()->create();
        Employee::factory()->create(['department_id' => $dept->id]);
        $admin = $this->makeAdmin();

        $this->actingAs($admin->user, 'sanctum')
            ->deleteJson("/api/admin/departments/{$dept->id}")
            ->assertStatus(422)
            ->assertJsonPath('code', 'department_has_employees');
    }

    #[Test]
    public function empty_department_can_be_deleted(): void
    {
        $dept = Department::factory()->create();
        $admin = $this->makeAdmin();

        $this->actingAs($admin->user, 'sanctum')
            ->deleteJson("/api/admin/departments/{$dept->id}")
            ->assertOk();

        $this->assertDatabaseMissing('departments', ['id' => $dept->id]);
    }

    #[Test]
    public function department_head_can_list_departments(): void
    {
        Department::factory()->create(['name' => 'Ops']);
        $dh = $this->makeAdmin('Department Head');

        $this->actingAs($dh->user, 'sanctum')
            ->getJson('/api/admin/departments')
            ->assertOk()
            ->assertJsonFragment(['name' => 'Ops']);
    }

    #[Test]
    public function department_head_cannot_create_departments(): void
    {
        $dh = $this->makeAdmin('Department Head');

        $this->actingAs($dh->user, 'sanctum')
            ->postJson('/api/admin/departments', ['name' => 'Secret'])
            ->assertForbidden();
    }

    #[Test]
    public function position_crud_mirrors_department(): void
    {
        $admin = $this->makeAdmin();
        $pos = Position::factory()->create(['name' => 'Clerk']);

        $this->actingAs($admin->user, 'sanctum')
            ->patchJson("/api/admin/positions/{$pos->id}", ['name' => 'Senior Clerk'])
            ->assertOk()
            ->assertJsonPath('data.name', 'Senior Clerk');

        Employee::factory()->create(['position_id' => $pos->id]);

        $this->actingAs($admin->user, 'sanctum')
            ->deleteJson("/api/admin/positions/{$pos->id}")
            ->assertStatus(422)
            ->assertJsonPath('code', 'position_has_employees');
    }
}
