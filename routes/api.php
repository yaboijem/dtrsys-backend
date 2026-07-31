<?php

use App\Http\Controllers\Api\Admin\DeviceChangeRequestController as AdminDeviceChangeRequestController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\DeviceChangeRequestController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::post('/auth/login', [AuthController::class, 'login'])->middleware('throttle:login');

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::get('/auth/me', [AuthController::class, 'me']);

    Route::get('/device/change-requests', [DeviceChangeRequestController::class, 'index']);
    Route::post('/device/change-requests', [DeviceChangeRequestController::class, 'store']);
});

Route::middleware(['auth:sanctum', 'role:Super Admin|HR'])->prefix('admin')->group(function () {
    Route::get('/device-change-requests', [AdminDeviceChangeRequestController::class, 'index']);
    Route::patch('/device-change-requests/{deviceChangeRequest}', [AdminDeviceChangeRequestController::class, 'review']);
});

Route::get('/user', function (Request $request) {
    return $request->user();
})->middleware('auth:sanctum');
