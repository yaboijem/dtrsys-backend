<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreEmployeeRequest;
use App\Http\Requests\UpdateEmployeeRequest;
use App\Http\Resources\EmployeeResource;
use App\Models\Employee;
use App\Models\User;
use App\Services\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;

class EmployeeController extends Controller
{
    public function __construct(
        private readonly AuditService $auditService,
    ) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        $employees = Employee::query()
            ->with(['user.roles', 'branch'])
            ->when($request->filled('search'), function ($q) use ($request) {
                $search = $request->input('search');
                $q->where(function ($q) use ($search) {
                    $q->where('first_name', 'like', "%{$search}%")
                        ->orWhere('last_name', 'like', "%{$search}%")
                        ->orWhereHas('user', fn ($q) => $q->where('employee_id', 'like', "%{$search}%"));
                });
            })
            ->when($request->filled('branch_id'), fn ($q) => $q->where('branch_id', $request->integer('branch_id')))
            ->when($request->filled('department'), fn ($q) => $q->where('department', $request->input('department')))
            ->orderBy('last_name')
            ->paginate(min($request->integer('per_page', 20), 100));

        return EmployeeResource::collection($employees);
    }

    public function store(StoreEmployeeRequest $request): EmployeeResource
    {
        $employee = DB::transaction(function () use ($request) {
            $user = User::create([
                'employee_id' => $request->input('employee_id'),
                'name' => $request->input('name'),
                'email' => $request->input('email'),
                'password' => $request->input('password'),
                'is_active' => $request->boolean('is_active', true),
            ]);

            $user->syncRoles([$request->input('role')]);

            return Employee::create([
                'user_id' => $user->id,
                'branch_id' => $request->integer('branch_id'),
                'first_name' => $request->input('first_name'),
                'middle_name' => $request->input('middle_name'),
                'last_name' => $request->input('last_name'),
                'department' => $request->input('department'),
                'position' => $request->input('position'),
                'date_hired' => $request->input('date_hired'),
            ]);
        });

        $this->auditService->created($request->user(), 'employee.created', $employee);

        return new EmployeeResource($employee->load(['user.roles', 'branch']));
    }

    public function show(Employee $employee): EmployeeResource
    {
        return new EmployeeResource($employee->load(['user.roles', 'branch']));
    }

    public function update(UpdateEmployeeRequest $request, Employee $employee): EmployeeResource
    {
        $employee = DB::transaction(function () use ($request, $employee) {
            $employee->user->update([
                'employee_id' => $request->input('employee_id', $employee->user->employee_id),
                'name' => $request->input('name', $employee->user->name),
                'email' => $request->input('email', $employee->user->email),
                'is_active' => $request->boolean('is_active', $employee->user->is_active),
            ]);

            if ($request->filled('password')) {
                $employee->user->update(['password' => $request->input('password')]);
            }

            if ($request->filled('role')) {
                $employee->user->syncRoles([$request->input('role')]);
            }

            $before = $this->auditService->valuesOf($employee);

            $employee->update($request->only([
                'branch_id',
                'first_name',
                'middle_name',
                'last_name',
                'department',
                'position',
                'date_hired',
            ]));

            $this->auditService->changes($request->user(), 'employee.updated', $employee, $before);

            return $employee;
        });

        $this->auditService->changes($request->user(), 'employee.updated', $employee);

        return new EmployeeResource($employee->load(['user.roles', 'branch']));
    }

    public function destroy(Request $request, Employee $employee): JsonResponse
    {
        $employee->user->update(['is_active' => false]);

        $this->auditService->record(
            $request->user(),
            'employee.deactivated',
            $employee,
            null,
            ['is_active' => false],
        );

        return response()->json(['message' => 'Employee account deactivated.']);
    }
}
