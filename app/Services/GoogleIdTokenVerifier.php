<?php

namespace App\Services;

interface GoogleIdTokenVerifier
{
    /**
     * @return array{email: string, email_verified: bool, sub: string}
     */
    public function verify(string $idToken): array;
}
