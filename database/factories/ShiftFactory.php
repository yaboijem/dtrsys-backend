<?php

namespace Database\Factories;

use App\Models\Shift;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Shift>
 */
class ShiftFactory extends Factory
{
    public function definition(): array
    {
        return [
            'name' => fake()->randomElement(['Morning', 'Mid', 'Night']),
            'start_time' => '08:00:00',
            'end_time' => '17:00:00',
            'grace_minutes' => 10,
            'break_start' => '12:00:00',
            'break_end' => '13:00:00',
            'is_active' => true,
        ];
    }
}
