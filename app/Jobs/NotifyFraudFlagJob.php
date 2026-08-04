<?php

namespace App\Jobs;

use App\Models\FraudFlag;
use App\Models\User;
use App\Services\NotificationService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class NotifyFraudFlagJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public function __construct(public int $fraudFlagId)
    {
        $this->onQueue('attendance');
        $this->afterCommit = true;
    }

    public function handle(NotificationService $notificationService): void
    {
        $flag = FraudFlag::query()->find($this->fraudFlagId);

        if (! $flag) {
            // Row may not be visible yet if a worker raced the commit; retry once.
            if ($this->attempts() === 1) {
                $this->release(2);
            }

            return;
        }

        $users = User::whereHas('roles', function ($query) {
            $query->whereIn('name', ['Super Admin', 'HR']);
        })->get();

        foreach ($users as $user) {
            $notificationService->send(
                $user,
                'New fraud flag',
                "Attendance record #{$flag->attendance_id} flagged as {$flag->type}.",
                ['fraud_flag_id' => $flag->id, 'attendance_id' => $flag->attendance_id],
            );
        }
    }
}
