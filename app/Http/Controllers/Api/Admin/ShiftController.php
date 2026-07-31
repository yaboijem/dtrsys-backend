<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreShiftRequest;
use App\Http\Requests\UpdateShiftRequest;
use App\Http\Resources\ShiftResource;
use App\Models\Shift;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class ShiftController extends Controller
{
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

        return new ShiftResource($shift);
    }

    public function show(Shift $shift): ShiftResource
    {
        return new ShiftResource($shift);
    }

    public function update(UpdateShiftRequest $request, Shift $shift): ShiftResource
    {
        $shift->update($request->validated());

        return new ShiftResource($shift);
    }

    public function destroy(Shift $shift): JsonResponse
    {
        if ($shift->schedules()->exists()) {
            return response()->json([
                'message' => 'Cannot delete a shift that is still assigned to schedules.',
                'code' => 'shift_in_use',
            ], 422);
        }

        $shift->delete();

        return response()->json(['message' => 'Shift deleted.']);
    }
}
