<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class EmployeeResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'user_id' => $this->user_id,
            'employee_id' => $this->whenLoaded('user', fn () => $this->user->employee_id),
            'email' => $this->whenLoaded('user', fn () => $this->user->email),
            'full_name' => $this->full_name,
            'first_name' => $this->first_name,
            'middle_name' => $this->middle_name,
            'last_name' => $this->last_name,
            'department' => $this->department,
            'position' => $this->position,
            'date_hired' => $this->date_hired?->toDateString(),
            'is_active' => $this->whenLoaded('user', fn () => $this->user->is_active),
            'roles' => $this->whenLoaded('user', function () {
                return $this->user->relationLoaded('roles')
                    ? $this->user->getRoleNames()
                    : null;
            }),
            'branch' => $this->whenLoaded('branch', fn () => [
                'id' => $this->branch->id,
                'name' => $this->branch->name,
                'code' => $this->branch->code,
            ]),
            'reference_photo_path' => $this->reference_photo_path,
        ];
    }
}
