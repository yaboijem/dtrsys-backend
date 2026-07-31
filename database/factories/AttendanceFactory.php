<?php

namespace Database\Factories;

use App\Models\Attendance;
use App\Models\Branch;
use App\Models\Employee;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Attendance>
 */
class AttendanceFactory extends Factory
{
    public function definition(): array
    {
        $timestamp = fake()->dateTimeBetween('-30 days', 'now');

        return [
            'employee_id' => Employee::factory(),
            'branch_id' => Branch::factory(),
            'type' => fake()->randomElement(['time_in', 'time_out']),
            'timestamp' => $timestamp,
            'latitude' => fake()->latitude(14.4, 14.8),
            'longitude' => fake()->longitude(120.9, 121.1),
            'gps_accuracy_meters' => fake()->randomFloat(2, 3, 50),
            'is_offline' => false,
            'is_late' => fake()->boolean(20),
            'work_minutes' => null,
            'source' => 'app',
        ];
    }
}
