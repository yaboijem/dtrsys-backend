<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UploadReferencePhotoRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'photo' => ['required', 'image', 'mimes:jpeg,jpg,png', 'max:5120'],
        ];
    }
}
