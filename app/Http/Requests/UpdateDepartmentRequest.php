<?php

namespace App\Http\Requests;

use App\Models\Department;
use Illuminate\Foundation\Http\FormRequest;

class UpdateDepartmentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        if ($this->has('name')) {
            $this->merge(['name' => trim((string) $this->input('name'))]);
        }
    }

    public function rules(): array
    {
        $ignoreId = $this->route('department')?->id;

        return [
            'name' => [
                'sometimes',
                'string',
                'max:255',
                function (string $attribute, mixed $value, \Closure $fail) use ($ignoreId) {
                    $exists = Department::whereRaw('LOWER(name) = ?', [mb_strtolower((string) $value)])
                        ->when($ignoreId, fn ($q) => $q->where('id', '!=', $ignoreId))
                        ->exists();
                    if ($exists) {
                        $fail('The name has already been taken.');
                    }
                },
            ],
        ];
    }
}
