<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class DataRequestResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'type' => $this->type,
            'status' => $this->status,
            'notes' => $this->notes,
            'processed_at' => $this->processed_at?->toISOString(),
            'processed_by' => $this->whenLoaded('processor', fn () => $this->processor ? [
                'id' => $this->processor->id,
                'name' => $this->processor->name,
            ] : null),
            'user' => $this->whenLoaded('user', fn () => $this->user ? [
                'id' => $this->user->id,
                'employee_id' => $this->user->employee_id,
                'name' => $this->user->name,
            ] : null),
            'created_at' => $this->created_at?->toISOString(),
        ];
    }
}
