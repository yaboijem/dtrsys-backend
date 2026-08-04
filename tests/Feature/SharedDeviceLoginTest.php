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

    public function test_any_employee_can_log_in_on_another_employees_device(): void
    {
        $owner = $this->makeEmployee('EMP-OWNER');
        Device::factory()->create([
            'employee_id' => $owner->id,
            'device_id' => 'shared-phone',
            'is_shared' => false,
        ]);
        $other = $this->makeEmployee('EMP-OTHER');

        $this->postJson('/api/auth/login', [
            'employee_id' => 'EMP-OTHER',
            'password' => 'password',
            'device_id' => 'shared-phone',
        ])->assertOk()
            ->assertJsonPath('user.employee_id', 'EMP-OTHER');

        $this->assertDatabaseHas('devices', [
            'device_id' => 'shared-phone',
            'employee_id' => $other->id,
        ]);
    }

    public function test_shared_flag_device_also_allows_login(): void
    {
        $owner = $this->makeEmployee('EMP-OWNER');
        Device::factory()->create([
            'employee_id' => $owner->id,
            'device_id' => 'kiosk-phone',
            'is_shared' => true,
        ]);
        $this->makeEmployee('EMP-OTHER');

        $this->postJson('/api/auth/login', [
            'employee_id' => 'EMP-OTHER',
            'password' => 'password',
            'device_id' => 'kiosk-phone',
        ])->assertOk()
            ->assertJsonPath('user.employee_id', 'EMP-OTHER');
    }
}
