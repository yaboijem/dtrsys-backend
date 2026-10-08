<?php

use App\Http\Controllers\Api\Admin\AttendanceAdminController;
use App\Http\Controllers\Api\Admin\AuditLogController;
use App\Http\Controllers\Api\Admin\BranchController;
use App\Http\Controllers\Api\Admin\DashboardController;
use App\Http\Controllers\Api\Admin\DepartmentController;
use App\Http\Controllers\Api\Admin\EmployeeController;
use App\Http\Controllers\Api\Admin\FraudFlagController;
use App\Http\Controllers\Api\Admin\HomeLocationController as AdminHomeLocationController;
use App\Http\Controllers\Api\Admin\OpenSessionController;
use App\Http\Controllers\Api\Admin\PositionController;
use App\Http\Controllers\Api\Admin\SettingsController as AdminSettingsController;
use App\Http\Controllers\Api\AttendanceController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\ConsentController;
use App\Http\Controllers\Api\HomeLocationController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\PushSubscriptionController;
use App\Http\Controllers\Api\SettingsController;
use Illuminate\Support\Facades\Route;

Route::post('/auth/login', [AuthController::class, 'login'])->middleware('throttle:login');
Route::post('/auth/google', [AuthController::class, 'google'])->middleware('throttle:login');

Route::get('/login', function () {
    return response()->json([
        'message' => 'Unauthenticated. Please log in again.',
        'code' => 'unauthenticated',
    ], 401);
})->name('login');

Route::middleware(['auth:sanctum', 'throttle:api'])->group(function () {
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::get('/auth/me', [AuthController::class, 'me']);

    Route::middleware('throttle:attendance')->group(function () {
        Route::post('/attendance/time-in', [AttendanceController::class, 'timeIn']);
        Route::post('/attendance/time-out', [AttendanceController::class, 'timeOut']);
        Route::post('/attendance/break-in', [AttendanceController::class, 'breakIn']);
        Route::post('/attendance/break-out', [AttendanceController::class, 'breakOut']);
    });
    Route::post('/attendance/sync', [AttendanceController::class, 'sync'])
        ->middleware('throttle:attendance-sync');
    Route::get('/attendance/history', [AttendanceController::class, 'history']);
    Route::get('/attendance/session', [AttendanceController::class, 'session']);
    Route::get('/attendance/work', [AttendanceController::class, 'work']);

    Route::get('/settings', [SettingsController::class, 'show']);

    Route::get('/push/vapid-public-key', [PushSubscriptionController::class, 'publicKey']);
    Route::post('/push/subscribe', [PushSubscriptionController::class, 'store']);
    Route::delete('/push/subscribe', [PushSubscriptionController::class, 'destroy']);

    Route::get('/notifications', [NotificationController::class, 'index']);
    Route::get('/notifications/unread-count', [NotificationController::class, 'unreadCount']);
    Route::post('/notifications/{notification}/read', [NotificationController::class, 'markRead']);
    Route::post('/notifications/read-all', [NotificationController::class, 'markAllRead']);
    Route::delete('/notifications/{notification}', [NotificationController::class, 'destroy']);
    Route::delete('/notifications', [NotificationController::class, 'destroyAll']);

    Route::get('/employee/consent', [ConsentController::class, 'index']);
    Route::post('/employee/consent', [ConsentController::class, 'update']);

    Route::get('/home-location', [HomeLocationController::class, 'show']);
    Route::post('/home-location', [HomeLocationController::class, 'store']);
});

Route::middleware(['auth:sanctum', 'role:Super Admin|HR'])->prefix('admin')->group(function () {
    Route::get('/home-locations', [AdminHomeLocationController::class, 'index']);
    Route::patch('/home-locations/{homeLocation}', [AdminHomeLocationController::class, 'review']);

    Route::get('/audit-logs', [AuditLogController::class, 'index']);

    Route::get('/settings', [AdminSettingsController::class, 'show']);
    Route::patch('/settings', [AdminSettingsController::class, 'update']);

    Route::apiResource('branches', BranchController::class);
    Route::apiResource('employees', EmployeeController::class);

    Route::get('/open-sessions', [OpenSessionController::class, 'index']);
    Route::post('/open-sessions/{employee}/close', [OpenSessionController::class, 'close']);
});

Route::middleware(['auth:sanctum', 'role:Super Admin|HR|Branch Manager'])->prefix('admin')->group(function () {
    Route::get('/fraud-flags', [FraudFlagController::class, 'index']);
    Route::post('/fraud-flags/{fraudFlag}/review', [FraudFlagController::class, 'review']);
});

Route::middleware(['auth:sanctum', 'role:Super Admin|HR|Branch Manager|Department Head'])->prefix('admin')->group(function () {
    Route::get('/attendance', [AttendanceAdminController::class, 'index']);
    Route::get('/attendance/{attendance}/photo', [AttendanceAdminController::class, 'photo']);
    Route::get('/dashboard/summary', [DashboardController::class, 'summary']);
    Route::get('/dashboard/badges', [DashboardController::class, 'badges']);
    Route::apiResource('departments', DepartmentController::class);
    Route::apiResource('positions', PositionController::class);
});
