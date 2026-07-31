<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreScheduleRequest;
use App\Http\Resources\ScheduleAdminResource;
use App\Models\Schedule;
use App\Services\AuditService;
use App\Support\ScopesByRole;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class ScheduleAdminController extends Controller
{
    use ScopesByRole;

    public function __construct(
        private readonly AuditService $auditService,
    ) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        $query = Schedule::query()
            ->with(['employee.user', 'shift'])
            ->when($request->filled('employee_id'), fn ($q) => $q->where('employee_id', $request->integer('employee_id')))
            ->when($request->filled('shift_id'), fn ($q) => $q->where('shift_id', $request->integer('shift_id')))
            ->when($request->filled('branch_id'), fn ($q) => $q->whereHas('employee', fn ($q) => $q->where('branch_id', $request->integer('branch_id'))))
            ->when($request->filled('date'), fn ($q) => $q->whereDate('date', $request->input('date')))
            ->when($request->filled('date_from'), fn ($q) => $q->whereDate('date', '>=', $request->input('date_from')))
            ->when($request->filled('date_to'), fn ($q) => $q->whereDate('date', '<=', $request->input('date_to')));

        $this->applyRoleScope($query, $request->user(), 'employee.branch_id');

        $schedules = $query->latest('date')->paginate(min($request->integer('per_page', 20), 100));

        return ScheduleAdminResource::collection($schedules);
    }

    public function store(StoreScheduleRequest $request): ScheduleAdminResource
    {
        $existing = Schedule::where('employee_id', $request->integer('employee_id'))
            ->whereDate('date', $request->input('date'))
            ->first();

        if ($existing) {
            $before = $this->auditService->valuesOf($existing);
            $existing->update(['shift_id' => $request->integer('shift_id')]);
            $this->auditService->changes($request->user(), 'schedule.updated', $existing, $before);

            return new ScheduleAdminResource($existing->load(['employee.user', 'shift']));
        }

        $schedule = Schedule::create([
            'employee_id' => $request->integer('employee_id'),
            'shift_id' => $request->integer('shift_id'),
            'date' => $request->input('date'),
        ]);

        $this->auditService->created($request->user(), 'schedule.created', $schedule);

        return new ScheduleAdminResource($schedule->load(['employee.user', 'shift']));
    }

    public function destroy(Request $request, Schedule $schedule): JsonResponse
    {
        $schedule->delete();

        $this->auditService->deleted($request->user(), 'schedule.deleted', $schedule);

        return response()->json(['message' => 'Schedule removed.']);
    }
}
