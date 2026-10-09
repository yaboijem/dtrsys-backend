<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Branch;
use App\Models\Department;
use App\Models\Employee;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class OpenSessionAdminTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['Super Admin', 'HR', 'Branch Manager', 'Employee'] as $role) {
            Role::findOrCreate($role, 'web');
        }
    }

    #[Test]
    public function hr_lists_open_time_ins_and_breaks_only(): void
    {
        $hr = $this->makeUser('HR');
        $clockedIn = $this->makeUser('Employee');
        $onBreak = $this->makeUser('Employee');
        $closed = $this->makeUser('Employee');

        $this->punch($clockedIn, 'time_in', now()->subHours(2));
        $this->punch($onBreak, 'time_in', now()->subHours(3));
        $this->punch($onBreak, 'break_in', now()->subHour(), ['break_kind' => 'lunch_60']);
        $this->punch($closed, 'time_in', now()->subHours(4));
        $this->punch($closed, 'time_out', now()->subHours(3));

        $this->actingAs($hr->user, 'sanctum')
            ->getJson('/api/admin/open-sessions')
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonFragment([
                'employee_id' => $clockedIn->id,
                'status' => 'time_in',
            ])
            ->assertJsonFragment([
                'employee_id' => $onBreak->id,
                'status' => 'on_break',
                'break_kind' => 'lunch_60',
            ]);
    }

    #[Test]
    public function hr_can_time_out_an_open_break_and_clear_the_session(): void
    {
        $hr = $this->makeUser('HR');
        $employee = $this->makeUser('Employee');
        $this->punch($employee, 'time_in', now()->subHours(2));
        $this->punch($employee, 'break_in', now()->subMinutes(40), ['break_kind' => 'bio']);

        $this->actingAs($hr->user, 'sanctum')
            ->postJson("/api/admin/open-sessions/{$employee->id}/close", [
                'action' => 'time_out',
                'notes' => 'Forgot to clock out',
            ])
            ->assertOk()
            ->assertJsonPath('data.0.type', 'break_out')
            ->assertJsonPath('data.0.source', 'admin')
            ->assertJsonPath('data.1.type', 'time_out')
            ->assertJsonPath('data.1.source', 'admin');

        $this->assertDatabaseHas('attendance', [
            'employee_id' => $employee->id,
            'type' => 'time_out',
            'source' => 'admin',
        ]);

        $this->actingAs($hr->user, 'sanctum')
            ->getJson('/api/admin/open-sessions')
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    #[Test]
    public function hr_can_end_a_break_without_clocking_out(): void
    {
        $hr = $this->makeUser('HR');
        $employee = $this->makeUser('Employee');
        $this->punch($employee, 'time_in', now()->subHours(2));
        $this->punch($employee, 'break_in', now()->subMinutes(20), ['break_kind' => 'bio']);

        $this->actingAs($hr->user, 'sanctum')
            ->postJson("/api/admin/open-sessions/{$employee->id}/close", [
                'action' => 'break_out',
            ])
            ->assertOk()
            ->assertJsonPath('data.0.type', 'break_out');

        $this->actingAs($hr->user, 'sanctum')
            ->getJson('/api/admin/open-sessions')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.status', 'time_in');
    }

    #[Test]
    public function open_sessions_are_paginated(): void
    {
        $hr = $this->makeUser('HR');
        $ids = [];

        for ($i = 0; $i < 21; $i++) {
            $employee = $this->makeUser('Employee');
            $this->punch($employee, 'time_in', now()->subMinutes(21 - $i));
            $ids[] = $employee->id;
        }

        $page = $this->actingAs($hr->user, 'sanctum')
            ->getJson('/api/admin/open-sessions?page=2&per_page=20')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('meta.current_page', 2)
            ->assertJsonPath('meta.per_page', 20)
            ->assertJsonPath('meta.total', 21)
            ->assertJsonPath('meta.last_page', 2)
            ->assertJsonPath('data.0.employee_id', $ids[20]);

        $this->assertNotNull($page->json('links.prev'));

        $this->actingAs($hr->user, 'sanctum')
            ->getJson('/api/admin/open-sessions?per_page=1000')
            ->assertOk()
            ->assertJsonPath('meta.per_page', 500)
            ->assertJsonCount(21, 'data');
    }

    #[Test]
    public function open_sessions_ignore_punches_older_than_the_lookback(): void
    {
        $hr = $this->makeUser('HR');
        $stale = $this->makeUser('Employee');
        $recent = $this->makeUser('Employee');
        $this->punch($stale, 'time_in', now()->subDays(31));
        $this->punch($recent, 'time_in', now()->subHour());

        $this->actingAs($hr->user, 'sanctum')
            ->getJson('/api/admin/open-sessions')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonFragment(['employee_id' => $recent->id])
            ->assertJsonMissing(['employee_id' => $stale->id]);
    }

    #[Test]
    public function branch_manager_cannot_override_sessions(): void
    {
        $manager = $this->makeUser('Branch Manager');
        $employee = $this->makeUser('Employee');
        $this->punch($employee, 'time_in', now()->subHour());

        $this->actingAs($manager->user, 'sanctum')
            ->getJson('/api/admin/open-sessions')
            ->assertForbidden();
    }

    private function makeUser(string $role): Employee
    {
        $branch = Branch::factory()->create();
        $dept = Department::firstOrCreate(['name' => 'IT']);
        $employee = Employee::factory()->create([
            'branch_id' => $branch->id,
            'department_id' => $dept->id,
        ]);
        $employee->user->syncRoles([$role]);

        return $employee;
    }

    private function punch(Employee $employee, string $type, $timestamp, array $extra = []): Attendance
    {
        return Attendance::factory()->create(array_merge([
            'employee_id' => $employee->id,
            'branch_id' => $employee->branch_id,
            'type' => $type,
            'timestamp' => $timestamp,
            'is_late' => false,
        ], $extra));
    }
}
