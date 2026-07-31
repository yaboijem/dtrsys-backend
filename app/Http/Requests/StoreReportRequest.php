<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreReportRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'type' => ['required', 'in:daily,monthly'],
            'date_from' => ['required', 'date'],
            'date_to' => [
                'required',
                'date',
                'after_or_equal:date_from',
                function ($attribute, $value, $fail) {
                    if ($this->input('date_from') && now()->parse($this->input('date_from'))->diffInDays(now()->parse($value)) > 31) {
                        $fail('The date range may not exceed 31 days.');
                    }
                },
            ],
            'filters' => ['nullable', 'array'],
            'filters.branch_id' => ['nullable', 'integer', 'exists:branches,id'],
            'filters.department' => ['nullable', 'string', 'max:100'],
        ];
    }
}
