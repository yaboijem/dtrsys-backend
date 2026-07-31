<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class MfaConfirmRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'mfa_token' => ['required', 'string'],
            'code' => ['required', 'string', 'max:10'],
        ];
    }
}
