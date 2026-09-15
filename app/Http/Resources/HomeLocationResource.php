<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class HomeLocationResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'label' => $this->label,
            'latitude' => $this->latitude,
            'longitude' => $this->longitude,
            'radius_meters' => $this->radius_meters,
            'address_text' => $this->address_text,
            'street' => $this->street,
            'city' => $this->city,
            'province' => $this->province,
            'status' => $this->status,
            'created_by' => $this->created_by,
            'reviewed_by' => $this->reviewed_by,
            'reviewed_at' => $this->reviewed_at?->toISOString(),
            'review_note' => $this->review_note,
            'created_at' => $this->created_at?->toISOString(),
            'employees' => $this->whenLoaded('employees', function () {
                return $this->employees->map(fn ($employee) => [
                    'id' => $employee->id,
                    'full_name' => $employee->full_name,
                    'employee_id' => $employee->relationLoaded('user') ? $employee->user?->employee_id : null,
                    'is_primary' => (bool) ($employee->pivot->is_primary ?? false),
                ]);
            }),
        ];
    }
}
