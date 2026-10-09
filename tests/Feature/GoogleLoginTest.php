<?php

namespace Tests\Feature;

use App\Exceptions\InvalidGoogleIdToken;
use App\Models\Employee;
use App\Models\User;
use App\Services\GoogleIdTokenVerifier;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class GoogleLoginTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.google.client_id' => 'test-client-id']);
    }

    public function test_verified_email_signs_in_and_registers_device(): void
    {
        $employee = Employee::factory()->create();
        $employee->user->update(['email' => 'Emp@Company.com']);
        $this->bindClaims([
            'email' => 'emp@company.com',
            'email_verified' => true,
            'sub' => 'sub-1',
        ]);

        $response = $this->postJson('/api/auth/google', $this->payload());

        $response->assertOk()
            ->assertJsonPath('message', 'Login successful.')
            ->assertJsonPath('user.email', 'Emp@Company.com')
            ->assertJsonPath('user.employee.id', $employee->id);
        $response->assertCookie('dtr_token');
        $this->assertArrayNotHasKey('token', $response->json());
        $this->assertDatabaseHas('personal_access_tokens', [
            'tokenable_id' => $employee->user->id,
            'name' => 'mobile',
        ]);
        $this->assertDatabaseHas('devices', [
            'employee_id' => $employee->id,
            'device_id' => 'google-device-1',
            'platform' => 'web',
            'app_version' => '1.0.0',
        ]);
        $this->assertDatabaseCount('users', 1);
    }

    public function test_unknown_email_does_not_create_a_user(): void
    {
        $this->bindClaims([
            'email' => 'missing@company.com',
            'email_verified' => true,
            'sub' => 'sub-1',
        ]);

        $response = $this->postJson('/api/auth/google', $this->payload());

        $response->assertStatus(422)
            ->assertJsonPath('errors.email.0', 'No employee account uses this Google email.');
        $this->assertSame(['email'], array_keys($response->json('errors')));
        $this->assertDatabaseCount('users', 0);
        $this->assertDatabaseCount('personal_access_tokens', 0);
    }

    public function test_inactive_user_is_rejected(): void
    {
        $employee = Employee::factory()->create();
        $employee->user->update(['email' => 'inactive@company.com', 'is_active' => false]);
        $this->bindClaims([
            'email' => 'inactive@company.com',
            'email_verified' => true,
            'sub' => 'sub-1',
        ]);

        $this->postJson('/api/auth/google', $this->payload())
            ->assertStatus(422)
            ->assertJsonPath('errors.email.0', 'Your account has been deactivated. Contact HR.');
        $this->assertDatabaseCount('personal_access_tokens', 0);
    }

    public function test_user_without_employee_profile_is_rejected(): void
    {
        User::factory()->create(['email' => 'solo@company.com']);
        $this->bindClaims([
            'email' => 'solo@company.com',
            'email_verified' => true,
            'sub' => 'sub-1',
        ]);

        $this->postJson('/api/auth/google', $this->payload())
            ->assertStatus(422)
            ->assertJsonPath('errors.email.0', 'No employee profile is linked to this account.');
        $this->assertDatabaseCount('personal_access_tokens', 0);
    }

    public function test_unverified_google_email_does_not_query_users(): void
    {
        $employee = Employee::factory()->create();
        $employee->user->update(['email' => 'emp@company.com']);
        $this->bindClaims([
            'email' => 'emp@company.com',
            'email_verified' => false,
            'sub' => 'sub-1',
        ]);
        DB::flushQueryLog();
        DB::enableQueryLog();

        $response = $this->postJson('/api/auth/google', $this->payload());

        $response->assertStatus(422)
            ->assertJsonPath('errors.email.0', 'Google sign-in failed. Try again.');
        $usersQueries = array_filter(
            array_column(DB::getQueryLog(), 'query'),
            fn (string $sql) => preg_match('/\busers\b/i', $sql) === 1,
        );
        $this->assertSame([], array_values($usersQueries));
        $this->assertDatabaseCount('personal_access_tokens', 0);
    }

    public function test_invalid_token_is_rejected(): void
    {
        $this->app->instance(GoogleIdTokenVerifier::class, new class implements GoogleIdTokenVerifier
        {
            public function verify(string $idToken): array
            {
                throw new InvalidGoogleIdToken('bad');
            }
        });

        $response = $this->postJson('/api/auth/google', $this->payload());

        $response->assertStatus(422)
            ->assertJsonPath('errors.id_token.0', 'Google sign-in failed. Try again.');
        $this->assertSame(['id_token'], array_keys($response->json('errors')));
    }

    public function test_missing_client_id_does_not_call_the_verifier(): void
    {
        config(['services.google.client_id' => '']);
        $this->app->instance(GoogleIdTokenVerifier::class, new class implements GoogleIdTokenVerifier
        {
            public function verify(string $idToken): array
            {
                throw new \RuntimeException('verifier should not be called');
            }
        });

        $this->postJson('/api/auth/google', $this->payload())
            ->assertStatus(422)
            ->assertJsonPath('errors.id_token.0', 'Google sign-in is not configured.');
    }

    private function payload(): array
    {
        return [
            'id_token' => 'test-id-token',
            'device_id' => 'google-device-1',
            'platform' => 'web',
            'app_version' => '1.0.0',
        ];
    }

    private function bindClaims(array $claims): void
    {
        $this->app->instance(GoogleIdTokenVerifier::class, new class($claims) implements GoogleIdTokenVerifier
        {
            public function __construct(private array $claims) {}

            public function verify(string $idToken): array
            {
                return $this->claims;
            }
        });
    }
}
