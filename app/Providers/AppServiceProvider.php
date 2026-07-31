<?php

namespace App\Providers;

use App\Models\Attendance;
use App\Observers\AttendanceObserver;
use App\Services\FaceVerificationService;
use App\Services\MockFaceVerificationService;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->bind(FaceVerificationService::class, MockFaceVerificationService::class);
    }

    public function boot(): void
    {
        Attendance::observe(AttendanceObserver::class);

        RateLimiter::for('login', function (Request $request) {
            $key = (string) $request->input('employee_id', $request->ip());

            return Limit::perMinute(5)->by('login:'.$key)->response(fn () => response()->json([
                'message' => 'Too many login attempts. Please try again in a minute.',
                'code' => 'too_many_attempts',
            ], 429));
        });

        RateLimiter::for('mfa', function (Request $request) {
            return Limit::perMinute(5)->by('mfa:'.$request->ip())->response(fn () => response()->json([
                'message' => 'Too many verification attempts. Please try again in a minute.',
                'code' => 'too_many_attempts',
            ], 429));
        });

        RateLimiter::for('attendance', function (Request $request) {
            $key = $request->user()?->employee_id ?? $request->ip();

            return Limit::perMinute(30)->by('attendance:'.$key)->response(fn () => response()->json([
                'message' => 'Too many attendance requests. Please slow down.',
                'code' => 'too_many_attempts',
            ], 429));
        });

        RateLimiter::for('api', function (Request $request) {
            $key = $request->user()?->employee_id ?? $request->ip();

            return Limit::perMinute(60)->by('api:'.$key)->response(fn () => response()->json([
                'message' => 'Too many requests. Please try again later.',
                'code' => 'too_many_attempts',
            ], 429));
        });
    }
}
