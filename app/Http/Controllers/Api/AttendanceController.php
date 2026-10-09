<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\BreakPunchRequest;
use App\Http\Requests\TimePunchRequest;
use App\Http\Resources\AttendanceResource;
use App\Models\Attendance;
use App\Services\AttendanceService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class AttendanceController extends Controller
{
    public function __construct(
        private readonly AttendanceService $attendanceService,
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

    public function breakIn(BreakPunchRequest $request): JsonResponse
    {
        $attendance = $this->attendanceService->breakIn($request->user(), $request->validated());

        return (new AttendanceResource($attendance))
            ->response()
            ->setStatusCode(201);
    }

    public function breakOut(BreakPunchRequest $request): JsonResponse
    {
        $attendance = $this->attendanceService->breakOut($request->user(), $request->validated());

        return (new AttendanceResource($attendance))->response();
    }

    public function session(Request $request): JsonResponse
    {
        $employee = $request->user()->employee;

        if (! $employee) {
            return response()->json([
                'message' => 'No employee record is linked to this account.',
                'code' => 'no_employee_record',
            ], 404);
        }

        return response()->json([
            'data' => $this->attendanceService->sessionFor($employee),
        ]);
    }

    public function work(Request $request): AnonymousResourceCollection|JsonResponse
    {
        $employee = $request->user()->employee;

        if (! $employee) {
            return response()->json([
                'message' => 'No employee record is linked to this account.',
                'code' => 'no_employee_record',
            ], 404);
        }

        return AttendanceResource::collection($this->attendanceService->latestWorkPunches($employee));
    }

    public function history(Request $request): AnonymousResourceCollection
    {
        $query = Attendance::with(['branch', 'photo', 'gpsLocation', 'fraudFlags'])
            ->where('employee_id', $request->user()->employee->id)
            ->when($request->filled('from'), fn ($q) => $q->whereDate('timestamp', '>=', $request->input('from')))
            ->when($request->filled('to'), fn ($q) => $q->whereDate('timestamp', '<=', $request->input('to')))
            ->when($request->filled('type'), fn ($q) => $q->where('type', $request->input('type')))
            ->latest('timestamp');

        return AttendanceResource::collection($query->paginate($this->perPage($request)));
    }
}
