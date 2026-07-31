<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class UserResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $employee = $this->whenLoaded('employee');

        return [
            'id' => $this->id,
            'employee_id' => $this->employee_id,
            'name' => $this->name,
            'email' => $this->email,
            'is_active' => $this->is_active,
            'roles' => $this->getRoleNames(),
            'employee' => $employee ? [
                'id' => $employee->id,
                'first_name' => $employee->first_name,
                'middle_name' => $employee->middle_name,
                'last_name' => $employee->last_name,
                'full_name' => $employee->full_name,
                'department' => $employee->department,
                'position' => $employee->position,
                'date_hired' => $employee->date_hired,
                'branch' => $employee->relationLoaded('branch') ? [
                    'id' => $employee->branch->id,
                    'name' => $employee->branch->name,
                    'code' => $employee->branch->code,
                    'latitude' => $employee->branch->latitude,
                    'longitude' => $employee->branch->longitude,
                    'radius_meters' => $employee->branch->radius_meters,
                ] : null,
            ] : null,
        ];
    }
}
