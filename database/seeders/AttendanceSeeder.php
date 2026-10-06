<?php

namespace Database\Seeders;

use App\Models\Attendance;
use App\Models\Device;
use App\Models\Employee;
use App\Models\GpsLocation;
use Illuminate\Database\Seeder;

class AttendanceSeeder extends Seeder
{
    public function run(): void
    {
        $devices = Device::all();
        $employees = Employee::whereDoesntHave('user', fn ($q) => $q->role(['Super Admin', 'HR', 'Branch Manager', 'Department Head']))->get();

        $employees->each(function (Employee $employee) use ($devices) {
            $device = $devices->firstWhere('employee_id', $employee->id);
            $branch = $employee->branch;

            for ($day = 7; $day >= 1; $day--) {
                $date = now()->subDays($day);

                if ($date->isWeekend()) {
                    continue;
                }

                $punchIn = $date->copy()->setTime(8, 0)->addMinutes(rand(-5, 25));
                $punchOut = $date->copy()->setTime(17, 0)->addMinutes(rand(-15, 20));

                $this->createPunch($employee, $branch, $device, 'time_in', $punchIn);
                $this->createPunch($employee, $branch, $device, 'time_out', $punchOut);
            }
        });
    }

    private function createPunch(Employee $employee, $branch, ?Device $device, string $type, $timestamp): void
    {
        $attendance = Attendance::create([
            'employee_id' => $employee->id,
            'branch_id' => $branch->id,
            'device_id' => $device?->id,
            'type' => $type,
            'timestamp' => $timestamp,
            'latitude' => $branch->latitude + rand(-3, 3) / 100000,
            'longitude' => $branch->longitude + rand(-3, 3) / 100000,
            'gps_accuracy_meters' => rand(5, 30),
            'is_offline' => false,
            'is_late' => false,
            'source' => 'app',
            'synced_at' => $timestamp,
        ]);

        GpsLocation::create([
            'attendance_id' => $attendance->id,
            'employee_id' => $employee->id,
            'latitude' => $attendance->latitude,
            'longitude' => $attendance->longitude,
            'accuracy_meters' => $attendance->gps_accuracy_meters,
            'distance_from_branch_meters' => rand(20, 180),
            'is_within_radius' => true,
            'captured_at' => $timestamp,
        ]);
    }
}
