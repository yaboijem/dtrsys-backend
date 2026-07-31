<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreBranchRequest;
use App\Http\Requests\UpdateBranchRequest;
use App\Http\Resources\BranchResource;
use App\Models\Branch;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class BranchController extends Controller
{
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

        return new BranchResource($branch->loadCount('employees'));
    }

    public function show(Branch $branch): BranchResource
    {
        return new BranchResource($branch->loadCount('employees'));
    }

    public function update(UpdateBranchRequest $request, Branch $branch): BranchResource
    {
        $branch->update($request->validated());

        return new BranchResource($branch->loadCount('employees'));
    }

    public function destroy(Branch $branch): JsonResponse
    {
        if ($branch->employees()->exists()) {
            return response()->json([
                'message' => 'Cannot delete a branch that still has employees assigned.',
                'code' => 'branch_has_employees',
            ], 422);
        }

        $branch->delete();

        return response()->json(['message' => 'Branch deleted.']);
    }
}
