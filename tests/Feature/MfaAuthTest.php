<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Employee;
use App\Services\MfaService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use PragmaRX\Google2FA\Google2FA;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class MfaAuthTest extends TestCase
{
    use RefreshDatabase;

    private Google2FA $google2fa;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['Super Admin', 'HR', 'Branch Manager', 'Department Head', 'Employee'] as $role) {
            Role::findOrCreate($role, 'web');
        }

        $this->google2fa = new Google2FA;
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

    private function totpCode(string $secret): string
    {
        return $this->google2fa->getCurrentOtp($secret);
    }

    /** @return array{secret: string, recovery_codes: array<int, string>} */
    private function enableTwoFactor(Employee $employee): array
    {
        $mfa = app(MfaService::class);
        $secret = $mfa->generateSecret();
        $recoveryCodes = $mfa->generateRecoveryCodes();

        $employee->user->forceFill([
            'two_factor_secret' => $secret['secret'],
            'two_factor_recovery_codes' => $mfa->hashRecoveryCodes($recoveryCodes),
            'two_factor_confirmed_at' => now(),
        ])->save();

        return ['secret' => $secret['secret'], 'recovery_codes' => $recoveryCodes];
    }

    #[Test]
    public function privileged_login_issues_token_without_mfa(): void
    {
        $hr = $this->makeUser('HR');

        $this->postJson('/api/auth/login', $this->loginPayload($hr))
            ->assertOk()
            ->assertJsonMissingPath('mfa_required')
            ->assertJsonStructure(['token', 'user'])
            ->assertJsonPath('user.roles', ['HR']);
    }

    #[Test]
    public function super_admin_login_issues_token_without_mfa(): void
    {
        $admin = $this->makeUser('Super Admin');

        $this->postJson('/api/auth/login', $this->loginPayload($admin))
            ->assertOk()
            ->assertJsonMissingPath('mfa_required')
            ->assertJsonStructure(['token']);
    }

    #[Test]
    public function employee_login_skips_mfa(): void
    {
        $employee = $this->makeUser('Employee');

        $this->postJson('/api/auth/login', $this->loginPayload($employee))
            ->assertOk()
            ->assertJsonMissingPath('mfa_required')
            ->assertJsonStructure(['token']);
    }

    #[Test]
    public function privileged_login_still_works_when_two_factor_is_configured(): void
    {
        $hr = $this->makeUser('HR');
        $this->enableTwoFactor($hr);

        $this->postJson('/api/auth/login', $this->loginPayload($hr))
            ->assertOk()
            ->assertJsonMissingPath('mfa_required')
            ->assertJsonStructure(['token', 'user']);
    }

    #[Test]
    public function mfa_status_reports_enabled_state(): void
    {
        $hr = $this->makeUser('HR');
        $this->enableTwoFactor($hr);

        $this->actingAs($hr->user->fresh(), 'sanctum')
            ->getJson('/api/auth/mfa/status')
            ->assertOk()
            ->assertJsonPath('mfa_enabled', true)
            ->assertJsonPath('mfa_required_by_role', true);
    }

    #[Test]
    public function invalid_mfa_token_is_rejected(): void
    {
        $hr = $this->makeUser('HR');
        $this->enableTwoFactor($hr);

        $this->postJson('/api/auth/mfa/verify', [
            'mfa_token' => 'garbage-token',
            'code' => '123456',
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('mfa_token');
    }

    #[Test]
    public function mfa_can_be_disabled_with_password_and_code(): void
    {
        $hr = $this->makeUser('HR');
        $config = $this->enableTwoFactor($hr);
        $secret = $config['secret'];
        $token = $hr->user->createToken('mobile')->plainTextToken;

        $this->withToken($token)->postJson('/api/auth/mfa/disable', [
            'password' => 'password',
            'code' => $this->totpCode($secret),
        ])->assertOk()
            ->assertJsonPath('message', 'Two-factor authentication disabled.');

        $this->assertDatabaseHas('users', ['id' => $hr->user->id, 'two_factor_confirmed_at' => null]);
        $this->assertDatabaseHas('audit_logs', ['action' => 'mfa.disabled', 'user_id' => $hr->user->id]);

        $this->postJson('/api/auth/login', $this->loginPayload($hr))
            ->assertOk()
            ->assertJsonStructure(['token']);
    }

    #[Test]
    public function disable_rejects_wrong_password_and_code(): void
    {
        $hr = $this->makeUser('HR');
        $config = $this->enableTwoFactor($hr);
        $secret = $config['secret'];
        $token = $hr->user->createToken('mobile')->plainTextToken;

        $this->withToken($token)->postJson('/api/auth/mfa/disable', [
            'password' => 'wrong-password',
            'code' => $this->totpCode($secret),
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('password');

        $this->withToken($token)->postJson('/api/auth/mfa/disable', [
            'password' => 'password',
            'code' => '000000',
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('code');
    }
}
