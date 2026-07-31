<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreBranchRequest;
use App\Http\Requests\UpdateBranchRequest;
use App\Http\Resources\BranchResource;
use App\Models\Branch;
use App\Services\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class BranchController extends Controller
{
    public function __construct(
        private readonly AuditService $auditService,
    ) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        $branches = Branch::query()
            ->withCount('employees')
            ->when($request->filled('search'), function ($q) use ($request) {
                $search = $request->input('search');
                $q->where(fn ($q) => $q->where('name', 'like', "%{$search}%")->orWhere('code', 'like', "%{$search}%"));
            })
            ->when($request->filled('is_active'), fn ($q) => $q->where('is_active', $request->boolean('is_active')))
            ->orderBy('name')
            ->paginate(min($request->integer('per_page', 20), 100));

        return BranchResource::collection($branches);
    }

    public function store(StoreBranchRequest $request): BranchResource
    {
        $branch = Branch::create($request->validated());

        $this->auditService->created($request->user(), 'branch.created', $branch);

        return new BranchResource($branch->loadCount('employees'));
    }

    public function show(Branch $branch): BranchResource
    {
        return new BranchResource($branch->loadCount('employees'));
    }

    public function update(UpdateBranchRequest $request, Branch $branch): BranchResource
    {
        $before = $this->auditService->valuesOf($branch);

        $branch->update($request->validated());

        $this->auditService->changes($request->user(), 'branch.updated', $branch, $before);

        return new BranchResource($branch->loadCount('employees'));
    }

    public function destroy(Request $request, Branch $branch): JsonResponse
    {
        if ($branch->employees()->exists()) {
            return response()->json([
                'message' => 'Cannot delete a branch that still has employees assigned.',
                'code' => 'branch_has_employees',
            ], 422);
        }

        $branch->delete();

        $this->auditService->deleted($request->user(), 'branch.deleted', $branch);

        return response()->json(['message' => 'Branch deleted.']);
    }
}
