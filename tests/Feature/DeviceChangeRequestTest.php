<?php

namespace Tests\Feature;

use App\Models\Device;
use App\Models\DeviceChangeRequest;
use App\Models\Employee;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class DeviceChangeRequestTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Role::findOrCreate('Employee', 'web');
        Role::findOrCreate('HR', 'web');
    }

    private function makeEmployee(array $attributes = [], string $role = 'Employee'): Employee
    {
        $employee = Employee::factory()->create();

        $employee->user->update(array_merge([
            'employee_id' => 'EMP-TEST',
            'password' => 'password',
        ], $attributes));
        $employee->user->syncRoles([$role]);

        return $employee;
    }

    private function actingAsEmployee(Employee $employee): string
    {
        $token = $this->postJson('/api/auth/login', [
            'employee_id' => $employee->user->employee_id,
            'password' => 'password',
        ])->json('token');

        $this->withToken($token);

        return $token;
    }

    public function test_employee_can_submit_device_change_request(): void
    {
        $employee = $this->makeEmployee();
        Device::factory()->create([
            'employee_id' => $employee->id,
            'device_id' => 'device-EMP-TEST',
        ]);
        $this->actingAsEmployee($employee);

        $this->postJson('/api/device/change-requests', [
            'new_device_id' => 'device-NEW',
            'reason' => 'Phone was lost.',
        ])->assertCreated()
            ->assertJsonPath('request.status', 'pending');

        $this->assertDatabaseHas('device_change_requests', [
            'employee_id' => $employee->id,
            'new_device_id' => 'device-NEW',
            'status' => 'pending',
        ]);
    }

    public function test_employee_can_list_own_requests(): void
    {
        $employee = $this->makeEmployee();
        $this->actingAsEmployee($employee);

        DeviceChangeRequest::factory()->count(3)->create(['employee_id' => $employee->id]);

        $this->getJson('/api/device/change-requests')
            ->assertOk()
            ->assertJsonCount(3, 'data');
    }

    public function test_hr_can_approve_request(): void
    {
        $employee = $this->makeEmployee();
        $hr = $this->makeEmployee(['employee_id' => 'HR-TEST'], 'HR');

        $this->actingAs($hr->user);

        $deviceRequest = DeviceChangeRequest::factory()->create([
            'employee_id' => $employee->id,
            'status' => 'pending',
        ]);

        $this->patchJson("/api/admin/device-change-requests/{$deviceRequest->id}", [
            'status' => 'approved',
            'review_notes' => 'New phone confirmed.',
        ])->assertOk()
            ->assertJsonPath('data.status', 'approved')
            ->assertJsonPath('data.review_notes', 'New phone confirmed.');
    }

    public function test_employee_cannot_review_requests(): void
    {
        $employee = $this->makeEmployee();
        $this->actingAsEmployee($employee);

        $deviceRequest = DeviceChangeRequest::factory()->create([
            'employee_id' => $employee->id,
            'status' => 'pending',
        ]);

        $this->patchJson("/api/admin/device-change-requests/{$deviceRequest->id}", [
            'status' => 'approved',
        ])->assertForbidden();
    }

    public function test_hr_can_filter_requests_by_status(): void
    {
        $hr = $this->makeEmployee(['employee_id' => 'HR-TEST'], 'HR');
        $this->actingAs($hr->user);

        DeviceChangeRequest::factory()->count(2)->create(['status' => 'pending']);
        DeviceChangeRequest::factory()->count(3)->create(['status' => 'approved']);

        $this->getJson('/api/admin/device-change-requests?status=pending')
            ->assertOk()
            ->assertJsonCount(2, 'data');
    }
}
