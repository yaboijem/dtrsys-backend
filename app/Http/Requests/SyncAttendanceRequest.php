<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class SyncAttendanceRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'device_id' => ['nullable', 'string', 'max:64'],
            'records' => ['required', 'array', 'min:1', 'max:100'],
            'records.*.client_uuid' => ['required', 'string', 'max:64'],
            'records.*.type' => ['required', 'string', 'in:time_in,time_out'],
            'records.*.timestamp' => ['required', 'date'],
            'records.*.latitude' => ['required', 'numeric', 'between:-90,90'],
            'records.*.longitude' => ['required', 'numeric', 'between:-180,180'],
            'records.*.accuracy_meters' => ['nullable', 'numeric', 'min:0'],
            'records.*.notes' => ['nullable', 'string', 'max:500'],
        ];
    }
}
