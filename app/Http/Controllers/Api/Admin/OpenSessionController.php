<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\AttendanceResource;
use App\Models\Employee;
use App\Services\AttendanceService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Carbon;

class OpenSessionController extends Controller
{
    public function __construct(
        private readonly AttendanceService $attendanceService,
    ) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        $perPage = $this->perPage($request);
        $page = max($request->integer('page', 1), 1);
        $sessions = $this->attendanceService->openSessions();

        return JsonResource::collection(new LengthAwarePaginator(
            array_values(array_slice($sessions, ($page - 1) * $perPage, $perPage)),
            count($sessions),
            $perPage,
            $page,
            [
                'path' => $request->url(),
                'query' => $request->query(),
            ],
        ));
    }

    public function close(Request $request, Employee $employee): JsonResponse
    {
        $data = $request->validate([
            'action' => ['required', 'in:break_out,time_out'],
            'notes' => ['nullable', 'string', 'max:500'],
            'closed_at' => ['nullable', 'date'],
        ]);

        $at = isset($data['closed_at']) ? Carbon::parse($data['closed_at']) : null;
        $punches = $this->attendanceService->adminOverride(
            $employee,
            $data['action'],
            $data['notes'] ?? null,
            $at,
        );

        return AttendanceResource::collection(collect($punches))->response();
    }
}
