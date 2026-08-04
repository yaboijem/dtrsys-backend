<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class BreakPunchRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'latitude' => ['required', 'numeric', 'between:-90,90'],
            'longitude' => ['required', 'numeric', 'between:-180,180'],
            'accuracy_meters' => ['nullable', 'numeric', 'min:0'],
            'device_id' => ['nullable', 'string', 'max:64'],
            'is_offline' => ['nullable', 'boolean'],
            'client_uuid' => [
                config('dtr.attendance.client_uuid_required_online') ? 'required' : 'nullable',
                'uuid',
            ],
        ];
    }
}
