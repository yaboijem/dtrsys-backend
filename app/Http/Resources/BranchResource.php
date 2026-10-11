<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class BranchResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'code' => $this->code,
            'address' => $this->address,
            'latitude' => $this->latitude,
            'longitude' => $this->longitude,
            'radius_meters' => $this->radius_meters,
            'accuracy_ceiling_meters' => $this->accuracy_ceiling_meters,
            'accuracy_allowance_meters' => $this->accuracy_allowance_meters,
            'is_active' => $this->is_active,
            'employee_count' => $this->whenCounted('employees'),
            'created_at' => $this->created_at?->toISOString(),
        ];
    }
}
