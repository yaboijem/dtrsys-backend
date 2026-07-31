<?php

namespace Database\Factories;

use App\Models\Device;
use App\Models\Employee;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Device>
 */
class DeviceFactory extends Factory
{
    public function definition(): array
    {
        return [
            'employee_id' => Employee::factory(),
            'device_id' => fake()->unique()->uuid(),
            'platform' => fake()->randomElement(['android', 'ios']),
            'model' => fake()->randomElement(['Samsung A54', 'iPhone 13', 'Xiaomi Redmi Note 12', 'Realme 10']),
            'app_version' => '1.0.0',
            'first_seen_at' => now(),
            'last_seen_at' => now(),
            'is_active' => true,
        ];
    }
}
