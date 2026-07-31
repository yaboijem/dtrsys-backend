<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class TimePunchRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'selfie' => ['required', 'image', 'mimes:jpeg,jpg,png', 'max:10240'],
            'latitude' => ['required', 'numeric', 'between:-90,90'],
            'longitude' => ['required', 'numeric', 'between:-180,180'],
            'accuracy_meters' => ['nullable', 'numeric', 'min:0'],
            'device_id' => ['nullable', 'string', 'max:64'],
            'is_offline' => ['nullable', 'boolean'],
        ];
    }
}
