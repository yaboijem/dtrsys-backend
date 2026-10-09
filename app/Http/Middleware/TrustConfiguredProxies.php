<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class TrustConfiguredProxies
{
    public function handle(Request $request, Closure $next): Response
    {
        $trusted = config('app.trusted_proxies', '*');
        $proxies = $trusted === '*' || $trusted === null || $trusted === ''
            ? ['*']
            : array_values(array_filter(array_map('trim', explode(',', (string) $trusted))));

        $request->setTrustedProxies($proxies, Request::HEADER_X_FORWARDED_FOR
            | Request::HEADER_X_FORWARDED_HOST
            | Request::HEADER_X_FORWARDED_PORT
            | Request::HEADER_X_FORWARDED_PROTO
            | Request::HEADER_X_FORWARDED_PREFIX
            | Request::HEADER_X_FORWARDED_AWS_ELB);

        return $next($request);
    }
}
