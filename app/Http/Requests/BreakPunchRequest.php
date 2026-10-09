<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

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
            'client_uuid' => [
                config('dtr.attendance.client_uuid_required_online') ? 'required' : 'nullable',
                'uuid',
            ],
            'break_kind' => [
                Rule::requiredIf(fn () => $this->is('api/attendance/break-in')),
                Rule::excludeIf(fn () => ! $this->is('api/attendance/break-in')),
                Rule::in(['15_min', 'lunch_60', 'bio', 'phone', 'coaching', 'huddle', 'training']),
            ],
        ];
    }
}
