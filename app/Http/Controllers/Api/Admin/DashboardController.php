<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Attendance;
use App\Models\Employee;
use App\Models\FraudFlag;
use App\Support\ScopesByRole;
use Illuminate\Http\Request;

class DashboardController extends Controller
{
    use ScopesByRole;

    public function summary(Request $request): array
    {
        $user = $request->user();
        $today = now()->toDateString();
        $yesterday = now()->subDay()->toDateString();

        return [
            'date' => $today,
            'time_ins_today' => $this->countTimeIns($user, $today),
            'time_ins_yesterday' => $this->countTimeIns($user, $yesterday),
            'late_ins_today' => $this->countLateIns($user, $today),
            'late_ins_yesterday' => $this->countLateIns($user, $yesterday),
            'early_time_outs_today' => $this->countEarlyTimeOuts($user, $today),
            'early_time_outs_yesterday' => $this->countEarlyTimeOuts($user, $yesterday),
            'absent_today' => $this->countAbsent($user, $today),
            'absent_yesterday' => $this->countAbsent($user, $yesterday),
            'open_fraud_flags' => $this->countOpenFlags($user),
            'open_fraud_by_severity' => $this->openFlagsBySeverity($user),
        ];
    }

    private function countTimeIns($user, string $date): int
    {
        $q = Attendance::query()->where('type', 'time_in')->whereDate('timestamp', $date);
        $this->applyRoleScope($q, $user, 'branch_id');

        return $q->count();
    }

    private function countLateIns($user, string $date): int
    {
        $q = Attendance::query()->where('type', 'time_in')->whereDate('timestamp', $date)->where('is_late', true);
        $this->applyRoleScope($q, $user, 'branch_id');

        return $q->count();
    }

    private function countEarlyTimeOuts($user, string $date): int
    {
        $q = Attendance::query()->where('type', 'time_out')->whereDate('timestamp', $date)->where('is_early_timeout', true);
        $this->applyRoleScope($q, $user, 'branch_id');

        return $q->count();
    }

    private function countAbsent($user, string $date): int
    {
        $employees = Employee::query()->whereHas('user', fn ($q) => $q->where('is_active', true));

        if ($user->hasRole('Branch Manager')) {
            $employees->where('branch_id', $user->employee?->branch_id);
        } elseif ($user->hasRole('Department Head')) {
            $employees->where('department', $user->employee?->department);
        }

        return (clone $employees)->whereDoesntHave(
            'attendanceRecords',
            fn ($q) => $q->where('type', 'time_in')->whereDate('timestamp', $date)
        )->count();
    }

    private function countOpenFlags($user): int
    {
        $q = FraudFlag::query()->where('status', 'open');
        $this->applyRoleScope($q, $user, 'attendance.branch_id');

        return $q->count();
    }

    /**
     * @return array{high: int, medium: int, low: int}
     */
    private function openFlagsBySeverity($user): array
    {
        $base = FraudFlag::query()->where('status', 'open');
        $this->applyRoleScope($base, $user, 'attendance.branch_id');

        $rows = (clone $base)
            ->selectRaw('severity, count(*) as aggregate')
            ->groupBy('severity')
            ->pluck('aggregate', 'severity');

        return [
            'high' => (int) ($rows['high'] ?? 0),
            'medium' => (int) ($rows['medium'] ?? 0),
            'low' => (int) ($rows['low'] ?? 0),
        ];
    }
}
