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
                'department_id' => $employee->department_id,
                'position_id' => $employee->position_id,
                'department' => $employee->department?->name,
                'position' => $employee->position?->name,
                'date_hired' => $employee->date_hired,
                'work_arrangement' => $employee->work_arrangement ?? 'onsite',
                'home_location_status' => $employee->homeLocationStatus(),
                'home_location' => ($primary = $employee->primaryHomeLocation()) ? [
                    'id' => $primary->id,
                    'label' => $primary->label,
                    'latitude' => $primary->latitude,
                    'longitude' => $primary->longitude,
                    'radius_meters' => $primary->radius_meters,
                    'status' => $primary->status,
                ] : null,
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
