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
            ->with(['user.roles', 'branch', 'devices', 'department', 'position'])
            ->when($request->filled('search'), function ($q) use ($request) {
                $search = trim((string) $request->input('search'));
                $terms = preg_split('/\s+/', $search, -1, PREG_SPLIT_NO_EMPTY) ?: [];

                $q->where(function ($q) use ($search, $terms) {
                    $q->where('first_name', 'like', "%{$search}%")
                        ->orWhere('middle_name', 'like', "%{$search}%")
                        ->orWhere('last_name', 'like', "%{$search}%")
                        ->orWhereHas('user', function ($q) use ($search) {
                            $q->where('employee_id', 'like', "%{$search}%")
                                ->orWhere('name', 'like', "%{$search}%")
                                ->orWhere('email', 'like', "%{$search}%");
                        });

                    // Multi-word names: every token must hit a name part (e.g. "Juan Dela Cruz")
                    if (count($terms) > 1) {
                        $q->orWhere(function ($q) use ($terms) {
                            foreach ($terms as $term) {
                                $q->where(function ($q) use ($term) {
                                    $q->where('first_name', 'like', "%{$term}%")
                                        ->orWhere('middle_name', 'like', "%{$term}%")
                                        ->orWhere('last_name', 'like', "%{$term}%")
                                        ->orWhereHas('user', function ($q) use ($term) {
                                            $q->where('employee_id', 'like', "%{$term}%")
                                                ->orWhere('name', 'like', "%{$term}%");
                                        });
                                });
                            }
                        });
                    }
                });
            })
            ->when($request->filled('branch_id'), fn ($q) => $q->where('branch_id', $request->integer('branch_id')))
            ->when($request->filled('department_id'), fn ($q) => $q->where('department_id', $request->integer('department_id')))
            ->when($request->filled('is_active'), function ($q) use ($request) {
                $active = filter_var($request->input('is_active'), FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
                if ($active === null) {
                    return;
                }
                $q->whereHas('user', fn ($uq) => $uq->where('is_active', $active));
            })
            ->orderBy('last_name')
            ->paginate($this->perPage($request));

        return EmployeeResource::collection($employees);
    }

    public function store(StoreEmployeeRequest $request): EmployeeResource
    {
        $employee = DB::transaction(function () use ($request) {
            $user = User::create([
                'employee_id' => $request->input('employee_id'),
                'name' => $this->composeName(
                    $request->input('first_name'),
                    $request->input('middle_name'),
                    $request->input('last_name'),
                ),
                'email' => $request->input('email'),
                'password' => $request->input('password'),
                'is_active' => $request->boolean('is_active', true),
            ]);

            $user->syncRoles([$request->input('role')]);

            return Employee::create([
                'user_id' => $user->id,
                'branch_id' => $request->integer('branch_id'),
                'work_arrangement' => $request->input('work_arrangement', 'onsite'),
                'first_name' => $request->input('first_name'),
                'middle_name' => $request->input('middle_name'),
                'last_name' => $request->input('last_name'),
                'department_id' => $request->integer('department_id'),
                'position_id' => $request->integer('position_id'),
                'date_hired' => $request->input('date_hired'),
            ]);
        });

        $this->auditService->created($request->user(), 'employee.created', $employee);

        return new EmployeeResource($employee->load(['user.roles', 'branch', 'department', 'position']));
    }

    public function show(Employee $employee): EmployeeResource
    {
        return new EmployeeResource($employee->load(['user.roles', 'branch', 'devices', 'department', 'position']));
    }

    public function update(UpdateEmployeeRequest $request, Employee $employee): EmployeeResource
    {
        $employee = DB::transaction(function () use ($request, $employee) {
            $securityFieldsChanged = false;

            $userUpdate = [
                'employee_id' => $request->input('employee_id', $employee->user->employee_id),
                'name' => $this->composeName(
                    $request->input('first_name', $employee->first_name),
                    $request->has('middle_name') ? $request->input('middle_name') : $employee->middle_name,
                    $request->input('last_name', $employee->last_name),
                ),
                'email' => $request->input('email', $employee->user->email),
                'is_active' => $request->boolean('is_active', $employee->user->is_active),
            ];

            foreach (['employee_id', 'email', 'is_active'] as $field) {
                if ($userUpdate[$field] != $employee->user->{$field}) {
                    $securityFieldsChanged = true;
                }
            }

            $employee->user->update($userUpdate);

            if ($request->filled('password')) {
                $employee->user->update(['password' => $request->input('password')]);
                $securityFieldsChanged = true;
            }

            if ($request->filled('role') && $request->input('role') !== $employee->user->getRoleNames()->first()) {
                $employee->user->syncRoles([$request->input('role')]);
                $securityFieldsChanged = true;
            }

            if ($securityFieldsChanged) {
                $employee->user->tokens()->delete();
            }

            $before = $this->auditService->valuesOf($employee);

            $employee->update($request->only([
                'branch_id',
                'work_arrangement',
                'first_name',
                'middle_name',
                'last_name',
                'department_id',
                'position_id',
                'date_hired',
            ]));

            $this->auditService->changes($request->user(), 'employee.updated', $employee, $before);

            $device = $employee->devices()->where('is_active', true)->first();

            if ($device && ($request->has('device_name') || $request->has('device_is_shared'))) {
                $deviceUpdate = [];

                if ($request->has('device_name')) {
                    $deviceUpdate['name'] = $request->input('device_name') ?: null;
                }

                if ($request->has('device_is_shared')) {
                    $deviceUpdate['is_shared'] = $request->boolean('device_is_shared');
                }

                $oldDevice = ['name' => $device->name, 'is_shared' => $device->is_shared];
                $device->update($deviceUpdate);

                $this->auditService->record(
                    $request->user(),
                    'device.updated',
                    $device,
                    $oldDevice,
                    ['name' => $device->name, 'is_shared' => $device->is_shared],
                );
            }

            return $employee;
        });

        $this->auditService->changes($request->user(), 'employee.updated', $employee);

        return new EmployeeResource($employee->load(['user.roles', 'branch', 'devices', 'department', 'position']));
    }

    public function destroy(Request $request, Employee $employee): JsonResponse
    {
        $employee->user->update(['is_active' => false]);

        $employee->user->tokens()->delete();

        $this->auditService->record(
            $request->user(),
            'employee.deactivated',
            $employee,
            null,
            ['is_active' => false],
        );

        return response()->json(['message' => 'Employee account deactivated.']);
    }

    private function composeName(string $firstName, ?string $middleName, string $lastName): string
    {
        return trim(implode(' ', array_filter(
            [$firstName, $middleName, $lastName],
            fn ($part) => $part !== null && $part !== '',
        )));
    }
}
