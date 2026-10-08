<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class GoogleLoginRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'id_token' => ['required', 'string', 'max:8192'],
            'device_id' => ['nullable', 'string', 'max:64'],
            'platform' => ['nullable', 'string', 'max:20'],
            'model' => ['nullable', 'string', 'max:255'],
            'app_version' => ['nullable', 'string', 'max:20'],
        ];
    }
}
