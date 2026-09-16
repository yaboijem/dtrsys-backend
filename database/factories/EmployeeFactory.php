<?php

namespace Database\Factories;

use App\Models\Branch;
use App\Models\Department;
use App\Models\Employee;
use App\Models\Position;
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
            'work_arrangement' => 'onsite',
            'first_name' => $firstName,
            'last_name' => $lastName,
            'department_id' => Department::factory(),
            'position_id' => Position::factory(),
            'date_hired' => fake()->date(),
        ];
    }
}
