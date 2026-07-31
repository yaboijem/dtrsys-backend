<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\Schedule;
use App\Models\Shift;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ScheduleApiTest extends TestCase
{
    use RefreshDatabase;

    private function makeEmployeeWithSchedule(): array
    {
        $employee = Employee::factory()->create();
        $employee->user->update(['employee_id' => 'EMP-SCHED']);
        $shift = Shift::factory()->create(['name' => 'Morning Shift']);
        $schedule = Schedule::create([
            'employee_id' => $employee->id,
            'shift_id' => $shift->id,
            'date' => now()->toDateString(),
        ]);

        return [$employee, $schedule];
    }

    public function test_today_returns_assigned_shift(): void
    {
        [$employee, $schedule] = $this->makeEmployeeWithSchedule();

        $this->actingAs($employee->user, 'sanctum')
            ->getJson('/api/schedule/today')
            ->assertOk()
            ->assertJsonPath('data.id', $schedule->id)
            ->assertJsonPath('data.shift.name', 'Morning Shift');
    }

    public function test_today_returns_404_without_schedule(): void
    {
        $employee = Employee::factory()->create();
        $employee->user->update(['employee_id' => 'EMP-NOSCHED']);

        $this->actingAs($employee->user, 'sanctum')
            ->getJson('/api/schedule/today')
            ->assertNotFound()
            ->assertJsonPath('code', 'no_schedule');
    }

    public function test_index_returns_only_schedules_in_range(): void
    {
        [$employee] = $this->makeEmployeeWithSchedule();
        $other = Employee::factory()->create();

        Schedule::create([
            'employee_id' => $employee->id,
            'shift_id' => Shift::factory()->create()->id,
            'date' => now()->addDays(2)->toDateString(),
        ]);
        Schedule::create([
            'employee_id' => $other->id,
            'shift_id' => Shift::factory()->create()->id,
            'date' => now()->addDay()->toDateString(),
        ]);

        $this->actingAs($employee->user, 'sanctum')
            ->getJson('/api/schedule?from='.now()->toDateString().'&to='.now()->addDays(3)->toDateString())
            ->assertOk()
            ->assertJsonCount(2, 'data');
    }
}
