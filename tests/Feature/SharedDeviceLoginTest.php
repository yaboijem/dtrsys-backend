<?php

namespace Tests\Feature;

use App\Models\Device;
use App\Models\Employee;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class SharedDeviceLoginTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['Employee', 'Super Admin', 'HR'] as $role) {
            Role::findOrCreate($role, 'web');
        }
    }

    private function makeEmployee(string $employeeId, string $role = 'Employee'): Employee
    {
        $employee = Employee::factory()->create();

        $employee->user->update([
            'employee_id' => $employeeId,
            'password' => 'password',
        ]);
        $employee->user->syncRoles([$role]);

        return $employee;
    }

    public function test_shared_device_allows_other_employee_to_log_in(): void
    {
        $owner = $this->makeEmployee('EMP-OWNER');
        Device::factory()->create([
            'employee_id' => $owner->id,
            'device_id' => 'shared-phone',
            'is_shared' => true,
        ]);
        $other = $this->makeEmployee('EMP-OTHER');

        $this->postJson('/api/auth/login', [
            'employee_id' => 'EMP-OTHER',
            'password' => 'password',
            'device_id' => 'shared-phone',
        ])->assertOk()
            ->assertJsonPath('user.employee_id', 'EMP-OTHER');
    }

    public function test_non_shared_device_blocks_other_employee(): void
    {
        $owner = $this->makeEmployee('EMP-OWNER');
        Device::factory()->create([
            'employee_id' => $owner->id,
            'device_id' => 'owner-phone',
            'is_shared' => false,
        ]);
        $this->makeEmployee('EMP-OTHER');

        $this->postJson('/api/auth/login', [
            'employee_id' => 'EMP-OTHER',
            'password' => 'password',
            'device_id' => 'owner-phone',
        ])->assertForbidden()
            ->assertJsonPath('code', 'device_not_registered');
    }
}
