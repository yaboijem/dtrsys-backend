<?php

namespace Database\Factories;

use App\Models\Employee;
use App\Models\SyncLog;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<SyncLog>
 */
class SyncLogFactory extends Factory
{
    protected $model = SyncLog::class;

    public function definition(): array
    {
        return [
            'employee_id' => Employee::factory(),
            'payload_count' => fake()->numberBetween(1, 50),
            'status' => 'success',
            'synced_at' => fake()->dateTimeBetween('-30 days', 'now'),
        ];
    }
}
