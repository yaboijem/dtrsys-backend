<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Employee;
use App\Models\Schedule;
use App\Models\Shift;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class ScheduleAdminApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['Super Admin', 'HR', 'Branch Manager', 'Department Head', 'Employee'] as $role) {
            Role::findOrCreate($role, 'web');
        }
    }

    private function makeUser(string $role, ?Branch $branch = null, string $department = 'IT'): Employee
    {
        $employee = Employee::factory()->create([
            'branch_id' => $branch?->id ?? Branch::factory(),
            'department' => $department,
        ]);
        $employee->user->update(['employee_id' => 'USR-'.strtoupper(uniqid())]);
        $employee->user->syncRoles([$role]);

        return $employee;
    }

    private function shiftPayload(array $overrides = []): array
    {
        return array_merge([
            'name' => 'Morning Shift',
            'start_time' => '08:00:00',
            'end_time' => '17:00:00',
            'grace_minutes' => 10,
            'is_active' => true,
        ], $overrides);
    }

    #[Test]
    public function hr_can_assign_schedule_to_employee(): void
    {
        $hr = $this->makeUser('HR');
        $employee = Employee::factory()->create();
        $shift = Shift::factory()->create();

        $this->actingAs($hr->user, 'sanctum')->postJson('/api/admin/schedules', [
            'employee_id' => $employee->id,
            'shift_id' => $shift->id,
            'date' => now()->addDay()->toDateString(),
        ])->assertCreated()
            ->assertJsonPath('data.shift.id', $shift->id)
            ->assertJsonPath('data.employee.id', $employee->id);

        $this->assertDatabaseHas('schedules', [
            'employee_id' => $employee->id,
            'shift_id' => $shift->id,
        ]);
        $this->assertDatabaseHas('audit_logs', ['action' => 'schedule.created']);
    }

    #[Test]
    public function assigning_existing_date_replaces_shift_and_audits(): void
    {
        $hr = $this->makeUser('HR');
        $employee = Employee::factory()->create();
        $shiftA = Shift::factory()->create();
        $shiftB = Shift::factory()->create();
        $date = now()->addDay()->toDateString();

        $this->actingAs($hr->user, 'sanctum')->postJson('/api/admin/schedules', [
            'employee_id' => $employee->id,
            'shift_id' => $shiftA->id,
            'date' => $date,
        ])->assertCreated();

        $this->actingAs($hr->user, 'sanctum')->postJson('/api/admin/schedules', [
            'employee_id' => $employee->id,
            'shift_id' => $shiftB->id,
            'date' => $date,
        ])->assertOk()
            ->assertJsonPath('data.shift.id', $shiftB->id);

        $this->assertSame(1, Schedule::count());
        $this->assertDatabaseHas('audit_logs', ['action' => 'schedule.updated']);
    }

    #[Test]
    public function hr_can_list_and_delete_schedules(): void
    {
        $hr = $this->makeUser('HR');
        $employee = Employee::factory()->create();
        $shift = Shift::factory()->create();
        $schedule = Schedule::factory()->create([
            'employee_id' => $employee->id,
            'shift_id' => $shift->id,
            'date' => now()->addDay(),
        ]);

        $this->actingAs($hr->user, 'sanctum')->getJson('/api/admin/schedules')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.employee.id', $employee->id);

        $this->actingAs($hr->user, 'sanctum')->deleteJson("/api/admin/schedules/{$schedule->id}")
            ->assertOk()
            ->assertJsonPath('message', 'Schedule removed.');

        $this->assertDatabaseMissing('schedules', ['id' => $schedule->id]);
        $this->assertDatabaseHas('audit_logs', ['action' => 'schedule.deleted']);
    }

    #[Test]
    public function schedule_assignment_is_validation_guarded(): void
    {
        $hr = $this->makeUser('HR');

        $this->actingAs($hr->user, 'sanctum')->postJson('/api/admin/schedules', [])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['employee_id', 'shift_id', 'date']);
    }

    #[Test]
    public function branch_manager_only_sees_own_branch_schedules(): void
    {
        $branchA = Branch::factory()->create();
        $branchB = Branch::factory()->create();
        $manager = $this->makeUser('Branch Manager', $branchA);

        $scheduleA = Schedule::factory()->create([
            'employee_id' => Employee::factory()->create(['branch_id' => $branchA->id])->id,
            'date' => now()->addDay(),
        ]);
        Schedule::factory()->create([
            'employee_id' => Employee::factory()->create(['branch_id' => $branchB->id])->id,
            'date' => now()->addDay(),
        ]);

        $this->actingAs($manager->user, 'sanctum')->getJson('/api/admin/schedules')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $scheduleA->id);

        $this->actingAs($manager->user, 'sanctum')->postJson('/api/admin/schedules', [
            'employee_id' => Employee::factory()->create()->id,
            'shift_id' => Shift::factory()->create()->id,
            'date' => now()->addDay()->toDateString(),
        ])->assertForbidden();
    }

    #[Test]
    public function department_head_only_sees_own_department_schedules(): void
    {
        $branch = Branch::factory()->create();
        $dh = $this->makeUser('Department Head', $branch, 'IT');

        $scheduleIT = Schedule::factory()->create([
            'employee_id' => Employee::factory()->create(['branch_id' => $branch->id, 'department' => 'IT'])->id,
            'date' => now()->addDay(),
        ]);
        Schedule::factory()->create([
            'employee_id' => Employee::factory()->create(['branch_id' => $branch->id, 'department' => 'Sales'])->id,
            'date' => now()->addDay(),
        ]);

        $this->actingAs($dh->user, 'sanctum')->getJson('/api/admin/schedules')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $scheduleIT->id);
    }

    #[Test]
    public function employees_cannot_access_admin_schedules(): void
    {
        $employee = $this->makeUser('Employee');

        $this->actingAs($employee->user, 'sanctum')
            ->getJson('/api/admin/schedules')
            ->assertForbidden();
    }

    #[Test]
    public function schedule_index_supports_filters(): void
    {
        $hr = $this->makeUser('HR');
        $employee = Employee::factory()->create();
        $shiftA = Shift::factory()->create();
        $shiftB = Shift::factory()->create();
        $today = now()->toDateString();

        Schedule::factory()->create(['employee_id' => $employee->id, 'shift_id' => $shiftA->id, 'date' => now()]);
        Schedule::factory()->create(['employee_id' => $employee->id, 'shift_id' => $shiftB->id, 'date' => now()->addDay()]);

        $this->actingAs($hr->user, 'sanctum')->getJson('/api/admin/schedules?date='.$today)
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.shift.id', $shiftA->id);

        $this->actingAs($hr->user, 'sanctum')->getJson('/api/admin/schedules?employee_id='.$employee->id)
            ->assertOk()
            ->assertJsonCount(2, 'data');
    }
}
