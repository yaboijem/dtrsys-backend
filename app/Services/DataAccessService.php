<?php

namespace App\Services;

use App\Models\User;

class DataAccessService
{
    public function payloadFor(User $user): array
    {
        $employee = $user->employee;

        return [
            'requested_at' => now()->toISOString(),
            'profile' => [
                'employee_id' => $user->employee_id,
                'name' => $user->name,
                'email' => $user->email,
                'branch' => $employee?->branch?->name,
                'department' => $employee?->department,
                'position' => $employee?->position,
                'date_hired' => $employee?->date_hired?->toDateString(),
                'consents' => $employee?->consents->map(fn ($consent) => [
                    'type' => $consent->type,
                    'granted' => $consent->granted,
                    'granted_at' => $consent->granted_at?->toISOString(),
                    'revoked_at' => $consent->revoked_at?->toISOString(),
                ])->values()->all() ?? [],
            ],
            'attendance' => $employee?->attendanceRecords()
                ->orderBy('timestamp')
                ->get()
                ->map(fn ($attendance) => [
                    'timestamp' => $attendance->timestamp->toISOString(),
                    'type' => $attendance->type,
                    'branch' => $attendance->branch?->name,
                    'latitude' => $attendance->latitude,
                    'longitude' => $attendance->longitude,
                    'gps_accuracy_meters' => $attendance->gps_accuracy_meters,
                    'source' => $attendance->source,
                    'is_offline' => $attendance->is_offline,
                    'is_late' => $attendance->is_late,
                    'work_minutes' => $attendance->work_minutes,
                    'notes' => $attendance->notes,
                ])->all() ?? [],
            'schedules' => $employee?->schedules()
                ->with('shift')
                ->orderBy('date')
                ->get()
                ->map(fn ($schedule) => [
                    'date' => $schedule->date->toDateString(),
                    'shift' => $schedule->shift?->name,
                    'start_time' => $schedule->shift?->start_time,
                    'end_time' => $schedule->shift?->end_time,
                ])->all() ?? [],
            'device_change_requests' => $employee?->deviceChangeRequests()
                ->orderByDesc('created_at')
                ->get()
                ->map(fn ($request) => [
                    'current_device_id' => $request->current_device_id,
                    'new_device_id' => $request->new_device_id,
                    'status' => $request->status,
                    'reviewed_at' => $request->reviewed_at?->toISOString(),
                    'created_at' => $request->created_at?->toISOString(),
                ])->all() ?? [],
        ];
    }
}
