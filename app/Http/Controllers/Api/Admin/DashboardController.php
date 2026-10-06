<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Attendance;
use App\Models\Employee;
use App\Models\FraudFlag;
use App\Support\ScopesByRole;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    use ScopesByRole;

    public function summary(Request $request): array
    {
        $user = $request->user();
        $today = now()->toDateString();
        $yesterday = now()->subDay()->toDateString();
        $timeIns = $this->countTimeIns($user, $yesterday, $today);
        $onBreakByKind = $this->onBreakByKind($user);

        return [
            'date' => $today,
            'time_ins_today' => $timeIns[$today] ?? 0,
            'time_ins_yesterday' => $timeIns[$yesterday] ?? 0,
            'open_fraud_flags' => $this->countOpenFlags($user),
            'open_fraud_by_severity' => $this->openFlagsBySeverity($user),
            'employees_total' => $this->countEmployees($user),
            'on_break' => array_sum($onBreakByKind),
            'on_break_by_kind' => $onBreakByKind,
        ];
    }

    public function badges(Request $request): array
    {
        return [
            'open_fraud_flags' => $this->countOpenFlags($request->user()),
        ];
    }

    /**
     * @return array<string, int>
     */
    private function countTimeIns($user, string $from, string $to): array
    {
        $q = Attendance::query()
            ->where('type', 'time_in')
            ->whereBetween('timestamp', [$from.' 00:00:00', $to.' 23:59:59']);
        $this->applyRoleScope($q, $user, 'branch_id');

        return $q->selectRaw('DATE(timestamp) as day, COUNT(*) as aggregate')
            ->groupBy('day')
            ->pluck('aggregate', 'day')
            ->map(fn ($count) => (int) $count)
            ->all();
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

    private function countEmployees($user): int
    {
        return $this->scopedEmployees($user)->count();
    }

    private function scopedEmployees($user)
    {
        $employees = Employee::query();

        if ($user->hasRole('Branch Manager')) {
            $employees->where('branch_id', $user->employee?->branch_id);
        } elseif ($user->hasRole('Department Head')) {
            $employees->where('department_id', $user->employee?->department_id);
        }

        return $employees;
    }

    /**
     * @return array<string, int>
     */
    private function onBreakByKind($user): array
    {
        $counts = [
            '15_min' => 0,
            '5_min' => 0,
            'lunch_60' => 0,
            'bio' => 0,
            'phone' => 0,
            'coaching' => 0,
            'huddle' => 0,
            'training' => 0,
        ];

        $ids = $this->scopedEmployees($user)->pluck('id')->all();

        if ($ids === []) {
            return $counts;
        }

        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $rows = DB::select(
            "WITH latest_shift AS (
                SELECT employee_id, id, type, timestamp,
                       ROW_NUMBER() OVER (PARTITION BY employee_id ORDER BY timestamp DESC, id DESC) AS rn
                FROM attendance
            WHERE deleted_at IS NULL
              AND type IN ('time_in', 'time_out')
              AND timestamp >= ?
              AND employee_id IN ($placeholders)
            ),
            open_shifts AS (
                SELECT employee_id, id, timestamp
                FROM latest_shift
                WHERE rn = 1 AND type = 'time_in'
            ),
            latest_break AS (
                SELECT a.break_kind, a.type,
                       ROW_NUMBER() OVER (PARTITION BY a.employee_id ORDER BY a.timestamp DESC, a.id DESC) AS rn
                FROM attendance a
                INNER JOIN open_shifts o ON o.employee_id = a.employee_id
                WHERE a.deleted_at IS NULL
                  AND a.type IN ('break_in', 'break_out')
                  AND a.timestamp >= o.timestamp
                  AND a.id > o.id
            )
            SELECT break_kind, COUNT(*) AS aggregate
            FROM latest_break
            WHERE rn = 1 AND type = 'break_in'
            GROUP BY break_kind",
            [now()->subDays(7)->toDateTimeString(), ...$ids],
        );

        foreach ($rows as $row) {
            $kind = $row->break_kind ?: 'unspecified';
            $counts[$kind] = (int) $row->aggregate;
        }

        return $counts;
    }
}
