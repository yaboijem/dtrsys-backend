<?php

namespace Database\Factories;

use App\Models\Branch;
use App\Models\Employee;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Employee>
 */
class EmployeeFactory extends Factory
{
    public function definition(): array
    {
        $firstName = fake()->firstName();
        $lastName = fake()->lastName();

        return [
            'user_id' => User::factory()->create([
                'name' => "{$firstName} {$lastName}",
                'email' => fake()->unique()->safeEmail(),
            ]),
            'branch_id' => Branch::factory(),
            'first_name' => $firstName,
            'last_name' => $lastName,
            'department' => fake()->randomElement(['IT', 'Sales', 'HR', 'Operations']),
            'position' => fake()->jobTitle(),
            'date_hired' => fake()->date(),
            'reference_photo_path' => null,
        ];
    }
}
