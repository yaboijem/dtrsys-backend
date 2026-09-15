<?php

namespace Database\Factories;

use App\Models\HomeLocation;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<HomeLocation>
 */
class HomeLocationFactory extends Factory
{
    protected $model = HomeLocation::class;

    public function definition(): array
    {
        return [
            'label' => fake()->optional()->streetAddress(),
            'latitude' => fake()->latitude(14.4, 14.8),
            'longitude' => fake()->longitude(120.9, 121.1),
            'radius_meters' => (int) config('dtr.gps.home_radius_meters', 150),
            'address_text' => fake()->optional()->address(),
            'street' => fake()->optional()->streetName(),
            'city' => fake()->optional()->city(),
            'province' => fake()->optional()->state(),
            'created_by' => User::factory(),
            'status' => 'pending',
            'reviewed_by' => null,
            'reviewed_at' => null,
            'review_note' => null,
        ];
    }

    public function approved(): static
    {
        return $this->state(fn () => [
            'status' => 'approved',
            'reviewed_at' => now(),
        ]);
    }

    public function pending(): static
    {
        return $this->state(fn () => [
            'status' => 'pending',
            'reviewed_by' => null,
            'reviewed_at' => null,
        ]);
    }

    public function rejected(): static
    {
        return $this->state(fn () => [
            'status' => 'rejected',
            'reviewed_at' => now(),
        ]);
    }
}
