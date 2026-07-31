<?php

namespace App\Services;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\ReportExport;
use App\Models\Schedule;
use Carbon\Carbon;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class ReportExportService
{
    public function generate(ReportExport $export): ReportExport
    {
        $export->update(['status' => 'processing']);

        try {
            $from = $export->date_from->copy()->startOfDay();
            $to = $export->date_to->copy()->endOfDay();

            $rows = $this->buildRows($from, $to, $export->filters ?? [], $export->type);

            $csv = $this->toCsv($rows, $export->type);

            $path = 'exports/report_'.$export->id.'_'.Str::slug(now()->toDateTimeString()).'.csv';
            Storage::disk(config('dtr.payroll.export_disk'))->put($path, $csv);

            $export->update([
                'status' => 'ready',
                'file_path' => $path,
                'row_count' => count($rows),
                'completed_at' => now(),
                'error_message' => null,
            ]);

            return $export;
        } catch (\Throwable $e) {
            $export->update([
                'status' => 'failed',
                'error_message' => $e->getMessage(),
                'completed_at' => now(),
            ]);

            throw $e;
        }
    }

    private function buildRows(Carbon $from, Carbon $to, array $filters, string $type): array
    {
        $employees = Employee::query()
            ->whereHas('user', fn ($q) => $q->where('is_active', true))
            ->when(isset($filters['branch_id']), fn ($q) => $q->where('branch_id', $filters['branch_id']))
            ->when(isset($filters['department']), fn ($q) => $q->where('department', $filters['department']))
            ->with('user')
            ->get();

        $employeeIds = $employees->pluck('id');

        $attendance = Attendance::with('employee')
            ->whereIn('employee_id', $employeeIds)
            ->whereBetween('timestamp', [$from, $to])
            ->get()
            ->groupBy(fn (Attendance $a) => $a->employee_id.'|'.$a->timestamp->toDateString());

        $schedules = Schedule::with('shift')
            ->whereIn('employee_id', $employeeIds)
            ->whereDate('date', '>=', $from->toDateString())
            ->whereDate('date', '<=', $to->toDateString())
            ->get()
            ->groupBy(fn (Schedule $s) => $s->employee_id.'|'.$s->date->toDateString());

        $rows = [];

        foreach ($schedules as $key => $scheduleGroup) {
            $schedule = $scheduleGroup->first();
            $employee = $employees->firstWhere('id', $schedule->employee_id);

            if (! $employee) {
                continue;
            }

            $punches = $attendance->get($key);
            $timeIn = $punches?->firstWhere('type', 'time_in');
            $timeOut = $punches?->firstWhere('type', 'time_out');

            $metrics = $this->metricsFor($timeIn, $timeOut, $schedule);

            if ($type === 'monthly') {
                $rows[$employee->id] ??= [
                    'employee_id' => $employee->user?->employee_id,
                    'full_name' => $employee->full_name,
                    'branch' => $employee->branch?->name,
                    'department' => $employee->department,
                    'present_days' => 0,
                    'absent_days' => 0,
                    'total_work_minutes' => 0,
                    'total_late_minutes' => 0,
                    'total_overtime_minutes' => 0,
                    'total_undertime_minutes' => 0,
                ];

                $rows[$employee->id]['present_days'] += $metrics['present'] ? 1 : 0;
                $rows[$employee->id]['absent_days'] += $metrics['present'] ? 0 : 1;
                $rows[$employee->id]['total_work_minutes'] += $metrics['work_minutes'];
                $rows[$employee->id]['total_late_minutes'] += $metrics['late_minutes'];
                $rows[$employee->id]['total_overtime_minutes'] += $metrics['overtime_minutes'];
                $rows[$employee->id]['total_undertime_minutes'] += $metrics['undertime_minutes'];

                continue;
            }

            $rows[] = [
                'employee_id' => $employee->user?->employee_id,
                'full_name' => $employee->full_name,
                'branch' => $employee->branch?->name,
                'department' => $employee->department,
                'date' => $schedule->date->toDateString(),
                'shift' => $schedule->shift?->name,
                'time_in' => $timeIn?->timestamp->format('H:i:s'),
                'time_out' => $timeOut?->timestamp->format('H:i:s'),
                'late_minutes' => $metrics['late_minutes'],
                'overtime_minutes' => $metrics['overtime_minutes'],
                'undertime_minutes' => $metrics['undertime_minutes'],
                'work_minutes' => $metrics['work_minutes'],
                'status' => $metrics['present'] ? 'PRESENT' : 'ABSENT',
            ];
        }

        if ($type === 'monthly') {
            $rows = array_values($rows);
        }

        usort($rows, fn ($a, $b) => [$a['branch'] ?? '', $a['full_name'] ?? '', $a['date'] ?? ''] <=> [$b['branch'] ?? '', $b['full_name'] ?? '', $b['date'] ?? '']);

        return $rows;
    }

    private function metricsFor(?Attendance $timeIn, ?Attendance $timeOut, Schedule $schedule): array
    {
        $shift = $schedule->shift;
        $date = $schedule->date->toDateString();

        $lateMinutes = 0;
        $overtimeMinutes = 0;
        $undertimeMinutes = 0;

        if ($timeIn && $shift) {
            $start = Carbon::parse($date.' '.$shift->start_time)->addMinutes($shift->grace_minutes);
            $lateMinutes = max(0, (int) $start->diffInMinutes($timeIn->timestamp, false));
        }

        if ($timeOut && $shift) {
            $end = Carbon::parse($date.' '.$shift->end_time);
            $overtimeMinutes = max(0, (int) $end->diffInMinutes($timeOut->timestamp, false));
            $undertimeMinutes = max(0, (int) $timeOut->timestamp->diffInMinutes($end, false));
        }

        return [
            'present' => $timeIn !== null,
            'work_minutes' => $timeOut?->work_minutes ?? 0,
            'late_minutes' => $lateMinutes,
            'overtime_minutes' => $overtimeMinutes,
            'undertime_minutes' => $undertimeMinutes,
        ];
    }

    private function toCsv(array $rows, string $type): string
    {
        $header = $type === 'monthly'
            ? ['employee_id', 'full_name', 'branch', 'department', 'present_days', 'absent_days', 'total_work_minutes', 'total_late_minutes', 'total_overtime_minutes', 'total_undertime_minutes']
            : ['employee_id', 'full_name', 'branch', 'department', 'date', 'shift', 'time_in', 'time_out', 'late_minutes', 'overtime_minutes', 'undertime_minutes', 'work_minutes', 'status'];

        $handle = fopen('php://temp', 'r+');

        fputcsv($handle, $header);

        foreach ($rows as $row) {
            fputcsv($handle, $row);
        }

        rewind($handle);
        $csv = stream_get_contents($handle);
        fclose($handle);

        return $csv;
    }
}
