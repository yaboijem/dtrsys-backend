<?php

namespace Tests\Unit;

use App\Exceptions\InvalidGoogleIdToken;
use App\Services\GoogleAuthIdTokenVerifier;
use Google\Auth\AccessToken;
use Mockery;
use Tests\TestCase;

class GoogleAuthIdTokenVerifierTest extends TestCase
{
    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    public function test_verify_returns_normalized_claims(): void
    {
        $accessToken = Mockery::mock(AccessToken::class);
        $accessToken->shouldReceive('verify')
            ->once()
            ->with('token-1', Mockery::on(function (array $options): bool {
                return $options['audience'] === 'client-id'
                    && $options['throwException'] === true
                    && ! array_key_exists('issuer', $options);
            }))
            ->andReturn([
                'email' => 'Emp@Company.com',
                'email_verified' => 'true',
                'sub' => 'sub-1',
                'iss' => 'accounts.google.com',
            ]);

        $claims = (new GoogleAuthIdTokenVerifier($accessToken, 'client-id'))->verify('token-1');

        $this->assertSame('Emp@Company.com', $claims['email']);
        $this->assertTrue($claims['email_verified']);
        $this->assertSame('sub-1', $claims['sub']);
    }

    public function test_verify_normalizes_boolean_false_as_unverified(): void
    {
        $verifier = new GoogleAuthIdTokenVerifier($this->accessTokenReturning([
            'email' => 'a@b.com',
            'email_verified' => false,
            'sub' => 'sub-1',
            'iss' => 'https://accounts.google.com',
        ]), 'client-id');

        $claims = $verifier->verify('token-1');

        $this->assertFalse($claims['email_verified']);
    }

    public function test_verify_throws_for_bad_issuer(): void
    {
        $verifier = new GoogleAuthIdTokenVerifier($this->accessTokenReturning([
            'email' => 'a@b.com',
            'email_verified' => true,
            'sub' => 'sub-1',
            'iss' => 'https://evil.example',
        ]), 'client-id');

        $this->expectException(InvalidGoogleIdToken::class);

        $verifier->verify('token-1');
    }

    public function test_verify_throws_when_email_is_missing(): void
    {
        $verifier = new GoogleAuthIdTokenVerifier($this->accessTokenReturning([
            'email_verified' => true,
            'iss' => 'https://accounts.google.com',
        ]), 'client-id');

        $this->expectException(InvalidGoogleIdToken::class);

        $verifier->verify('token-1');
    }

    public function test_verify_wraps_library_errors(): void
    {
        $libraryError = Mockery::mock(AccessToken::class);
        $libraryError->shouldReceive('verify')->andThrow(new \UnexpectedValueException('nope'));
        $verifier = new GoogleAuthIdTokenVerifier($libraryError, 'client-id');

        $this->expectException(InvalidGoogleIdToken::class);

        $verifier->verify('token-1');
    }

    private function accessTokenReturning(array $payload): AccessToken
    {
        $accessToken = Mockery::mock(AccessToken::class);
        $accessToken->shouldReceive('verify')->andReturn($payload);

        return $accessToken;
    }
}
