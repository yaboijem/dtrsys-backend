<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ReviewHomeLocationRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'action' => ['required', Rule::in(['approve', 'reject', 'link'])],
            'radius_meters' => ['nullable', 'integer', 'min:50', 'max:2000'],
            'review_note' => ['nullable', 'string', 'max:1000'],
            'link_home_location_id' => ['required_if:action,link', 'nullable', 'integer', 'exists:home_locations,id'],
            'employee_id' => ['required_if:action,link', 'nullable', 'integer', 'exists:employees,id'],
        ];
    }
}
