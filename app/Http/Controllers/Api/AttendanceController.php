<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\SyncAttendanceRequest;
use App\Http\Requests\TimePunchRequest;
use App\Http\Resources\AttendanceResource;
use App\Models\Attendance;
use App\Services\AttendanceService;
use App\Services\SyncService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class AttendanceController extends Controller
{
    public function __construct(
        private readonly AttendanceService $attendanceService,
        private readonly SyncService $syncService,
    ) {}

    public function timeIn(TimePunchRequest $request): JsonResponse
    {
        $attendance = $this->attendanceService->timeIn($request->user(), $request->validated());

        return (new AttendanceResource($attendance))
            ->response()
            ->setStatusCode(201);
    }

    public function timeOut(TimePunchRequest $request): AttendanceResource
    {
        $attendance = $this->attendanceService->timeOut($request->user(), $request->validated());

        return new AttendanceResource($attendance);
    }

    public function history(Request $request): AnonymousResourceCollection
    {
        $query = Attendance::with(['branch', 'photo', 'gpsLocation', 'fraudFlags'])
            ->where('employee_id', $request->user()->employee->id)
            ->when($request->filled('from'), fn ($q) => $q->whereDate('timestamp', '>=', $request->input('from')))
            ->when($request->filled('to'), fn ($q) => $q->whereDate('timestamp', '<=', $request->input('to')))
            ->when($request->filled('type'), fn ($q) => $q->where('type', $request->input('type')))
            ->latest('timestamp');

        return AttendanceResource::collection($query->paginate(min($request->integer('per_page', 20), 100)));
    }

    public function sync(SyncAttendanceRequest $request): JsonResponse
    {
        $result = $this->syncService->sync(
            $request->user(),
            $request->input('records'),
            $request->input('device_id'),
        );

        return response()->json([
            'message' => $result['failed'] > 0 ? 'Sync completed with some failures.' : 'Sync completed.',
            'synced' => $result['synced'],
            'failed' => $result['failed'],
            'duplicates' => $result['duplicates'],
            'records' => $result['records'],
        ]);
    }
}
