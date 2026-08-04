<?php

use Illuminate\Support\Facades\Route;

if (config('app.debug')) {
    Route::get('/dev/otp/{employeeId}', function (string $employeeId) {
        $secret = App\Models\User::where('employee_id', $employeeId)->value('two_factor_secret');

        if (! $secret) {
            return response()->json(['code' => null, 'message' => 'No TOTP secret configured for this account.'], 404);
        }

        return response()->json(['code' => (new PragmaRX\Google2FA\Google2FA)->getCurrentOtp($secret)]);
    });
}

$servePortal = function () {
    $path = public_path('index.html');

    abort_unless(is_file($path), 503, 'Portal has not been deployed. Run: node scripts/deploy-portal.mjs');

    return response()->file($path, [
        'Content-Type' => 'text/html; charset=UTF-8',
        'Cache-Control' => 'no-cache',
    ]);
};

// Employee PWA SPA — static files under public/ are served by the web server first.
Route::get('/{any?}', $servePortal)->where('any', '.*');
