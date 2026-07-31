<?php

namespace Database\Factories;

use App\Models\DataRequest;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<DataRequest>
 */
class DataRequestFactory extends Factory
{
    protected $model = DataRequest::class;

    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'type' => fake()->randomElement(['access', 'deletion']),
            'status' => 'pending',
            'notes' => null,
            'processed_by' => null,
            'processed_at' => null,
        ];
    }
}
