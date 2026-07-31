<?php

namespace App\Services;

use App\Models\DeviceChangeRequest;
use App\Models\FraudFlag;
use App\Models\User;
use App\Notifications\GenericNotification;

class NotificationService
{
    public function send(User $user, string $title, string $body, array $data = []): void
    {
        $user->notify(new GenericNotification($title, $body, $data));
    }

    public function fraudFlagCreated(FraudFlag $flag): void
    {
        $users = User::whereHas('roles', function ($query) {
            $query->whereIn('name', ['Super Admin', 'HR']);
        })->get();

        foreach ($users as $user) {
            $this->send(
                $user,
                'New fraud flag',
                "Attendance record #{$flag->attendance_id} flagged as {$flag->type}.",
                ['fraud_flag_id' => $flag->id, 'attendance_id' => $flag->attendance_id],
            );
        }
    }

    public function deviceChangeRequestReviewed(DeviceChangeRequest $request): void
    {
        $user = $request->employee?->user;

        if (! $user) {
            return;
        }

        $this->send(
            $user,
            'Device change request '.$request->status,
            "Your device change request was {$request->status}.",
            ['device_change_request_id' => $request->id],
        );
    }
}
