<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateShiftRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => ['sometimes', 'string', 'max:255'],
            'start_time' => ['sometimes', 'date_format:H:i:s'],
            'end_time' => ['sometimes', 'date_format:H:i:s'],
            'grace_minutes' => ['nullable', 'integer', 'min:0', 'max:240'],
            'break_start' => ['nullable', 'date_format:H:i:s'],
            'break_end' => ['nullable', 'date_format:H:i:s'],
            'is_active' => ['boolean'],
        ];
    }
}
