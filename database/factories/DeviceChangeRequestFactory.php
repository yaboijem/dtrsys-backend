<?php

namespace Database\Factories;

use App\Models\DeviceChangeRequest;
use App\Models\Employee;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<DeviceChangeRequest>
 */
class DeviceChangeRequestFactory extends Factory
{
    public function definition(): array
    {
        return [
            'employee_id' => Employee::factory(),
            'current_device_id' => null,
            'new_device_id' => fake()->unique()->uuid(),
            'reason' => fake()->sentence(),
            'status' => 'pending',
            'reviewed_by' => null,
            'reviewed_at' => null,
            'review_notes' => null,
        ];
    }
}
