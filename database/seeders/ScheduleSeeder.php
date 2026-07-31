<?php

namespace Database\Seeders;

use App\Models\Employee;
use App\Models\Schedule;
use App\Models\Shift;
use Illuminate\Database\Seeder;

class ScheduleSeeder extends Seeder
{
    public function run(): void
    {
        $shifts = Shift::all();
        $employees = Employee::all();

        $employees->each(function (Employee $employee, int $index) use ($shifts) {
            for ($day = 0; $day < 14; $day++) {
                $date = now()->addDays($day);

                if ($date->isWeekend()) {
                    continue;
                }

                $shift = $shifts->get(($index + $day) % $shifts->count());

                Schedule::updateOrCreate(
                    ['employee_id' => $employee->id, 'date' => $date->toDateString()],
                    ['shift_id' => $shift->id],
                );
            }
        });
    }
}
