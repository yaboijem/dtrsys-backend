<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class MfaDisableRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'password' => ['required', 'string'],
            'code' => ['required', 'string', 'max:10'],
        ];
    }
}
