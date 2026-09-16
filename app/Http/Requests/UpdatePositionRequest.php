<?php

namespace App\Http\Requests;

use App\Models\Position;
use Illuminate\Foundation\Http\FormRequest;

class UpdatePositionRequest extends FormRequest
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
        $ignoreId = $this->route('position')?->id;

        return [
            'name' => [
                'sometimes',
                'string',
                'max:255',
                function (string $attribute, mixed $value, \Closure $fail) use ($ignoreId) {
                    $exists = Position::whereRaw('LOWER(name) = ?', [mb_strtolower((string) $value)])
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
