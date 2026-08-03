<?php

namespace App\Services;

use App\Exceptions\AttendanceConflictException;
use App\Exceptions\FaceVerificationFailedException;
use App\Exceptions\GpsOutOfRangeException;
use App\Models\Attendance;
use App\Models\AttendancePhoto;
use App\Models\Device;
use App\Models\Employee;
use App\Models\GpsLocation;
use App\Models\Shift;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class AttendanceService
{
    public function __construct(
        private readonly GPSService $gpsService,
        private readonly ScheduleService $scheduleService,
        private readonly FaceVerificationService $faceVerificationService,
        private readonly FraudDetectionService $fraudDetectionService,
        private readonly NotificationService $notificationService,
        private readonly ImageService $imageService,
    ) {}

    public function timeIn(User $user, array $data): Attendance
    {
        $employee = $user->employee;
        $now = now();

        if ($this->openPunchFor($employee, 'time_in')) {
            throw new AttendanceConflictException('You already clocked in today.');
        }

        return DB::transaction(function () use ($employee, $data, $now) {
            $gps = $this->verifyGps($employee, $data);
            $shift = $this->scheduleService->shiftFor($employee, $now);

            $attendance = $this->createPunch($employee, 'time_in', $now, $data, $shift);
            $this->storeGpsLocation($attendance, $employee, $gps);
            $this->captureAndVerifyPhoto($employee, $attendance, $data['selfie'] ?? null);

            $this->runFraudChecks($attendance);

            return $attendance->load(['branch', 'photo', 'gpsLocation']);
        });
    }

    public function timeOut(User $user, array $data): Attendance
    {
        $employee = $user->employee;
        $now = now();

        $timeIn = $this->openPunchFor($employee, 'time_in');

        if (! $timeIn) {
            throw new AttendanceConflictException('You have not clocked in yet today.');
        }

        return DB::transaction(function () use ($employee, $timeIn, $data, $now) {
            $gps = $this->verifyGps($employee, $data);
            $shift = $this->scheduleService->shiftFor($employee, $now);

            $attendance = $this->createPunch($employee, 'time_out', $now, $data, $shift, $timeIn->timestamp);
            $attendance->update(['work_minutes' => $this->computeWorkMinutes($timeIn, $now, $shift)]);

            $this->storeGpsLocation($attendance, $employee, $gps);
            $this->captureAndVerifyPhoto($employee, $attendance, $data['selfie'] ?? null);

            $this->runFraudChecks($attendance);

            return $attendance->load(['branch', 'photo', 'gpsLocation']);
        });
    }

    public function isLate(Carbon $now, ?Shift $shift): bool
    {
        if (! $shift) {
            return false;
        }

        $cutoff = $now->copy()->setTimeFromTimeString($shift->start_time)->addMinutes($shift->grace_minutes);

        return $now->gt($cutoff);
    }

    public function isEarlyTimeout(Carbon $timeOut, ?Shift $shift, ?Carbon $shiftDate = null): bool
    {
        if (! $shift) {
            return false;
        }

        $end = ($shiftDate ?? $timeOut)->copy()->setTimeFromTimeString($shift->end_time);

        if ($shift->end_time < $shift->start_time) {
            $end->addDay();
        }

        return $timeOut->lt($end);
    }

    public function computeWorkMinutes(Attendance $timeIn, Carbon $timeOut, ?Shift $shift): int
    {
        $total = max(0, (int) $timeIn->timestamp->diffInMinutes($timeOut));

        if (! $shift || ! $shift->break_start || ! $shift->break_end) {
            return $total;
        }

        $breakStart = $timeIn->timestamp->copy()->setTimeFromTimeString($shift->break_start);
        $breakEnd = $timeIn->timestamp->copy()->setTimeFromTimeString($shift->break_end);

        if ($timeIn->timestamp->lte($breakStart) && $timeOut->gte($breakEnd)) {
            $total -= (int) $breakStart->diffInMinutes($breakEnd);
        }

        return max(0, $total);
    }

    private function createPunch(Employee $employee, string $type, Carbon $now, array $data, ?Shift $shift, ?Carbon $shiftDate = null): Attendance
    {
        return Attendance::create([
            'employee_id' => $employee->id,
            'branch_id' => $employee->branch_id,
            'device_id' => $this->resolveDevice($employee, $data['device_id'] ?? null)?->id,
            'type' => $type,
            'timestamp' => $now,
            'latitude' => $data['latitude'] ?? null,
            'longitude' => $data['longitude'] ?? null,
            'gps_accuracy_meters' => $data['accuracy_meters'] ?? null,
            'is_offline' => (bool) ($data['is_offline'] ?? false),
            'is_late' => $type === 'time_in' && $this->isLate($now, $shift),
            'is_early_timeout' => $type === 'time_out' && $this->isEarlyTimeout($now, $shift, $shiftDate),
            'source' => $data['source'] ?? 'app',
            'notes' => $data['notes'] ?? null,
            'synced_at' => now(),
        ]);
    }

    private function verifyGps(Employee $employee, array $data): array
    {
        $result = $this->gpsService->verify(
            $employee->branch,
            $data['latitude'] ?? null,
            $data['longitude'] ?? null,
            $data['accuracy_meters'] ?? null,
        );

        if (! $result['is_within_radius']) {
            throw new GpsOutOfRangeException(
                'You are outside the allowed GPS radius for your assigned branch.',
                $result,
            );
        }

        return $result;
    }

    public function captureAndVerifyPhoto(Employee $employee, Attendance $attendance, ?UploadedFile $selfie): ?AttendancePhoto
    {
        if (! $selfie) {
            return null;
        }

        $path = $this->imageService->compressAndStore($selfie, 'attendance', config('dtr.attendance.photo_disk'));

        $photo = AttendancePhoto::create([
            'attendance_id' => $attendance->id,
            'path' => $path,
            'is_verified' => false,
            'liveness_status' => 'pending',
            'captured_at' => now(),
        ]);

        $result = $this->faceVerificationService->verify($employee, $photo->path);

        $photo->update([
            'is_verified' => $result->matched,
            'verification_result' => $result->toArray(),
            'liveness_status' => $result->livenessPassed ? 'passed' : 'failed',
        ]);

        if (! $result->matched || ! $result->livenessPassed || ! $result->faceDetected) {
            throw new FaceVerificationFailedException(
                'Face verification failed. Please try again.',
                $result->toArray(),
            );
        }

        return $photo;
    }

    private function storeGpsLocation(Attendance $attendance, Employee $employee, array $gps): void
    {
        GpsLocation::create([
            'attendance_id' => $attendance->id,
            'employee_id' => $employee->id,
            'latitude' => $attendance->latitude,
            'longitude' => $attendance->longitude,
            'accuracy_meters' => $attendance->gps_accuracy_meters,
            'distance_from_branch_meters' => $gps['distance_meters'],
            'is_within_radius' => $gps['is_within_radius'],
            'captured_at' => $attendance->timestamp,
        ]);
    }

    private function runFraudChecks(Attendance $attendance): void
    {
        $flags = $this->fraudDetectionService->evaluate($attendance);

        foreach ($flags as $flag) {
            $this->notificationService->fraudFlagCreated($flag);
        }
    }

    private function openPunchFor(Employee $employee, string $type): ?Attendance
    {
        return Attendance::where('employee_id', $employee->id)
            ->where('type', $type)
            ->whereDate('timestamp', now()->toDateString())
            ->when($type === 'time_in', function ($query) {
                $query->whereNotExists(function ($sub) {
                    $sub->selectRaw('1')
                        ->from('attendance as closed')
                        ->whereColumn('closed.employee_id', 'attendance.employee_id')
                        ->where('closed.type', 'time_out')
                        ->where('closed.deleted_at', null)
                        ->whereColumn('closed.id', '>', 'attendance.id');
                });
            })
            ->latest('timestamp')
            ->first();
    }

    private function resolveDevice(Employee $employee, ?string $deviceId): ?Device
    {
        if (! $deviceId) {
            return null;
        }

        return $employee->devices()->where('device_id', $deviceId)->first();
    }
}
