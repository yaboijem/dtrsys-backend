<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreDeviceChangeRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'current_device_id' => ['nullable', 'string', 'max:64'],
            'new_device_id' => ['required', 'string', 'max:64', 'different:current_device_id'],
            'reason' => ['required', 'string', 'max:1000'],
        ];
    }
}
