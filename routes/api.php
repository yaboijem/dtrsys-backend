<?php

use App\Http\Controllers\Api\Admin\AttendanceAdminController;
use App\Http\Controllers\Api\Admin\AuditLogController;
use App\Http\Controllers\Api\Admin\BranchController;
use App\Http\Controllers\Api\Admin\DashboardController;
use App\Http\Controllers\Api\Admin\DeviceChangeRequestController as AdminDeviceChangeRequestController;
use App\Http\Controllers\Api\Admin\EmployeeController;
use App\Http\Controllers\Api\Admin\FraudFlagController;
use App\Http\Controllers\Api\Admin\PayrollExportController;
use App\Http\Controllers\Api\Admin\ReportExportController;
use App\Http\Controllers\Api\Admin\ScheduleAdminController;
use App\Http\Controllers\Api\Admin\ShiftController;
use App\Http\Controllers\Api\AttendanceController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\ConsentController;
use App\Http\Controllers\Api\DeviceChangeRequestController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\ScheduleController;
use Illuminate\Support\Facades\Route;

Route::post('/auth/login', [AuthController::class, 'login'])->middleware('throttle:login');
Route::post('/auth/mfa/verify', [AuthController::class, 'mfaVerify'])->middleware('throttle:mfa');
Route::post('/auth/mfa/enable', [AuthController::class, 'mfaEnable']);
Route::post('/auth/mfa/confirm', [AuthController::class, 'mfaConfirm']);

Route::get('/login', function () {
    return response()->json([
        'message' => 'Unauthenticated. Please log in again.',
        'code' => 'unauthenticated',
    ], 401);
})->name('login');

Route::middleware(['auth:sanctum', 'throttle:api'])->group(function () {
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::get('/auth/me', [AuthController::class, 'me']);
    Route::get('/auth/mfa/status', [AuthController::class, 'mfaStatus']);
    Route::post('/auth/mfa/disable', [AuthController::class, 'mfaDisable']);

    Route::get('/device/change-requests', [DeviceChangeRequestController::class, 'index']);
    Route::post('/device/change-requests', [DeviceChangeRequestController::class, 'store']);

    Route::middleware('throttle:attendance')->group(function () {
        Route::post('/attendance/time-in', [AttendanceController::class, 'timeIn']);
        Route::post('/attendance/time-out', [AttendanceController::class, 'timeOut']);
        Route::post('/attendance/break-in', [AttendanceController::class, 'breakIn']);
        Route::post('/attendance/break-out', [AttendanceController::class, 'breakOut']);
    });
    Route::post('/attendance/sync', [AttendanceController::class, 'sync'])
        ->middleware('throttle:attendance-sync');
    Route::get('/attendance/history', [AttendanceController::class, 'history']);

    Route::get('/schedule/today', [ScheduleController::class, 'today']);

    Route::get('/notifications', [NotificationController::class, 'index']);
    Route::get('/notifications/unread-count', [NotificationController::class, 'unreadCount']);
    Route::post('/notifications/{notification}/read', [NotificationController::class, 'markRead']);
    Route::post('/notifications/read-all', [NotificationController::class, 'markAllRead']);

    Route::get('/employee/consent', [ConsentController::class, 'index']);
    Route::post('/employee/consent', [ConsentController::class, 'update']);
});

Route::middleware(['auth:sanctum', 'role:Super Admin|HR'])->prefix('admin')->group(function () {
    Route::get('/device-change-requests', [AdminDeviceChangeRequestController::class, 'index']);
    Route::patch('/device-change-requests/{deviceChangeRequest}', [AdminDeviceChangeRequestController::class, 'review']);

    Route::get('/audit-logs', [AuditLogController::class, 'index']);

    Route::post('/schedules', [ScheduleAdminController::class, 'store']);
    Route::delete('/schedules/{schedule}', [ScheduleAdminController::class, 'destroy']);

    Route::apiResource('branches', BranchController::class);
    Route::apiResource('shifts', ShiftController::class);
    Route::apiResource('employees', EmployeeController::class);
    Route::post('/employees/{employee}/reference-photo', [EmployeeController::class, 'referencePhoto']);
    Route::get('/employees/{employee}/reference-photo', [EmployeeController::class, 'referencePhotoStream']);
});

Route::middleware(['auth:sanctum', 'role:Super Admin|HR|Branch Manager'])->prefix('admin')->group(function () {
    Route::get('/fraud-flags', [FraudFlagController::class, 'index']);
    Route::post('/fraud-flags/{fraudFlag}/review', [FraudFlagController::class, 'review']);
});

Route::middleware(['auth:sanctum', 'role:Super Admin|HR|Branch Manager|Department Head'])->prefix('admin')->group(function () {
    Route::get('/attendance', [AttendanceAdminController::class, 'index']);
    Route::get('/attendance/{attendance}/photo', [AttendanceAdminController::class, 'photo']);
    Route::get('/dashboard/summary', [DashboardController::class, 'summary']);
    Route::get('/schedules', [ScheduleAdminController::class, 'index']);
});

Route::middleware(['auth:sanctum', 'role:Super Admin|HR|Payroll Officer'])->prefix('admin')->group(function () {
    Route::get('/payroll-exports', [PayrollExportController::class, 'index']);
    Route::post('/payroll-exports', [PayrollExportController::class, 'store']);
    Route::get('/payroll-exports/{payrollExport}', [PayrollExportController::class, 'show']);
    Route::get('/payroll-exports/{payrollExport}/download', [PayrollExportController::class, 'download']);
});

Route::middleware(['auth:sanctum', 'role:Super Admin|HR|Payroll Officer|Branch Manager|Department Head'])->prefix('admin')->group(function () {
    Route::get('/reports', [ReportExportController::class, 'index']);
    Route::post('/reports', [ReportExportController::class, 'store']);
    Route::get('/reports/{reportExport}', [ReportExportController::class, 'show']);
    Route::get('/reports/{reportExport}/download', [ReportExportController::class, 'download']);
});

