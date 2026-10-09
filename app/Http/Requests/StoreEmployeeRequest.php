<?php

namespace App\Http\Requests;

use App\Http\Requests\Concerns\GuardsSuperAdminRole;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreEmployeeRequest extends FormRequest
{
    use GuardsSuperAdminRole;

    public const ROLES = [
        'Super Admin',
        'HR',
        'Branch Manager',
        'Department Head',
        'Employee',
    ];

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
        return [
            'employee_id' => ['required', 'string', 'max:30', Rule::unique('users', 'employee_id')],
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', Rule::unique('users', 'email')],
            'password' => ['required', 'string', 'min:8'],
            'role' => ['required', Rule::in(self::ROLES)],
            'branch_id' => ['required', 'integer', 'exists:branches,id'],
            'work_arrangement' => ['sometimes', Rule::in(['onsite', 'wfh', 'hybrid'])],
            'first_name' => ['required', 'string', 'max:255'],
            'middle_name' => ['nullable', 'string', 'max:255'],
            'last_name' => ['required', 'string', 'max:255'],
            'department_id' => ['required', 'integer', 'exists:departments,id'],
            'position_id' => ['required', 'integer', 'exists:positions,id'],
            'date_hired' => ['nullable', 'date'],
            'is_active' => ['boolean'],
        ];
    }
}
