<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Employee;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class MfaAuthTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['Super Admin', 'HR', 'Branch Manager', 'Department Head', 'Employee'] as $role) {
            Role::findOrCreate($role, 'web');
        }
    }

    private function makeUser(string $role): Employee
    {
        $employee = Employee::factory()->create(['branch_id' => Branch::factory()]);
        $employee->user->update(['employee_id' => 'MFA-'.strtoupper(uniqid()), 'password' => 'password']);
        $employee->user->syncRoles([$role]);

        return $employee;
    }

    private function loginPayload(Employee $employee): array
    {
        return [
            'employee_id' => $employee->user->employee_id,
            'password' => 'password',
            'device_id' => 'device-mfa-'.$employee->id,
            'platform' => 'android',
            'model' => 'Pixel 8',
            'app_version' => '1.0.0',
        ];
    }

    #[Test]
    public function employee_login_returns_token_without_mfa(): void
    {
        $employee = $this->makeUser('Employee');

        $this->postJson('/api/auth/login', $this->loginPayload($employee))
            ->assertOk()
            ->assertJsonMissingPath('mfa_required')
            ->assertJsonStructure(['token', 'user']);
    }

    #[Test]
    public function hr_login_returns_token_without_mfa(): void
    {
        $hr = $this->makeUser('HR');

        $this->postJson('/api/auth/login', $this->loginPayload($hr))
            ->assertOk()
            ->assertJsonMissingPath('mfa_required')
            ->assertJsonPath('user.roles', ['HR'])
            ->assertJsonStructure(['token', 'user']);
    }

    #[Test]
    public function super_admin_login_returns_token_without_mfa(): void
    {
        $admin = $this->makeUser('Super Admin');

        $this->postJson('/api/auth/login', $this->loginPayload($admin))
            ->assertOk()
            ->assertJsonMissingPath('mfa_required')
            ->assertJsonStructure(['token']);
    }

    #[Test]
    public function mfa_routes_are_gone(): void
    {
        $uris = collect(Route::getRoutes())->map(fn ($route) => $route->uri());

        $this->assertFalse($uris->contains(fn (string $uri) => str_contains($uri, 'auth/mfa')));
    }
}
