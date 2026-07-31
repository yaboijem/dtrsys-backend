<?php

namespace App\Services;

use App\Models\Employee;
use App\Models\Schedule;
use App\Models\Shift;
use Carbon\CarbonInterface;
use Illuminate\Support\Collection;

class ScheduleService
{
    public function shiftFor(Employee $employee, CarbonInterface $date): ?Shift
    {
        return Schedule::where('employee_id', $employee->id)
            ->whereDate('date', $date->toDateString())
            ->first()?->shift;
    }

    public function weekFor(Employee $employee, CarbonInterface $startOfWeek): Collection
    {
        return Schedule::with('shift')
            ->where('employee_id', $employee->id)
            ->whereBetween('date', [$startOfWeek->copy()->startOfWeek(), $startOfWeek->copy()->endOfWeek()])
            ->orderBy('date')
            ->get();
    }
}
