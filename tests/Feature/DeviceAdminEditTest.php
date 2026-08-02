<?php

namespace Tests\Feature;

use App\Models\Device;
use App\Models\Employee;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class DeviceAdminEditTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['Super Admin', 'HR', 'Employee'] as $role) {
            Role::findOrCreate($role, 'web');
        }
    }

    private function makeAdmin(): Employee
    {
        $employee = Employee::factory()->create();
        $employee->user->update(['employee_id' => 'HR-TEST']);
        $employee->user->syncRoles(['HR']);

        return $employee;
    }

    public function test_hr_can_set_device_name_and_shared_flag(): void
    {
        $admin = $this->makeAdmin();
        $employee = Employee::factory()->create();
        Device::factory()->create([
            'employee_id' => $employee->id,
            'device_id' => 'demo-device-1',
            'is_active' => true,
        ]);

        $this->actingAs($admin->user, 'sanctum')
            ->patchJson("/api/admin/employees/{$employee->id}", [
                'device_name' => 'Test phone',
                'device_is_shared' => true,
            ])->assertOk()
            ->assertJsonPath('data.active_device.name', 'Test phone')
            ->assertJsonPath('data.active_device.is_shared', true);

        $this->assertDatabaseHas('devices', [
            'id' => $employee->devices()->first()->id,
            'name' => 'Test phone',
            'is_shared' => true,
        ]);
    }

    public function test_hr_can_clear_device_name(): void
    {
        $admin = $this->makeAdmin();
        $employee = Employee::factory()->create();
        $device = Device::factory()->create([
            'employee_id' => $employee->id,
            'device_id' => 'demo-device-1',
            'name' => 'Old name',
            'is_active' => true,
        ]);

        $this->actingAs($admin->user, 'sanctum')
            ->patchJson("/api/admin/employees/{$employee->id}", [
                'device_name' => '',
            ])->assertOk()
            ->assertJsonPath('data.active_device.name', null);

        $this->assertDatabaseHas('devices', ['id' => $device->id, 'name' => null]);
    }

    public function test_device_update_writes_audit_log(): void
    {
        $admin = $this->makeAdmin();
        $employee = Employee::factory()->create();
        $device = Device::factory()->create([
            'employee_id' => $employee->id,
            'device_id' => 'demo-device-1',
            'is_active' => true,
        ]);

        $this->actingAs($admin->user, 'sanctum')
            ->patchJson("/api/admin/employees/{$employee->id}", [
                'device_name' => 'Renamed',
                'device_is_shared' => true,
            ])->assertOk();

        $this->assertDatabaseHas('audit_logs', [
            'action' => 'device.updated',
            'model_type' => 'App\\Models\\Device',
            'model_id' => (string) $device->id,
        ]);
    }

    public function test_device_fields_are_noop_without_active_device(): void
    {
        $admin = $this->makeAdmin();
        $employee = Employee::factory()->create();

        $this->actingAs($admin->user, 'sanctum')
            ->patchJson("/api/admin/employees/{$employee->id}", [
                'device_name' => 'X',
                'device_is_shared' => true,
            ])->assertOk();

        $this->assertDatabaseMissing('devices', ['employee_id' => $employee->id]);
    }
}
