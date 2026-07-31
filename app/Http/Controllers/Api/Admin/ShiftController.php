<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreShiftRequest;
use App\Http\Requests\UpdateShiftRequest;
use App\Http\Resources\ShiftResource;
use App\Models\Shift;
use App\Services\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class ShiftController extends Controller
{
    public function __construct(
        private readonly AuditService $auditService,
    ) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        $shifts = Shift::query()
            ->when($request->filled('is_active'), fn ($q) => $q->where('is_active', $request->boolean('is_active')))
            ->orderBy('start_time')
            ->paginate(min($request->integer('per_page', 20), 100));

        return ShiftResource::collection($shifts);
    }

    public function store(StoreShiftRequest $request): ShiftResource
    {
        $shift = Shift::create($request->validated());

        $this->auditService->created($request->user(), 'shift.created', $shift);

        return new ShiftResource($shift);
    }

    public function show(Shift $shift): ShiftResource
    {
        return new ShiftResource($shift);
    }

    public function update(UpdateShiftRequest $request, Shift $shift): ShiftResource
    {
        $before = $this->auditService->valuesOf($shift);

        $shift->update($request->validated());

        $this->auditService->changes($request->user(), 'shift.updated', $shift, $before);

        return new ShiftResource($shift);
    }

    public function destroy(Request $request, Shift $shift): JsonResponse
    {
        if ($shift->schedules()->exists()) {
            return response()->json([
                'message' => 'Cannot delete a shift that is still assigned to schedules.',
                'code' => 'shift_in_use',
            ], 422);
        }

        $shift->delete();

        $this->auditService->deleted($request->user(), 'shift.deleted', $shift);

        return response()->json(['message' => 'Shift deleted.']);
    }
}
