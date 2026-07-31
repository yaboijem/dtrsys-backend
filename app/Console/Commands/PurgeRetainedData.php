<?php

namespace App\Console\Commands;

use App\Models\Attendance;
use App\Models\AuditLog;
use App\Models\SyncLog;
use Illuminate\Console\Command;

class PurgeRetainedData extends Command
{
    protected $signature = 'dtr:purge-old-data
        {--days= : Attendance data older than this many days (defaults to config).}
        {--audit-days= : Audit logs older than this many days (defaults to config).}
        {--dry-run : Show what would be deleted without deleting anything.}';

    protected $description = 'Delete attendance records (photos, GPS, fraud flags), sync logs and audit logs older than the retention period.';

    public function handle(): int
    {
        $attendanceCutoff = now()->subDays((int) $this->option('days') ?: config('dtr.retention.attendance_days'));
        $auditCutoff = now()->subDays((int) $this->option('audit-days') ?: config('dtr.retention.audit_days'));

        $attendanceIds = Attendance::query()
            ->where('timestamp', '<', $attendanceCutoff)
            ->pluck('id');

        $attendanceCount = $attendanceIds->count();
        $syncLogCount = SyncLog::where('synced_at', '<', $attendanceCutoff)->count();
        $auditLogCount = AuditLog::where('created_at', '<', $auditCutoff)->count();

        $this->info("Cutoffs: attendance < {$attendanceCutoff->toDateTimeString()}, audit < {$auditCutoff->toDateTimeString()}");

        if ($this->option('dry-run')) {
            $this->line("Would delete: {$attendanceCount} attendance records, {$syncLogCount} sync logs, {$auditLogCount} audit logs.");

            return self::SUCCESS;
        }

        Attendance::whereIn('id', $attendanceIds)->forceDelete();
        SyncLog::where('synced_at', '<', $attendanceCutoff)->delete();
        AuditLog::where('created_at', '<', $auditCutoff)->delete();

        $this->line("Deleted: {$attendanceCount} attendance records, {$syncLogCount} sync logs, {$auditLogCount} audit logs.");

        return self::SUCCESS;
    }
}
