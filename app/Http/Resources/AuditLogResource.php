<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AuditLogResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'action' => $this->action,
            'model_type' => $this->model_type,
            'model_id' => $this->model_id,
            'old_values' => $this->old_values,
            'new_values' => $this->new_values,
            'ip_address' => $this->ip_address,
            'user_agent' => $this->user_agent,
            'actor' => $this->whenLoaded('user', fn () => [
                'id' => $this->user->id,
                'employee_id' => $this->user->employee_id,
                // Employee name parts are source of truth; users.name can lag after renames.
                'name' => $this->user->employee?->full_name ?: $this->user->name,
            ]),
            'created_at' => $this->created_at?->toISOString(),
        ];
    }
}
