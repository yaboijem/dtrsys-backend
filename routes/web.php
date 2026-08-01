<?php

use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

if (config('app.debug')) {
    Route::get('/dev/otp/{employeeId}', function (string $employeeId) {
        $secret = App\Models\User::where('employee_id', $employeeId)->value('two_factor_secret');

        if (! $secret) {
            return response()->json(['code' => null, 'message' => 'No TOTP secret configured for this account.'], 404);
        }

        return response()->json(['code' => (new PragmaRX\Google2FA\Google2FA)->getCurrentOtp($secret)]);
    });
}
