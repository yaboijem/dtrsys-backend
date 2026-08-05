<?php

use App\Exceptions\AttendanceConflictException;
use App\Exceptions\DeviceBlockedException;
use App\Exceptions\FaceVerificationFailedException;
use App\Exceptions\GpsOutOfRangeException;
use Illuminate\Auth\AuthenticationException;
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
        // Render / reverse proxies terminate TLS; trust all proxies so HTTPS URLs and client IP work.
        $middleware->trustProxies(at: '*');

        $middleware->alias([
            'role' => RoleMiddleware::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->render(function (DeviceBlockedException $e) {
            return response()->json([
                'message' => $e->getMessage(),
                'code' => 'device_not_registered',
                'pending_device_change_request' => $e->hasPendingRequest,
            ], 403);
        });

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
            ], 409);
        });

        $exceptions->render(function (GpsOutOfRangeException $e) {
            return response()->json([
                'message' => $e->getMessage(),
                'code' => 'gps_out_of_range',
                'details' => $e->details,
            ], 422);
        });

        $exceptions->render(function (FaceVerificationFailedException $e) {
            return response()->json([
                'message' => $e->getMessage(),
                'code' => 'face_verification_failed',
                'details' => $e->details,
            ], 422);
        });
    })->create();
