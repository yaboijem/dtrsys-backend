<?php

namespace Tests\Unit;

use App\Models\Employee;
use App\Models\Schedule;
use App\Models\Shift;
use App\Services\ScheduleService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class ScheduleServiceTest extends TestCase
{
    use RefreshDatabase;

    #[Test]
    public function it_returns_shift_for_scheduled_date(): void
    {
        $employee = Employee::factory()->create();
        $shift = Shift::factory()->create();
        Schedule::create([
            'employee_id' => $employee->id,
            'shift_id' => $shift->id,
            'date' => now()->toDateString(),
        ]);

        $result = (new ScheduleService)->shiftFor($employee, now());

        $this->assertNotNull($result);
        $this->assertSame($shift->id, $result->id);
    }

    #[Test]
    public function it_returns_null_when_no_schedule_exists(): void
    {
        $employee = Employee::factory()->create();

        $result = (new ScheduleService)->shiftFor($employee, now());

        $this->assertNull($result);
    }

    #[Test]
    public function it_returns_week_schedules(): void
    {
        $employee = Employee::factory()->create();
        $shift = Shift::factory()->create();
        Schedule::create([
            'employee_id' => $employee->id,
            'shift_id' => $shift->id,
            'date' => now()->addDay()->toDateString(),
        ]);

        $result = (new ScheduleService)->weekFor($employee, now());

        $this->assertCount(1, $result);
        $this->assertSame($shift->id, $result->first()->shift->id);
    }
}
