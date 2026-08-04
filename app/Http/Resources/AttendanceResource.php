<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AttendanceResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'uuid' => $this->uuid,
            'type' => $this->type,
            'timestamp' => $this->timestamp?->toISOString(),
            'is_offline' => $this->is_offline,
            'is_late' => $this->is_late,
            'is_early_timeout' => $this->is_early_timeout,
            'work_minutes' => $this->work_minutes,
            'break_minutes' => $this->break_minutes,
            'is_overbreak' => (bool) $this->is_overbreak,
            'source' => $this->source,
            'notes' => $this->notes,
            'synced_at' => $this->synced_at?->toISOString(),
            'branch' => $this->whenLoaded('branch', fn () => [
                'id' => $this->branch->id,
                'name' => $this->branch->name,
            ]),
            'gps_location' => $this->whenLoaded('gpsLocation', fn () => [
                'latitude' => $this->gpsLocation->latitude,
                'longitude' => $this->gpsLocation->longitude,
                'accuracy_meters' => $this->gpsLocation->accuracy_meters,
                'distance_from_branch_meters' => $this->gpsLocation->distance_from_branch_meters,
                'is_within_radius' => $this->gpsLocation->is_within_radius,
            ]),
            'photo' => $this->whenLoaded('photo', fn () => [
                'path' => $this->photo->path,
                'is_verified' => $this->photo->is_verified,
                'liveness_status' => $this->photo->liveness_status,
            ]),
            'fraud_flags' => $this->whenLoaded('fraudFlags', fn () => $this->fraudFlags->map(fn ($flag) => [
                'type' => $flag->type,
                'severity' => $flag->severity,
            ])),
        ];
    }
}
