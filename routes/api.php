<?php

use App\Http\Controllers\Api\Admin\AttendanceAdminController;
use App\Http\Controllers\Api\Admin\AuditLogController;
use App\Http\Controllers\Api\Admin\BranchController;
use App\Http\Controllers\Api\Admin\DashboardController;
use App\Http\Controllers\Api\Admin\DeviceChangeRequestController as AdminDeviceChangeRequestController;
use App\Http\Controllers\Api\Admin\EmployeeController;
use App\Http\Controllers\Api\Admin\FraudFlagController;
use App\Http\Controllers\Api\Admin\PayrollExportController;
use App\Http\Controllers\Api\Admin\ScheduleAdminController;
use App\Http\Controllers\Api\Admin\ShiftController;
use App\Http\Controllers\Api\AttendanceController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\DeviceChangeRequestController;
use App\Http\Controllers\Api\ScheduleController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::post('/auth/login', [AuthController::class, 'login'])->middleware('throttle:login');

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::get('/auth/me', [AuthController::class, 'me']);

    Route::get('/device/change-requests', [DeviceChangeRequestController::class, 'index']);
    Route::post('/device/change-requests', [DeviceChangeRequestController::class, 'store']);

    Route::post('/attendance/time-in', [AttendanceController::class, 'timeIn']);
    Route::post('/attendance/time-out', [AttendanceController::class, 'timeOut']);
    Route::get('/attendance/history', [AttendanceController::class, 'history']);
    Route::post('/attendance/sync', [AttendanceController::class, 'sync']);

    Route::get('/schedule', [ScheduleController::class, 'index']);
    Route::get('/schedule/today', [ScheduleController::class, 'today']);
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

Route::get('/user', function (Request $request) {
    return $request->user();
})->middleware('auth:sanctum');
