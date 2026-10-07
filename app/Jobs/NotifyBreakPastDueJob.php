<?php

namespace App\Jobs;

use App\Models\Attendance;
use App\Models\FraudFlag;
use App\Services\NotificationService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class NotifyBreakPastDueJob implements ShouldQueue
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

        if (! $breakIn || $breakIn->type !== 'break_in' || $breakIn->expected_end_at === null) {
            return;
        }

        $due = $breakIn->expected_end_at->copy()->addMinutes(5);
        if (now()->lt($due)) {
            if ($this->job) {
                $this->release($due);
            }

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

        $minutesPastDue = max(5, (int) round(abs($breakIn->expected_end_at->diffInMinutes(now()))));

        $flag = FraudFlag::query()->firstOrCreate(
            [
                'attendance_id' => $breakIn->id,
                'type' => 'overbreak',
            ],
            [
                'severity' => 'medium',
                'status' => 'open',
                'details' => [
                    'break_kind' => $breakIn->break_kind,
                    'expected_end_at' => $breakIn->expected_end_at->toISOString(),
                    'minutes_past_due' => $minutesPastDue,
                ],
            ],
        );

        if (! $flag->wasRecentlyCreated) {
            return;
        }

        $user = $breakIn->employee?->user;
        if (! $user) {
            return;
        }

        $notifications->breakPastDue($user, (string) $breakIn->break_kind, $minutesPastDue);
    }
}
