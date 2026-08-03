<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AttendanceAdminResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'uuid' => $this->uuid,
            'type' => $this->type,
            'timestamp' => $this->timestamp?->toISOString(),
            'is_late' => $this->is_late,
            'is_early_timeout' => $this->is_early_timeout,
            'work_minutes' => $this->work_minutes,
            'source' => $this->source,
            'is_offline' => $this->is_offline,
            'notes' => $this->notes,
            'employee' => $this->whenLoaded('employee', fn () => [
                'id' => $this->employee->id,
                'employee_id' => $this->employee->user?->employee_id,
                'name' => $this->employee->full_name,
                'department' => $this->employee->department,
                'position' => $this->employee->position,
            ]),
            'branch' => $this->whenLoaded('branch', fn () => [
                'id' => $this->branch->id,
                'code' => $this->branch->code,
                'name' => $this->branch->name,
            ]),
            'device' => $this->whenLoaded('device', fn () => $this->device ? [
                'id' => $this->device->id,
                'device_id' => $this->device->device_id,
                'name' => $this->device->name,
            ] : null),
            'photo' => $this->whenLoaded('photo', fn () => $this->photo ? [
                'path' => $this->photo->path,
                'is_verified' => $this->photo->is_verified,
                'liveness_status' => $this->photo->liveness_status,
            ] : null),
            'gps_location' => $this->whenLoaded('gpsLocation', fn () => $this->gpsLocation ? [
                'latitude' => $this->gpsLocation->latitude,
                'longitude' => $this->gpsLocation->longitude,
                'accuracy_meters' => $this->gpsLocation->accuracy_meters,
                'distance_from_branch_meters' => $this->gpsLocation->distance_from_branch_meters,
                'is_within_radius' => $this->gpsLocation->is_within_radius,
            ] : null),
            'fraud_flags' => $this->whenLoaded('fraudFlags', fn () => $this->fraudFlags->map(fn ($flag) => [
                'id' => $flag->id,
                'type' => $flag->type,
                'severity' => $flag->severity,
                'status' => $flag->status,
            ])),
            'created_at' => $this->created_at?->toISOString(),
        ];
    }
}
