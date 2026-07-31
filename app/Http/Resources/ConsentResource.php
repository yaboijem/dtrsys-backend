<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ConsentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'type' => $this->type,
            'granted' => $this->granted,
            'granted_at' => $this->granted_at?->toISOString(),
            'revoked_at' => $this->revoked_at?->toISOString(),
            'updated_at' => $this->updated_at?->toISOString(),
        ];
    }
}
