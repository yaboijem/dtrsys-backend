<?php

namespace App\Services;

use App\Exceptions\AttendanceConflictException;
use App\Exceptions\BreaksDisabledException;
use App\Exceptions\GpsOutOfRangeException;
use App\Exceptions\HomeLocationRequiredException;
use App\Models\AppSetting;
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
        private readonly FraudDetectionService $fraudDetectionService,
        private readonly NotificationService $notificationService,
        private readonly ImageService $imageService,
    ) {}

    public function timeIn(User $user, array $data): Attendance
    {
        return $this->withEmployeeLock($user, $data, function (Employee $employee) use ($data) {
            $now = now();

            if ($this->openPunchFor($employee, 'time_in')) {
                throw new AttendanceConflictException(
                    'You already clocked in today.',
                    $this->sessionFor($employee),
                );
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
                throw new AttendanceConflictException(
                    'You have not clocked in yet today.',
                    $this->sessionFor($employee),
                );
            }

            return DB::transaction(function () use ($employee, $timeIn, $data, $now) {
                $openBreak = $this->openBreakFor($employee);
                if ($openBreak) {
                    $breakData = $data;
                    unset($breakData['client_uuid'], $breakData['selfie']);
                    $this->writeBreakOut($employee, $openBreak, $breakData, $now);
                }

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
            if (! AppSetting::current()->breaks_enabled) {
                throw new BreaksDisabledException('Break in/out is currently disabled by an administrator.');
            }

            $now = now();

            $timeIn = $this->openPunchFor($employee, 'time_in');

            if (! $timeIn) {
                throw new AttendanceConflictException(
                    'You have not clocked in yet today.',
                    $this->sessionFor($employee),
                );
            }

            if ($this->openBreakFor($employee)) {
                throw new AttendanceConflictException(
                    'You are already on break.',
                    $this->sessionFor($employee),
                );
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
                throw new AttendanceConflictException(
                    'You are not on break.',
                    $this->sessionFor($employee),
                );
            }

            return DB::transaction(function () use ($employee, $breakIn, $data, $now) {
                return $this->writeBreakOut($employee, $breakIn, $data, $now);
            });
        });
    }

    private function writeBreakOut(Employee $employee, Attendance $breakIn, array $data, Carbon $now): Attendance
    {
        $gps = $this->verifyGps($employee, $data);
        $shift = $this->scheduleService->shiftFor($employee, $now);
        $breakMinutes = max(0, (int) $breakIn->timestamp->diffInMinutes($now));
        $attendance = $this->createPunch($employee, 'break_out', $now, $data, $shift);
        $attendance->update([
            'break_minutes' => $breakMinutes,
            'is_overbreak' => $breakMinutes > 60,
            'break_kind' => $breakIn->break_kind,
            'expected_end_at' => $breakIn->expected_end_at,
        ]);
        $this->storeGpsLocation($attendance, $employee, $gps);

        return $attendance->load(['branch', 'gpsLocation']);
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
            throw new AttendanceConflictException(
                'Attendance is busy. Please try again.',
                $this->sessionFor($employee),
            );
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

    private function expectedEndAt(?string $kind, Carbon $now): ?Carbon
    {
        return match ($kind) {
            '15_min' => $now->copy()->addMinutes(15),
            'lunch_60' => $now->copy()->addMinutes(60),
            default => null,
        };
    }

    private function createPunch(Employee $employee, string $type, Carbon $now, array $data, ?Shift $shift, ?Carbon $shiftDate = null): Attendance
    {
        $attributes = [
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
            'break_kind' => $type === 'break_in' ? ($data['break_kind'] ?? null) : null,
            'expected_end_at' => $type === 'break_in' ? $this->expectedEndAt($data['break_kind'] ?? null, $now) : null,
            'break_notify_stage' => $type === 'break_in' ? 'none' : 'none',
            'source' => $data['source'] ?? 'app',
            'notes' => $data['notes'] ?? null,
            'synced_at' => now(),
        ];
        if (! empty($data['client_uuid'])) {
            $attributes['uuid'] = $data['client_uuid'];
        }

        return Attendance::create($attributes);
    }

    public function resolveGpsVerification(Employee $employee, array $data): array
    {
        $lat = isset($data['latitude']) ? (float) $data['latitude'] : null;
        $lng = isset($data['longitude']) ? (float) $data['longitude'] : null;
        $acc = isset($data['accuracy_meters']) ? (float) $data['accuracy_meters'] : null;

        if ($employee->isWfh()) {
            $home = $employee->primaryHomeLocation();

            if (! $home) {
                throw $this->homeLocationRequiredException($employee);
            }

            $result = $this->gpsService->verifyCoordinates(
                (float) $home->latitude,
                (float) $home->longitude,
                (float) $home->radius_meters,
                $lat,
                $lng,
                $acc,
            );

            $result['verified_against_type'] = 'home_location';
            $result['verified_against_id'] = $home->id;

            return $result;
        }

        if ($employee->isHybrid()) {
            $home = $employee->primaryHomeLocation();

            if (! $home) {
                throw $this->homeLocationRequiredException($employee);
            }

            $branch = $employee->branch;
            $branchResult = $this->gpsService->verifyCoordinates(
                (float) $branch->latitude,
                (float) $branch->longitude,
                (float) $branch->radius_meters,
                $lat,
                $lng,
                $acc,
            );
            $branchResult['verified_against_type'] = 'branch';
            $branchResult['verified_against_id'] = $branch->id;

            $homeResult = $this->gpsService->verifyCoordinates(
                (float) $home->latitude,
                (float) $home->longitude,
                (float) $home->radius_meters,
                $lat,
                $lng,
                $acc,
            );
            $homeResult['verified_against_type'] = 'home_location';
            $homeResult['verified_against_id'] = $home->id;

            $candidates = [];
            if ($branchResult['is_within_radius']) {
                $candidates[] = $branchResult;
            }
            if ($homeResult['is_within_radius']) {
                $candidates[] = $homeResult;
            }

            if ($candidates === []) {
                $distances = array_values(array_filter(
                    [$branchResult['distance_meters'], $homeResult['distance_meters']],
                    fn ($d) => $d !== null,
                ));

                return [
                    'distance_meters' => $distances === [] ? null : min($distances),
                    'is_within_radius' => false,
                    'accuracy_meters' => $acc,
                    'reason' => 'Outside both office and home geofences.',
                    'branch_distance_meters' => $branchResult['distance_meters'],
                    'home_distance_meters' => $homeResult['distance_meters'],
                    'verified_against_type' => null,
                    'verified_against_id' => null,
                ];
            }

            usort(
                $candidates,
                fn ($a, $b) => ($a['distance_meters'] ?? PHP_FLOAT_MAX) <=> ($b['distance_meters'] ?? PHP_FLOAT_MAX),
            );

            return $candidates[0];
        }

        $result = $this->gpsService->verify(
            $employee->branch,
            $lat,
            $lng,
            $acc,
        );

        $result['verified_against_type'] = 'branch';
        $result['verified_against_id'] = $employee->branch_id;

        return $result;
    }

    private function homeLocationRequiredException(Employee $employee): HomeLocationRequiredException
    {
        $hasPending = $employee->homeLocations()
            ->where('home_locations.status', 'pending')
            ->exists();

        return new HomeLocationRequiredException(
            $hasPending
                ? 'Your home location is pending HR approval.'
                : 'Set and get approval for your home location before clocking in.',
            $hasPending ? 'home_location_pending' : 'home_location_required',
        );
    }

    private function verifyGps(Employee $employee, array $data): array
    {
        $result = $this->resolveGpsVerification($employee, $data);

        if (! $result['is_within_radius']) {
            $type = $result['verified_against_type'] ?? null;
            $message = match ($type) {
                'home_location' => 'You are outside the allowed GPS radius for your approved home location.',
                'branch' => 'You are outside the allowed GPS radius for your assigned branch.',
                default => $employee->isHybrid()
                    ? 'You are outside both your office and home allowed areas.'
                    : 'You are outside the allowed GPS radius for your assigned branch.',
            };

            throw new GpsOutOfRangeException($message, $result);
        }

        return $result;
    }

    public function storePhotoOnly(Employee $employee, Attendance $attendance, UploadedFile $selfie): AttendancePhoto
    {
        $path = $this->imageService->compressAndStore($selfie, 'attendance', config('dtr.attendance.photo_disk'));

        return AttendancePhoto::create([
            'attendance_id' => $attendance->id,
            'path' => $path,
            'captured_at' => now(),
        ]);
    }

    public function captureAndVerifyPhoto(Employee $employee, Attendance $attendance, ?UploadedFile $selfie): ?AttendancePhoto
    {
        if (! $selfie) {
            return null;
        }

        return $this->storePhotoOnly($employee, $attendance, $selfie);
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
            'verified_against_type' => $gps['verified_against_type'] ?? null,
            'verified_against_id' => $gps['verified_against_id'] ?? null,
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

    /**
     * Latest open time_in as of $asOf (chronological), not merely "unclosed by id today".
     * Prevents late offline time_in syncs from inserting a second clock-in inside an already
     * closed session, and supports overnight shifts that span calendar days.
     */
    public function openPunchFor(Employee $employee, string $type, ?Carbon $asOf = null): ?Attendance
    {
        if ($type !== 'time_in') {
            return null;
        }

        return $this->openTimeInAsOf($employee, $asOf ?? now());
    }

    public function openTimeInAsOf(Employee $employee, Carbon $asOf): ?Attendance
    {
        $latest = Attendance::query()
            ->where('employee_id', $employee->id)
            ->whereIn('type', ['time_in', 'time_out'])
            ->where('timestamp', '<=', $asOf)
            ->orderByDesc('timestamp')
            ->orderByDesc('id')
            ->first();

        return $latest !== null && $latest->type === 'time_in' ? $latest : null;
    }

    public function openBreakFor(Employee $employee, ?Carbon $asOf = null): ?Attendance
    {
        $asOf ??= now();
        $timeIn = $this->openTimeInAsOf($employee, $asOf);

        if (! $timeIn) {
            return null;
        }

        $latest = Attendance::query()
            ->where('employee_id', $employee->id)
            ->whereIn('type', ['break_in', 'break_out'])
            ->where('timestamp', '>=', $timeIn->timestamp)
            ->where('timestamp', '<=', $asOf)
            ->where('id', '>', $timeIn->id)
            ->orderByDesc('timestamp')
            ->orderByDesc('id')
            ->first();

        return $latest !== null && $latest->type === 'break_in' ? $latest : null;
    }

    public function sessionFor(Employee $employee): array
    {
        $timeIn = $this->openTimeInAsOf($employee, now());
        $break = $timeIn ? $this->openBreakFor($employee, now()) : null;

        return [
            'open' => $timeIn !== null,
            'on_break' => $break !== null,
            'time_in' => $timeIn ? $this->sessionPunch($timeIn) : null,
            'break' => $break ? $this->sessionPunch($break) : null,
        ];
    }

    private function sessionPunch(Attendance $row): array
    {
        return [
            'id' => $row->id,
            'uuid' => $row->uuid,
            'type' => $row->type,
            'timestamp' => $row->timestamp?->toISOString(),
            'break_kind' => $row->break_kind,
            'expected_end_at' => $row->expected_end_at?->toISOString(),
        ];
    }

    public function hasCompletedBreakSince(Employee $employee, Attendance $timeIn): bool
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
