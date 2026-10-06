<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\StorePositionRequest;
use App\Http\Requests\UpdatePositionRequest;
use App\Http\Resources\PositionResource;
use App\Models\Position;
use App\Services\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class PositionController extends Controller
{
    public function __construct(
        private readonly AuditService $auditService,
    ) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        $positions = Position::query()
            ->withCount('employees')
            ->when($request->filled('search'), function ($q) use ($request) {
                $search = $request->input('search');
                $q->where('name', 'like', "%{$search}%");
            })
            ->orderBy('name')
            ->paginate($this->perPage($request));

        return PositionResource::collection($positions);
    }

    public function store(StorePositionRequest $request): PositionResource
    {
        $position = Position::create($request->validated());

        $this->auditService->created($request->user(), 'position.created', $position);

        return new PositionResource($position->loadCount('employees'));
    }

    public function show(Position $position): PositionResource
    {
        return new PositionResource($position->loadCount('employees'));
    }

    public function update(UpdatePositionRequest $request, Position $position): PositionResource
    {
        $before = $this->auditService->valuesOf($position);

        $position->update($request->validated());

        $this->auditService->changes($request->user(), 'position.updated', $position, $before);

        return new PositionResource($position->loadCount('employees'));
    }

    public function destroy(Request $request, Position $position): JsonResponse
    {
        $count = $position->employees()->count();
        if ($count > 0) {
            return response()->json([
                'message' => "Cannot delete: {$count} employees still use this position.",
                'code' => 'position_has_employees',
            ], 422);
        }

        $position->delete();

        $this->auditService->deleted($request->user(), 'position.deleted', $position);

        return response()->json(['message' => 'Position deleted.']);
    }
}
