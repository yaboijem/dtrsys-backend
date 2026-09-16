<?php

namespace App\Services;

use App\Jobs\NotifyFraudFlagJob;
use App\Models\Employee;
use App\Models\FraudFlag;
use App\Models\HomeLocation;
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
        NotifyFraudFlagJob::dispatch($flag->id);
    }

    public function homeLocationReviewed(HomeLocation $home, Employee $employee, string $action): void
    {
        $user = $employee->user;

        if (! $user) {
            return;
        }

        $statusWord = match ($action) {
            'approve' => 'approved',
            'reject' => 'rejected',
            'link' => 'linked to a shared home pin',
            default => $action,
        };

        $this->send(
            $user,
            'Home location '.$statusWord,
            $action === 'reject' && $home->review_note
                ? "Your home location was rejected. Notes: {$home->review_note}"
                : "Your home location was {$statusWord}.",
            [
                'home_location_id' => $home->id,
                'action' => $action,
                'status' => $home->status,
            ],
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
