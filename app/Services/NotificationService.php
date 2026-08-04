<?php

namespace App\Services;

use App\Jobs\NotifyFraudFlagJob;
use App\Models\DeviceChangeRequest;
use App\Models\FraudFlag;
use App\Models\ReportExport;
use App\Models\User;
use App\Notifications\GenericNotification;

class NotificationService
{
    public function send(User $user, string $title, string $body, array $data = []): void
    {
        $user->notify(new GenericNotification($title, $body, $data));
    }

    public function reportReady(ReportExport $export): void
    {
        $user = $export->requester;

        if (! $user) {
            return;
        }

        $this->send(
            $user,
            'Report ready',
            "Your {$export->type} report for {$export->date_from->toDateString()} to {$export->date_to->toDateString()} is ready to download.",
            ['report_export_id' => $export->id, 'status' => $export->status],
        );
    }

    public function fraudFlagCreated(FraudFlag $flag): void
    {
        NotifyFraudFlagJob::dispatch($flag->id);
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

    public function breakWarning(User $user, int $elapsedMinutes): void
    {
        $this->send(
            $user,
            'Break ending soon',
            "Your break has reached {$elapsedMinutes} minutes. Please Break Out before 60 minutes.",
            ['type' => 'break_warning', 'elapsed_minutes' => $elapsedMinutes],
        );
    }

    public function breakOverbreak(User $user, int $elapsedMinutes): void
    {
        $this->send(
            $user,
            'Break over 1 hour',
            "Your break has reached {$elapsedMinutes} minutes and is now overbreak. Please Break Out.",
            ['type' => 'break_overbreak', 'elapsed_minutes' => $elapsedMinutes],
        );
    }
}
