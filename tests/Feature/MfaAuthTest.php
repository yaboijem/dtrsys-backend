<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Employee;
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

        foreach (['Super Admin', 'HR', 'Payroll Officer', 'Branch Manager', 'Department Head', 'Employee'] as $role) {
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

    #[Test]
    public function privileged_login_requires_mfa_setup(): void
    {
        $hr = $this->makeUser('HR');

        $this->postJson('/api/auth/login', $this->loginPayload($hr))
            ->assertOk()
            ->assertJsonPath('mfa_required', true)
            ->assertJsonPath('mfa_setup_required', true)
            ->assertJsonMissingPath('token');
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
    public function full_mfa_setup_flow_issues_token_and_recovery_codes(): void
    {
        $hr = $this->makeUser('HR');

        $login = $this->postJson('/api/auth/login', $this->loginPayload($hr))
            ->assertOk()
            ->assertJsonPath('mfa_setup_required', true);

        $mfaToken = $login->json('mfa_token');

        $setup = $this->postJson('/api/auth/mfa/enable', ['mfa_token' => $mfaToken])
            ->assertOk()
            ->assertJsonStructure(['secret', 'otpauth_url', 'qr_code', 'mfa_token']);

        $secret = $setup->json('secret');
        $confirmToken = $setup->json('mfa_token');

        $confirm = $this->postJson('/api/auth/mfa/confirm', [
            'mfa_token' => $confirmToken,
            'code' => $this->totpCode($secret),
        ])->assertOk()
            ->assertJsonStructure(['token', 'recovery_codes', 'user'])
            ->assertJsonCount(8, 'recovery_codes');

        $this->assertNotEmpty($confirm->json('token'));
        $this->assertDatabaseHas('users', [
            'id' => $hr->user->id,
            'two_factor_confirmed_at' => now(),
        ]);
        $this->assertDatabaseHas('audit_logs', ['action' => 'mfa.enabled', 'user_id' => $hr->user->id]);

        $this->actingAs($hr->user->fresh(), 'sanctum')
            ->getJson('/api/auth/mfa/status')
            ->assertOk()
            ->assertJsonPath('mfa_enabled', true)
            ->assertJsonPath('mfa_required_by_role', true);
    }

    #[Test]
    public function configured_user_verifies_with_totp_code(): void
    {
        $hr = $this->makeUser('HR');
        $config = $this->configure($hr);
        $secret = $config['secret'];

        $login = $this->postJson('/api/auth/login', $this->loginPayload($hr))
            ->assertOk()
            ->assertJsonPath('mfa_required', true)
            ->assertJsonPath('mfa_setup_required', false);

        $this->postJson('/api/auth/mfa/verify', [
            'mfa_token' => $login->json('mfa_token'),
            'code' => $this->totpCode($secret),
        ])->assertOk()
            ->assertJsonStructure(['token', 'user'])
            ->assertJsonPath('user.roles', ['HR']);
    }

    #[Test]
    public function wrong_code_is_rejected(): void
    {
        $hr = $this->makeUser('HR');
        $config = $this->configure($hr);
        $secret = $config['secret'];

        $login = $this->postJson('/api/auth/login', $this->loginPayload($hr));

        $this->postJson('/api/auth/mfa/verify', [
            'mfa_token' => $login->json('mfa_token'),
            'code' => '000000',
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('code');
    }

    #[Test]
    public function recovery_code_can_be_used_once(): void
    {
        $hr = $this->makeUser('HR');
        $config = $this->configure($hr);
        $recoveryCode = $config['recovery_codes'][0];

        $login = $this->postJson('/api/auth/login', $this->loginPayload($hr));

        $this->postJson('/api/auth/mfa/verify', [
            'mfa_token' => $login->json('mfa_token'),
            'recovery_code' => $recoveryCode,
        ])->assertOk()
            ->assertJsonStructure(['token']);

        $this->postJson('/api/auth/login', $this->loginPayload($hr))
            ->assertOk()
            ->assertJsonPath('mfa_setup_required', false);

        $this->postJson('/api/auth/mfa/verify', [
            'mfa_token' => $login->json('mfa_token'),
            'recovery_code' => $recoveryCode,
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('code');
    }

    #[Test]
    public function invalid_mfa_token_is_rejected(): void
    {
        $hr = $this->makeUser('HR');
        $this->configure($hr);

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
        $config = $this->configure($hr);
        $secret = $config['secret'];

        $login = $this->postJson('/api/auth/login', $this->loginPayload($hr));
        $token = $this->postJson('/api/auth/mfa/verify', [
            'mfa_token' => $login->json('mfa_token'),
            'code' => $this->totpCode($secret),
        ])->assertOk()->json('token');

        $this->withToken($token)->postJson('/api/auth/mfa/disable', [
            'password' => 'password',
            'code' => $this->totpCode($secret),
        ])->assertOk()
            ->assertJsonPath('message', 'Two-factor authentication disabled.');

        $this->assertDatabaseHas('users', ['id' => $hr->user->id, 'two_factor_confirmed_at' => null]);
        $this->assertDatabaseHas('audit_logs', ['action' => 'mfa.disabled', 'user_id' => $hr->user->id]);

        $this->postJson('/api/auth/login', $this->loginPayload($hr))
            ->assertOk()
            ->assertJsonPath('mfa_setup_required', true);
    }

    #[Test]
    public function disable_rejects_wrong_password_and_code(): void
    {
        $hr = $this->makeUser('HR');
        $config = $this->configure($hr);
        $secret = $config['secret'];
        $user = $hr->user->fresh();
        $token = $user->createToken('mobile')->plainTextToken;

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

    private function configure(Employee $employee): array
    {
        $login = $this->postJson('/api/auth/login', $this->loginPayload($employee));
        $setup = $this->postJson('/api/auth/mfa/enable', ['mfa_token' => $login->json('mfa_token')]);
        $secret = $setup->json('secret');

        $confirm = $this->postJson('/api/auth/mfa/confirm', [
            'mfa_token' => $setup->json('mfa_token'),
            'code' => $this->totpCode($secret),
        ]);

        return ['secret' => $secret, 'recovery_codes' => $confirm->json('recovery_codes')];
    }
}
