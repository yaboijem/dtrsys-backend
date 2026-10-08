<?php

namespace App\Services;

use App\Exceptions\InvalidGoogleIdToken;
use Google\Auth\AccessToken;
use Throwable;

class GoogleAuthIdTokenVerifier implements GoogleIdTokenVerifier
{
    public function __construct(
        private readonly AccessToken $accessToken,
        private readonly string $clientId,
    ) {}

    public function verify(string $idToken): array
    {
        try {
            $payload = $this->accessToken->verify($idToken, [
                'audience' => $this->clientId,
                'throwException' => true,
            ]);
        } catch (Throwable $e) {
            throw new InvalidGoogleIdToken('Google sign-in failed. Try again.', previous: $e);
        }

        if (! is_array($payload)) {
            throw new InvalidGoogleIdToken('Google sign-in failed. Try again.');
        }

        $iss = (string) ($payload['iss'] ?? '');
        if (! in_array($iss, ['accounts.google.com', 'https://accounts.google.com'], true)) {
            throw new InvalidGoogleIdToken('Google sign-in failed. Try again.');
        }

        $email = trim((string) ($payload['email'] ?? ''));
        if ($email === '') {
            throw new InvalidGoogleIdToken('Google sign-in failed. Try again.');
        }

        $verified = $payload['email_verified'] ?? false;

        return [
            'email' => $email,
            'email_verified' => $verified === true || $verified === 'true',
            'sub' => (string) ($payload['sub'] ?? ''),
        ];
    }
}
