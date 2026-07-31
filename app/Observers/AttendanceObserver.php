<?php

namespace App\Observers;

use App\Models\Attendance;
use App\Services\AuditService;

class AttendanceObserver
{
    public function __construct(
        private readonly AuditService $auditService,
    ) {}

    public function created(Attendance $attendance): void
    {
        $this->auditService->created(request()->user(), 'attendance.created', $attendance);
    }

    public function updated(Attendance $attendance): void
    {
        $this->auditService->changes(request()->user(), 'attendance.updated', $attendance);
    }

    public function deleted(Attendance $attendance): void
    {
        $this->auditService->deleted(request()->user(), 'attendance.deleted', $attendance);
    }

    public function restored(Attendance $attendance): void
    {
        $this->auditService->record(request()->user(), 'attendance.restored', $attendance);
    }
}
