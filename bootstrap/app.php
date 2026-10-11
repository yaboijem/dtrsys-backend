<?php

use App\Exceptions\AttendanceConflictException;
use App\Exceptions\BreaksDisabledException;
use App\Exceptions\ConsentRequiredException;
use App\Exceptions\GpsAccuracyTooPoorException;
use App\Exceptions\GpsOutOfRangeException;
use App\Exceptions\HomeLocationRequiredException;
use App\Http\Middleware\AuthenticateFromCookie;
use App\Http\Middleware\TrustConfiguredProxies;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Cookie\Middleware\EncryptCookies;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Spatie\Permission\Exceptions\UnauthorizedException;
use Spatie\Permission\Middleware\RoleMiddleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->prepend(TrustConfiguredProxies::class);

        $middleware->api(prepend: [
            EncryptCookies::class,
            AuthenticateFromCookie::class,
        ]);

        $middleware->alias([
            'role' => RoleMiddleware::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->render(function (AuthenticationException $e) {
            return response()->json([
                'message' => 'Unauthenticated. Please log in again.',
                'code' => 'unauthenticated',
            ], 401);
        });

        $exceptions->render(function (UnauthorizedException $e) {
            return response()->json([
                'message' => 'You do not have permission to perform this action.',
                'code' => 'forbidden',
            ], 403);
        });

        $exceptions->render(function (AttendanceConflictException $e) {
            return response()->json([
                'message' => $e->getMessage(),
                'code' => 'attendance_conflict',
                'session' => $e->session,
            ], 409);
        });

        $exceptions->render(function (GpsOutOfRangeException $e) {
            return response()->json([
                'message' => $e->getMessage(),
                'code' => 'gps_out_of_range',
                'details' => $e->details,
            ], 422);
        });

        $exceptions->render(function (GpsAccuracyTooPoorException $e) {
            return response()->json([
                'message' => $e->getMessage(),
                'code' => 'gps_accuracy_too_poor',
                'details' => [
                    'accuracy_meters' => $e->accuracyMeters,
                    'ceiling_meters' => $e->ceilingMeters,
                ],
            ], 422);
        });

        $exceptions->render(function (HomeLocationRequiredException $e) {
            return response()->json([
                'message' => $e->getMessage(),
                'code' => $e->errorCode,
            ], 422);
        });

        $exceptions->render(function (BreaksDisabledException $e) {
            return response()->json([
                'message' => $e->getMessage(),
                'code' => 'breaks_disabled',
            ], 422);
        });

        $exceptions->render(function (ConsentRequiredException $e) {
            return response()->json([
                'message' => $e->getMessage(),
                'code' => $e->errorCode,
            ], 422);
        });
    })->create();
