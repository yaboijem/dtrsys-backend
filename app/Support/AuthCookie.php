<?php

namespace App\Support;

use Symfony\Component\HttpFoundation\Cookie;

class AuthCookie
{
    public const NAME = 'dtr_token';

    public static function make(string $token): Cookie
    {
        $minutes = (int) config('sanctum.expiration', 720);

        return cookie(
            self::NAME,
            $token,
            $minutes > 0 ? $minutes : 720,
            '/',
            config('session.domain'),
            self::secure(),
            true,
            false,
            config('session.same_site', 'lax') ?: 'lax',
        );
    }

    public static function forget(): Cookie
    {
        return cookie()->forget(self::NAME, '/', config('session.domain'));
    }

    private static function secure(): ?bool
    {
        $secure = config('session.secure');

        if ($secure === null || $secure === '') {
            return null;
        }

        return filter_var($secure, FILTER_VALIDATE_BOOLEAN);
    }
}
