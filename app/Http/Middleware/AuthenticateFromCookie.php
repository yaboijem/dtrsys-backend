<?php

namespace App\Http\Middleware;

use App\Support\AuthCookie;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class AuthenticateFromCookie
{
    public function handle(Request $request, Closure $next): Response
    {
        $token = $request->cookie(AuthCookie::NAME);

        if (! $request->bearerToken() && is_string($token) && $token !== '') {
            $request->headers->set('Authorization', 'Bearer '.$token);
            $request->attributes->set('auth_via_cookie', true);
        }

        if ($request->attributes->get('auth_via_cookie')
            && ! in_array($request->method(), ['GET', 'HEAD', 'OPTIONS'], true)
            && $request->header('X-Requested-With') !== 'XMLHttpRequest') {
            return response()->json([
                'message' => 'This request was blocked.',
                'code' => 'csrf_blocked',
            ], 419);
        }

        return $next($request);
    }
}
