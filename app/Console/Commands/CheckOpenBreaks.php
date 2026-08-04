<?php

namespace App\Console\Commands;

use App\Models\Attendance;
use App\Services\NotificationService;
use Illuminate\Console\Command;

class CheckOpenBreaks extends Command
{
    protected $signature = 'dtr:check-open-breaks';

    protected $description = 'Notify employees with open breaks at 50 and 60 minutes';

    public function handle(NotificationService $notifications): int
    {
        $openBreaks = Attendance::query()
            ->with('employee.user')
            ->where('type', 'break_in')
            ->whereDate('timestamp', now()->toDateString())
            ->whereNotExists(function ($sub) {
                $sub->selectRaw('1')
                    ->from('attendance as closed')
                    ->whereColumn('closed.employee_id', 'attendance.employee_id')
                    ->where('closed.type', 'break_out')
                    ->whereNull('closed.deleted_at')
                    ->whereColumn('closed.id', '>', 'attendance.id');
            })
            ->get();

        $warned = 0;
        $overbreak = 0;

        foreach ($openBreaks as $breakIn) {
            $user = $breakIn->employee?->user;
            if (! $user) {
                continue;
            }

            $elapsed = (int) $breakIn->timestamp->diffInMinutes(now());
            $stage = $breakIn->break_notify_stage ?? 'none';

            if ($elapsed >= 60 && $stage !== 'overbreak') {
                $notifications->breakOverbreak($user, $elapsed);
                $breakIn->update(['break_notify_stage' => 'overbreak']);
                $overbreak++;
                continue;
            }

            if ($elapsed >= 50 && $stage === 'none') {
                $notifications->breakWarning($user, $elapsed);
                $breakIn->update(['break_notify_stage' => 'warned']);
                $warned++;
            }
        }

        $this->info("Open breaks checked. Warned: {$warned}. Overbreak notices: {$overbreak}.");

        return self::SUCCESS;
    }
}
