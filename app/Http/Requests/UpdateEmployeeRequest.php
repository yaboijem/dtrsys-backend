<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateEmployeeRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
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
            'first_name' => ['sometimes', 'string', 'max:255'],
            'middle_name' => ['nullable', 'string', 'max:255'],
            'last_name' => ['sometimes', 'string', 'max:255'],
            'department' => ['sometimes', 'string', 'max:255'],
            'position' => ['sometimes', 'string', 'max:255'],
            'date_hired' => ['nullable', 'date'],
            'is_active' => ['boolean'],
            'device_name' => ['nullable', 'string', 'max:100'],
            'device_is_shared' => ['boolean'],
        ];
    }
}
