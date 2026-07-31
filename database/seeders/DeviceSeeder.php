<?php

namespace Database\Seeders;

use App\Models\Device;
use App\Models\Employee;
use Illuminate\Database\Seeder;

class DeviceSeeder extends Seeder
{
    public function run(): void
    {
        $employees = Employee::all();

        $employees->each(function (Employee $employee) {
            Device::firstOrCreate(
                ['employee_id' => $employee->id],
                [
                    'device_id' => 'device-'.strtolower($employee->user->employee_id),
                    'platform' => 'android',
                    'model' => 'Samsung A54',
                    'app_version' => '1.0.0',
                    'first_seen_at' => now()->subMonths(3),
                    'last_seen_at' => now(),
                    'is_active' => true,
                ],
            );
        });
    }
}
