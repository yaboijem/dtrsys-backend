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
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

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
        $records = json_decode($request->input('records'), true);

        if (! is_array($records)) {
            throw ValidationException::withMessages(['records' => 'records must be a valid JSON array.']);
        }

        Validator::make(['records' => $records], [
            'records' => ['required', 'array', 'min:1', 'max:100'],
            'records.*.client_uuid' => ['required', 'string', 'max:64'],
            'records.*.type' => ['required', 'string', 'in:time_in,time_out'],
            'records.*.timestamp' => ['required', 'date'],
            'records.*.latitude' => ['required', 'numeric', 'between:-90,90'],
            'records.*.longitude' => ['required', 'numeric', 'between:-180,180'],
            'records.*.accuracy_meters' => ['nullable', 'numeric', 'min:0'],
            'records.*.notes' => ['nullable', 'string', 'max:500'],
        ])->validate();

        $result = $this->syncService->sync(
            $request->user(),
            $records,
            $request->input('device_id'),
            $request->file('photos') ?? [],
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
