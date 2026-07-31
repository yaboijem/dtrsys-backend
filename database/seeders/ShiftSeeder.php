<?php

namespace Database\Seeders;

use App\Models\Shift;
use Illuminate\Database\Seeder;

class ShiftSeeder extends Seeder
{
    public function run(): void
    {
        $shifts = [
            ['name' => 'Morning Shift', 'start_time' => '08:00:00', 'end_time' => '17:00:00', 'grace_minutes' => 10, 'break_start' => '12:00:00', 'break_end' => '13:00:00'],
            ['name' => 'Mid Shift', 'start_time' => '10:00:00', 'end_time' => '19:00:00', 'grace_minutes' => 10, 'break_start' => '14:00:00', 'break_end' => '15:00:00'],
            ['name' => 'Night Shift', 'start_time' => '22:00:00', 'end_time' => '06:00:00', 'grace_minutes' => 10, 'break_start' => '01:00:00', 'break_end' => '02:00:00'],
        ];

        foreach ($shifts as $shift) {
            Shift::updateOrCreate(['name' => $shift['name']], $shift);
        }
    }
}
