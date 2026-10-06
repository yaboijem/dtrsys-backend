<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreDepartmentRequest;
use App\Http\Requests\UpdateDepartmentRequest;
use App\Http\Resources\DepartmentResource;
use App\Models\Department;
use App\Services\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class DepartmentController extends Controller
{
    public function __construct(
        private readonly AuditService $auditService,
    ) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        $departments = Department::query()
            ->withCount('employees')
            ->when($request->filled('search'), function ($q) use ($request) {
                $search = $request->input('search');
                $q->where('name', 'like', "%{$search}%");
            })
            ->orderBy('name')
            ->paginate($this->perPage($request));

        return DepartmentResource::collection($departments);
    }

    public function store(StoreDepartmentRequest $request): DepartmentResource
    {
        $department = Department::create($request->validated());

        $this->auditService->created($request->user(), 'department.created', $department);

        return new DepartmentResource($department->loadCount('employees'));
    }

    public function show(Department $department): DepartmentResource
    {
        return new DepartmentResource($department->loadCount('employees'));
    }

    public function update(UpdateDepartmentRequest $request, Department $department): DepartmentResource
    {
        $before = $this->auditService->valuesOf($department);

        $department->update($request->validated());

        $this->auditService->changes($request->user(), 'department.updated', $department, $before);

        return new DepartmentResource($department->loadCount('employees'));
    }

    public function destroy(Request $request, Department $department): JsonResponse
    {
        $count = $department->employees()->count();
        if ($count > 0) {
            return response()->json([
                'message' => "Cannot delete: {$count} employees still use this department.",
                'code' => 'department_has_employees',
            ], 422);
        }

        $department->delete();

        $this->auditService->deleted($request->user(), 'department.deleted', $department);

        return response()->json(['message' => 'Department deleted.']);
    }
}
