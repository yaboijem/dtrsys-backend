<?php

namespace App\Jobs;

use App\Models\Attendance;
use App\Services\NotificationService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class NotifyTimedBreakEndingJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public function __construct(public int $attendanceId)
    {
        $this->afterCommit = true;
    }

    public function handle(NotificationService $notifications): void
    {
        $breakIn = Attendance::query()->with('employee.user')->find($this->attendanceId);

        if (! $breakIn || $breakIn->type !== 'break_in' || ($breakIn->break_notify_stage ?? 'none') !== 'none') {
            return;
        }

        if (! in_array($breakIn->break_kind, ['15_min', '5_min'], true)) {
            return;
        }

        $closed = Attendance::query()
            ->where('employee_id', $breakIn->employee_id)
            ->where('type', 'break_out')
            ->where('id', '>', $breakIn->id)
            ->exists();

        if ($closed) {
            return;
        }

        $user = $breakIn->employee?->user;
        if (! $user) {
            return;
        }

        $notifications->timedBreakEnding($user, (string) $breakIn->break_kind);
        $breakIn->update(['break_notify_stage' => 'ending']);
    }
}
