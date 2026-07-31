<?php

namespace App\Services;

use App\Models\Attendance;
use App\Models\PayrollExport;
use App\Models\Schedule;
use Carbon\Carbon;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class PayrollExportService
{
    public function generate(PayrollExport $export): PayrollExport
    {
        $export->update(['status' => 'processing']);

        try {
            $from = $export->date_from->copy()->startOfDay();
            $to = $export->date_to->copy()->endOfDay();

            $rows = $this->buildRows($from, $to);
            $csv = $this->toCsv($rows);

            $path = 'exports/payroll_'.$export->id.'_'.Str::slug(now()->toDateTimeString()).'.csv';
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

    private function buildRows(Carbon $from, Carbon $to): array
    {
        $attendance = Attendance::with(['employee.branch'])
            ->whereBetween('timestamp', [$from, $to])
            ->get()
            ->groupBy(fn (Attendance $a) => $a->employee_id.'|'.$a->timestamp->toDateString());

        $schedules = Schedule::with('shift', 'employee')
            ->whereDate('date', '>=', $from->toDateString())
            ->whereDate('date', '<=', $to->toDateString())
            ->get();

        $scheduledDates = $schedules->groupBy(fn (Schedule $s) => $s->employee_id.'|'.$s->date->toDateString());

        $rows = [];

        foreach ($scheduledDates as $key => $scheduleGroup) {
            $schedule = $scheduleGroup->first();
            $employee = $schedule->employee;
            $punches = $attendance->get($key);

            if ($punches && $punches->isNotEmpty()) {
                $timeIn = $punches->firstWhere('type', 'time_in');
                $timeOut = $punches->firstWhere('type', 'time_out');

                $rows[] = [
                    'employee_id' => $employee->user?->employee_id,
                    'full_name' => $employee->full_name,
                    'branch' => $employee->branch?->name,
                    'date' => $schedule->date->toDateString(),
                    'shift' => $schedule->shift?->name,
                    'time_in' => $timeIn?->timestamp->format('H:i:s'),
                    'time_out' => $timeOut?->timestamp->format('H:i:s'),
                    'work_minutes' => $timeOut?->work_minutes ?? 0,
                    'late' => $timeIn?->is_late ? 'YES' : 'NO',
                    'status' => 'PRESENT',
                ];
            } else {
                $rows[] = [
                    'employee_id' => $employee->user?->employee_id,
                    'full_name' => $employee->full_name,
                    'branch' => $employee->branch?->name,
                    'date' => $schedule->date->toDateString(),
                    'shift' => $schedule->shift?->name,
                    'time_in' => null,
                    'time_out' => null,
                    'work_minutes' => 0,
                    'late' => 'NO',
                    'status' => 'ABSENT',
                ];
            }
        }

        usort($rows, fn ($a, $b) => [$a['branch'] ?? '', $a['date'] ?? ''] <=> [$b['branch'] ?? '', $b['date'] ?? '']);

        return $rows;
    }

    private function toCsv(array $rows): string
    {
        $handle = fopen('php://temp', 'r+');

        fputcsv($handle, ['employee_id', 'full_name', 'branch', 'date', 'shift', 'time_in', 'time_out', 'work_minutes', 'late', 'status']);

        foreach ($rows as $row) {
            fputcsv($handle, $row);
        }

        rewind($handle);
        $csv = stream_get_contents($handle);
        fclose($handle);

        return $csv;
    }
}
