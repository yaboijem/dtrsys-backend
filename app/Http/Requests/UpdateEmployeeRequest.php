<?php

namespace App\Http\Requests;

use App\Http\Requests\Concerns\GuardsSuperAdminRole;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateEmployeeRequest extends FormRequest
{
    use GuardsSuperAdminRole;

    public function authorize(): bool
    {
        return true;
    }

    public function withValidator($validator): void
    {
        $this->guardSuperAdminRole($validator);
    }

    public function rules(): array
    {
        $employee = $this->route('employee');

        return [
            'employee_id' => ['sometimes', 'string', 'max:30', Rule::unique('users', 'employee_id')->ignore($employee?->user_id)],
            'name' => ['sometimes', 'string', 'max:255'],
            'email' => ['sometimes', 'email', 'max:255', Rule::unique('users', 'email')->ignore($employee?->user_id)],
            'password' => ['nullable', 'string', 'min:8'],
            'role' => ['sometimes', Rule::in(StoreEmployeeRequest::ROLES)],
            'branch_id' => ['sometimes', 'integer', 'exists:branches,id'],
            'work_arrangement' => ['sometimes', Rule::in(['onsite', 'wfh', 'hybrid'])],
            'first_name' => ['sometimes', 'string', 'max:255'],
            'middle_name' => ['nullable', 'string', 'max:255'],
            'last_name' => ['sometimes', 'string', 'max:255'],
            'department_id' => ['sometimes', 'integer', 'exists:departments,id'],
            'position_id' => ['sometimes', 'integer', 'exists:positions,id'],
            'date_hired' => ['nullable', 'date'],
            'is_active' => ['boolean'],
            'device_name' => ['nullable', 'string', 'max:100'],
            'device_is_shared' => ['boolean'],
        ];
    }
}
