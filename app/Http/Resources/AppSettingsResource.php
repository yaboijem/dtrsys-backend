<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AppSettingsResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'breaks_enabled' => (bool) $this->breaks_enabled,
        ];
    }
}
