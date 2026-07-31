<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class FraudFlagResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'type' => $this->type,
            'severity' => $this->severity,
            'status' => $this->status,
            'details' => $this->details,
            'notes' => $this->notes,
            'reviewed_at' => $this->reviewed_at?->toISOString(),
            'reviewer' => $this->whenLoaded('reviewer', fn () => [
                'id' => $this->reviewer->id,
                'employee_id' => $this->reviewer->employee_id,
                'name' => $this->reviewer->name,
            ]),
            'attendance' => $this->whenLoaded('attendance', fn () => [
                'id' => $this->attendance->id,
                'type' => $this->attendance->type,
                'timestamp' => $this->attendance->timestamp?->toISOString(),
                'is_late' => $this->attendance->is_late,
                'work_minutes' => $this->attendance->work_minutes,
                'source' => $this->attendance->source,
                'is_offline' => $this->attendance->is_offline,
                'branch' => $this->whenLoaded('attendance.branch', fn () => $this->attendance->branch->name),
                'employee' => $this->whenLoaded('attendance.employee', fn () => [
                    'id' => $this->attendance->employee->id,
                    'employee_id' => $this->attendance->employee->user?->employee_id,
                    'name' => $this->attendance->employee->full_name,
                    'department' => $this->attendance->employee->department,
                ]),
                'photo' => $this->whenLoaded('attendance.photo', fn () => [
                    'path' => $this->attendance->photo?->path,
                    'is_verified' => $this->attendance->photo?->is_verified,
                    'liveness_status' => $this->attendance->photo?->liveness_status,
                ]),
                'gps_location' => $this->whenLoaded('attendance.gpsLocation', fn () => [
                    'is_within_radius' => $this->attendance->gpsLocation?->is_within_radius,
                    'distance_from_branch_meters' => $this->attendance->gpsLocation?->distance_from_branch_meters,
                    'latitude' => $this->attendance->gpsLocation?->latitude,
                    'longitude' => $this->attendance->gpsLocation?->longitude,
                ]),
            ]),
            'created_at' => $this->created_at?->toISOString(),
        ];
    }
}
