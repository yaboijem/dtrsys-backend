<?php

namespace Database\Factories;

use App\Models\Branch;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Branch>
 */
class BranchFactory extends Factory
{
    public function definition(): array
    {
        return [
            'name' => fake()->company(),
            'code' => strtoupper(fake()->unique()->lexify('???')),
            'address' => fake()->address(),
            'latitude' => fake()->latitude(14.4, 14.8),
            'longitude' => fake()->longitude(120.9, 121.1),
            'radius_meters' => 200,
            'is_active' => true,
        ];
    }
}
