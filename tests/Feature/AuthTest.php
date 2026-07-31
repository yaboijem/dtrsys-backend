<?php

namespace Tests\Feature;

use App\Models\Device;
use App\Models\DeviceChangeRequest;
use App\Models\Employee;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class AuthTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Role::findOrCreate('Employee', 'web');
        Role::findOrCreate('HR', 'web');
    }

    private function makeEmployee(array $userAttributes = []): Employee
    {
        $employee = Employee::factory()->create();

        $employee->user->update(array_merge([
            'employee_id' => 'EMP-TEST',
            'password' => 'password',
        ], $userAttributes));
        $employee->user->syncRoles(['Employee']);

        return $employee;
    }

    private function loginPayload(string $employeeId, string $password = 'password', ?string $deviceId = null): array
    {
        return array_filter([
            'employee_id' => $employeeId,
            'password' => $password,
            'device_id' => $deviceId,
            'platform' => 'android',
            'model' => 'Pixel 8',
            'app_version' => '1.0.0',
        ], fn ($value) => $value !== null);
    }

    public function test_employee_can_login_and_receive_token(): void
    {
        $this->makeEmployee();

        $response = $this->postJson('/api/auth/login', $this->loginPayload('EMP-TEST'));

        $response->assertOk()
            ->assertJsonStructure(['token', 'user' => ['employee_id', 'roles', 'employee']])
            ->assertJsonPath('user.employee_id', 'EMP-TEST')
            ->assertJsonPath('user.roles', ['Employee']);
    }

    public function test_login_fails_with_incorrect_password(): void
    {
        $this->makeEmployee();

        $this->postJson('/api/auth/login', $this->loginPayload('EMP-TEST', 'wrong-password'))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('employee_id');
    }

    public function test_inactive_user_cannot_login(): void
    {
        $this->makeEmployee(['is_active' => false]);

        $this->postJson('/api/auth/login', $this->loginPayload('EMP-TEST'))
            ->assertUnprocessable();
    }

    public function test_first_login_registers_device(): void
    {
        $employee = $this->makeEmployee();

        $this->postJson('/api/auth/login', $this->loginPayload('EMP-TEST', 'password', 'device-abc-123'))
            ->assertOk();

        $this->assertDatabaseHas('devices', [
            'employee_id' => $employee->id,
            'device_id' => 'device-abc-123',
            'is_active' => true,
        ]);
    }

    public function test_login_from_unknown_device_is_blocked_and_creates_request(): void
    {
        $this->makeEmployee();
        Device::factory()->create([
            'employee_id' => Employee::whereHas('user', fn ($q) => $q->where('employee_id', 'EMP-TEST'))->first()->id,
            'device_id' => 'registered-device',
        ]);

        $response = $this->postJson('/api/auth/login', $this->loginPayload('EMP-TEST', 'password', 'new-phone-01'));

        $response->assertForbidden()
            ->assertJsonPath('code', 'device_not_registered')
            ->assertJsonPath('pending_device_change_request', true);

        $this->assertDatabaseHas('device_change_requests', [
            'new_device_id' => 'new-phone-01',
            'status' => 'pending',
        ]);
    }

    public function test_login_from_approved_device_succeeds(): void
    {
        $employee = $this->makeEmployee();
        Device::factory()->create([
            'employee_id' => $employee->id,
            'device_id' => 'registered-device',
        ]);

        DeviceChangeRequest::create([
            'employee_id' => $employee->id,
            'current_device_id' => Device::where('device_id', 'registered-device')->value('id'),
            'new_device_id' => 'new-phone-02',
            'reason' => 'Replaced phone',
            'status' => 'approved',
        ]);

        $this->postJson('/api/auth/login', $this->loginPayload('EMP-TEST', 'password', 'new-phone-02'))
            ->assertOk()
            ->assertJsonStructure(['token']);

        $this->assertDatabaseHas('devices', [
            'employee_id' => $employee->id,
            'device_id' => 'new-phone-02',
            'is_active' => true,
        ]);

        $this->assertDatabaseHas('devices', [
            'employee_id' => $employee->id,
            'device_id' => 'registered-device',
            'is_active' => false,
        ]);
    }

    public function test_device_registered_to_another_employee_is_rejected(): void
    {
        $this->makeEmployee();
        $other = $this->makeEmployee(['employee_id' => 'EMP-OTHER']);
        Device::factory()->create([
            'employee_id' => $other->id,
            'device_id' => 'stolen-device',
        ]);

        $this->postJson('/api/auth/login', $this->loginPayload('EMP-TEST', 'password', 'stolen-device'))
            ->assertForbidden()
            ->assertJsonPath('pending_device_change_request', false);
    }

    public function test_logout_revokes_current_token(): void
    {
        $this->makeEmployee();

        $token = $this->postJson('/api/auth/login', $this->loginPayload('EMP-TEST'))->json('token');

        $this->withToken($token)->postJson('/api/auth/logout')->assertOk();

        $this->app['auth']->forgetGuards();

        $this->withToken($token)->getJson('/api/auth/me')->assertUnauthorized();
    }

    public function test_me_returns_user_with_roles(): void
    {
        $this->makeEmployee();

        $token = $this->postJson('/api/auth/login', $this->loginPayload('EMP-TEST'))->json('token');

        $this->withToken($token)->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('data.employee_id', 'EMP-TEST')
            ->assertJsonPath('data.roles', ['Employee'])
            ->assertJsonStructure(['data' => ['employee' => ['branch']]]);
    }
}
