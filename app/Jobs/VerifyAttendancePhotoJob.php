<?php

namespace App\Jobs;

use App\Models\AttendancePhoto;
use App\Services\AttendanceService;
use App\Services\FaceVerificationService;
use App\Services\FraudDetectionService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class VerifyAttendancePhotoJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public function __construct(public int $attendancePhotoId)
    {
        $this->onQueue('attendance');
        $this->afterCommit = true;
    }

    public function handle(
        AttendanceService $attendanceService,
        FraudDetectionService $fraudDetectionService,
        FaceVerificationService $faceVerificationService,
    ): void {
        $photo = AttendancePhoto::query()
            ->with(['attendance.employee'])
            ->find($this->attendancePhotoId);

        if (! $photo || ! $photo->attendance) {
            // Row may not be visible yet if a worker raced the commit; retry once.
            if ($this->attempts() === 1) {
                $this->release(2);
            }

            return;
        }

        $employee = $photo->attendance->employee;

        if (! $employee) {
            return;
        }

        $result = $faceVerificationService->verify($employee, $photo->path);
        $attendanceService->applyFaceResult($photo, $result);

        $attendance = $photo->attendance()->with(['photo', 'gpsLocation'])->first();

        if (! $attendance) {
            return;
        }

        foreach ($fraudDetectionService->evaluate($attendance) as $flag) {
            if ($flag->wasRecentlyCreated) {
                NotifyFraudFlagJob::dispatch($flag->id);
            }
        }
    }
}
