<?php

namespace App\Services;

use App\Exceptions\AttendanceConflictException;
use App\Exceptions\FaceVerificationFailedException;
use App\Exceptions\GpsOutOfRangeException;
use App\Jobs\VerifyAttendancePhotoJob;
use App\Models\Attendance;
use App\Models\AttendancePhoto;
use App\Models\Device;
use App\Models\Employee;
use App\Models\GpsLocation;
use App\Models\Shift;
use App\Models\User;
use Illuminate\Contracts\Cache\LockTimeoutException;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
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
        return $this->withEmployeeLock($user, $data, function (Employee $employee) use ($data) {
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
        });
    }

    public function timeOut(User $user, array $data): Attendance
    {
        return $this->withEmployeeLock($user, $data, function (Employee $employee) use ($data) {
            $now = now();

            $timeIn = $this->openPunchFor($employee, 'time_in');

            if (! $timeIn) {
                throw new AttendanceConflictException('You have not clocked in yet today.');
            }

            if ($this->openBreakFor($employee)) {
                throw new AttendanceConflictException('End your break before clocking out.');
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
        });
    }

    public function breakIn(User $user, array $data): Attendance
    {
        return $this->withEmployeeLock($user, $data, function (Employee $employee) use ($data) {
            $now = now();

            $timeIn = $this->openPunchFor($employee, 'time_in');

            if (! $timeIn) {
                throw new AttendanceConflictException('You have not clocked in yet today.');
            }

            if ($this->openBreakFor($employee)) {
                throw new AttendanceConflictException('You are already on break.');
            }

            if ($this->hasCompletedBreakSince($employee, $timeIn)) {
                throw new AttendanceConflictException('You have already taken your break for this shift.');
            }

            return DB::transaction(function () use ($employee, $data, $now) {
                $gps = $this->verifyGps($employee, $data);
                $shift = $this->scheduleService->shiftFor($employee, $now);

                $attendance = $this->createPunch($employee, 'break_in', $now, $data, $shift);
                $this->storeGpsLocation($attendance, $employee, $gps);

                return $attendance->load(['branch', 'gpsLocation']);
            });
        });
    }

    public function breakOut(User $user, array $data): Attendance
    {
        return $this->withEmployeeLock($user, $data, function (Employee $employee) use ($data) {
            $now = now();

            $breakIn = $this->openBreakFor($employee);

            if (! $breakIn) {
                throw new AttendanceConflictException('You are not on break.');
            }

            return DB::transaction(function () use ($employee, $breakIn, $data, $now) {
                $gps = $this->verifyGps($employee, $data);
                $shift = $this->scheduleService->shiftFor($employee, $now);

                $breakMinutes = max(0, (int) $breakIn->timestamp->diffInMinutes($now));
                $attendance = $this->createPunch($employee, 'break_out', $now, $data, $shift);
                $attendance->update([
                    'break_minutes' => $breakMinutes,
                    'is_overbreak' => $breakMinutes > 60,
                ]);

                $this->storeGpsLocation($attendance, $employee, $gps);

                return $attendance->load(['branch', 'gpsLocation']);
            });
        });
    }

    /**
     * Serialize punches per employee and short-circuit on matching client_uuid.
     *
     * @param  callable(Employee): Attendance  $callback
     */
    private function withEmployeeLock(User $user, array $data, callable $callback): Attendance
    {
        $employee = $user->employee;
        $lock = Cache::lock(
            'attendance:employee:'.$employee->id,
            config('dtr.attendance.employee_lock_seconds', 15),
        );

        try {
            $lock->block(5);
        } catch (LockTimeoutException) {
            throw new AttendanceConflictException('Attendance is busy. Please try again.');
        }

        try {
            if (! empty($data['client_uuid'])) {
                $existing = Attendance::query()
                    ->where('uuid', $data['client_uuid'])
                    ->where('employee_id', $employee->id)
                    ->first();

                if ($existing) {
                    return $existing->load(['branch', 'photo', 'gpsLocation']);
                }
            }

            return $callback($employee);
        } finally {
            $lock->release();
        }
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

        $actualBreakMinutes = (int) Attendance::query()
            ->where('employee_id', $timeIn->employee_id)
            ->where('type', 'break_out')
            ->where('timestamp', '>', $timeIn->timestamp)
            ->where('timestamp', '<=', $timeOut)
            ->sum('break_minutes');

        if ($actualBreakMinutes > 0) {
            return max(0, $total - $actualBreakMinutes);
        }

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
            'uuid' => $data['client_uuid'] ?? null,
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
            'break_notify_stage' => $type === 'break_in' ? 'none' : 'none',
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

    public function storePhotoOnly(Employee $employee, Attendance $attendance, UploadedFile $selfie): AttendancePhoto
    {
        $path = $this->imageService->compressAndStore($selfie, 'attendance', config('dtr.attendance.photo_disk'));

        return AttendancePhoto::create([
            'attendance_id' => $attendance->id,
            'path' => $path,
            'is_verified' => false,
            'liveness_status' => 'pending',
            'captured_at' => now(),
        ]);
    }

    public function applyFaceResult(AttendancePhoto $photo, FaceVerificationResult $result): void
    {
        $photo->update([
            'is_verified' => $result->matched && $result->livenessPassed && $result->faceDetected,
            'verification_result' => $result->toArray(),
            'liveness_status' => $result->livenessPassed ? 'passed' : 'failed',
        ]);
    }

    public function captureAndVerifyPhoto(Employee $employee, Attendance $attendance, ?UploadedFile $selfie): ?AttendancePhoto
    {
        if (! $selfie) {
            return null;
        }

        $photo = $this->storePhotoOnly($employee, $attendance, $selfie);

        if (config('dtr.attendance.async_face_verification')) {
            VerifyAttendancePhotoJob::dispatch($photo->id);

            return $photo;
        }

        $result = $this->faceVerificationService->verify($employee, $photo->path);
        $this->applyFaceResult($photo, $result);

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
            if ($flag->wasRecentlyCreated) {
                $this->notificationService->fraudFlagCreated($flag);
            }
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

    public function openBreakFor(Employee $employee): ?Attendance
    {
        return Attendance::where('employee_id', $employee->id)
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
            ->latest('timestamp')
            ->first();
    }

    private function hasCompletedBreakSince(Employee $employee, Attendance $timeIn): bool
    {
        return Attendance::where('employee_id', $employee->id)
            ->where('type', 'break_out')
            ->where('id', '>', $timeIn->id)
            ->where('timestamp', '>=', $timeIn->timestamp)
            ->exists();
    }

    private function resolveDevice(Employee $employee, ?string $deviceId): ?Device
    {
        if (! $deviceId) {
            return null;
        }

        return $employee->devices()->where('device_id', $deviceId)->first();
    }
}
