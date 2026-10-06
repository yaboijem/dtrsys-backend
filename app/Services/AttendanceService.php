<?php

namespace App\Services;

use App\Exceptions\AttendanceConflictException;
use App\Exceptions\BreaksDisabledException;
use App\Exceptions\GpsOutOfRangeException;
use App\Exceptions\HomeLocationRequiredException;
use App\Jobs\NotifyTimedBreakEndingJob;
use App\Models\AppSetting;
use App\Models\Attendance;
use App\Models\AttendancePhoto;
use App\Models\Device;
use App\Models\Employee;
use App\Models\GpsLocation;
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

                $attendance = $this->createPunch($employee, 'time_in', $now, $data);
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

                $attendance = $this->createPunch($employee, 'time_out', $now, $data);
                $attendance->update(['work_minutes' => $this->computeWorkMinutes($timeIn, $now)]);

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

                $attendance = $this->createPunch($employee, 'break_in', $now, $data);
                $this->storeGpsLocation($attendance, $employee, $gps);
                $this->scheduleTimedBreakAlert($attendance);

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
        $breakMinutes = max(0, (int) $breakIn->timestamp->diffInMinutes($now));
        $attendance = $this->createPunch($employee, 'break_out', $now, $data);
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

    public function computeWorkMinutes(Attendance $timeIn, Carbon $timeOut): int
    {
        $total = max(0, (int) $timeIn->timestamp->diffInMinutes($timeOut));

        $actualBreakMinutes = (int) Attendance::query()
            ->where('employee_id', $timeIn->employee_id)
            ->where('type', 'break_out')
            ->where('timestamp', '>', $timeIn->timestamp)
            ->where('timestamp', '<=', $timeOut)
            ->sum('break_minutes');

        return max(0, $total - $actualBreakMinutes);
    }

    private function scheduleTimedBreakAlert(Attendance $attendance): void
    {
        if (! in_array($attendance->break_kind, ['15_min', '5_min'], true) || $attendance->expected_end_at === null) {
            return;
        }

        NotifyTimedBreakEndingJob::dispatch($attendance->id)
            ->delay($attendance->expected_end_at->copy()->subMinutes(2));
    }

    private function expectedEndAt(?string $kind, Carbon $now): ?Carbon
    {
        return match ($kind) {
            '15_min' => $now->copy()->addMinutes(15),
            '5_min' => $now->copy()->addMinutes(5), // TEST ONLY: remove before production
            'lunch_60' => $now->copy()->addMinutes(60),
            default => null,
        };
    }

    private function createPunch(Employee $employee, string $type, Carbon $now, array $data): Attendance
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
            'is_late' => false,
            'is_early_timeout' => false,
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

    public function latestWorkPunches(Employee $employee)
    {
        $boundary = Attendance::query()
            ->where('employee_id', $employee->id)
            ->whereIn('type', ['time_in', 'time_out'])
            ->orderByDesc('timestamp')
            ->orderByDesc('id')
            ->first();

        if ($boundary === null) {
            return Attendance::query()->whereRaw('0 = 1')->get();
        }

        $timeIn = $boundary->type === 'time_in'
            ? $boundary
            : Attendance::query()
                ->where('employee_id', $employee->id)
                ->where('type', 'time_in')
                ->where(function ($query) use ($boundary) {
                    $query->where('timestamp', '<', $boundary->timestamp)
                        ->orWhere(function ($query) use ($boundary) {
                            $query->where('timestamp', $boundary->timestamp)
                                ->where('id', '<', $boundary->id);
                        });
                })
                ->orderByDesc('timestamp')
                ->orderByDesc('id')
                ->first();

        if ($timeIn === null) {
            return Attendance::query()->whereRaw('0 = 1')->get();
        }

        $punches = Attendance::query()
            ->with(['branch', 'photo', 'gpsLocation', 'fraudFlags'])
            ->where('employee_id', $employee->id)
            ->where(function ($query) use ($timeIn) {
                $query->where('timestamp', '>', $timeIn->timestamp)
                    ->orWhere(function ($query) use ($timeIn) {
                        $query->where('timestamp', $timeIn->timestamp)
                            ->where('id', '>=', $timeIn->id);
                    });
            });

        if ($boundary->type === 'time_out') {
            $punches->where(function ($query) use ($boundary) {
                $query->where('timestamp', '<', $boundary->timestamp)
                    ->orWhere(function ($query) use ($boundary) {
                        $query->where('timestamp', $boundary->timestamp)
                            ->where('id', '<=', $boundary->id);
                    });
            });
        }

        return $punches->orderBy('timestamp')->orderBy('id')->get();
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function openSessions(): array
    {
        $rows = DB::select(
            "WITH latest_shift AS (
                SELECT employee_id, id, type, timestamp,
                       ROW_NUMBER() OVER (PARTITION BY employee_id ORDER BY timestamp DESC, id DESC) AS rn
                FROM attendance
                WHERE deleted_at IS NULL
                  AND type IN ('time_in', 'time_out')
            ),
            open_shifts AS (
                SELECT employee_id, id, timestamp
                FROM latest_shift
                WHERE rn = 1 AND type = 'time_in'
            ),
            latest_break AS (
                SELECT a.employee_id, a.break_kind, a.timestamp, a.type,
                       ROW_NUMBER() OVER (PARTITION BY a.employee_id ORDER BY a.timestamp DESC, a.id DESC) AS rn
                FROM attendance a
                INNER JOIN open_shifts o ON o.employee_id = a.employee_id
                WHERE a.deleted_at IS NULL
                  AND a.type IN ('break_in', 'break_out')
                  AND a.timestamp >= o.timestamp
                  AND a.id > o.id
            )
            SELECT o.employee_id, o.timestamp AS time_in_at, b.break_kind, b.timestamp AS break_started_at
            FROM open_shifts o
            LEFT JOIN latest_break b
              ON b.employee_id = o.employee_id AND b.rn = 1 AND b.type = 'break_in'
            ORDER BY o.timestamp",
        );

        if ($rows === []) {
            return [];
        }

        $employees = Employee::query()
            ->with(['user', 'branch', 'department'])
            ->whereIn('id', collect($rows)->pluck('employee_id'))
            ->get()
            ->keyBy('id');

        return collect($rows)->map(function ($row) use ($employees) {
            $employee = $employees->get($row->employee_id);
            if (! $employee) {
                return null;
            }

            $onBreak = $row->break_started_at !== null;

            return [
                'employee_id' => $employee->id,
                'employee_code' => $employee->user?->employee_id,
                'name' => $employee->full_name,
                'branch' => $employee->branch?->name,
                'department' => $employee->department?->name,
                'status' => $onBreak ? 'on_break' : 'time_in',
                'time_in_at' => Carbon::parse($row->time_in_at)->toISOString(),
                'break_kind' => $onBreak ? $row->break_kind : null,
                'break_started_at' => $onBreak ? Carbon::parse($row->break_started_at)->toISOString() : null,
            ];
        })->filter()->values()->all();
    }

    /**
     * @return list<Attendance>
     */
    public function adminOverride(Employee $employee, string $action, ?string $notes = null, ?Carbon $at = null): array
    {
        $at ??= now();
        if ($at->greaterThan(now())) {
            throw new AttendanceConflictException('Close time cannot be in the future.');
        }

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
            return DB::transaction(function () use ($employee, $action, $notes, $at) {
                $timeIn = $this->openTimeInAsOf($employee, $at);
                if (! $timeIn) {
                    throw new AttendanceConflictException('This employee has no open session.');
                }
                if ($at->lt($timeIn->timestamp)) {
                    throw new AttendanceConflictException('Close time must be after time in.');
                }

                $break = $this->openBreakFor($employee, $at);
                $note = $notes ? 'Admin override: '.$notes : 'Admin override';
                $created = [];

                if ($action === 'break_out') {
                    if (! $break) {
                        throw new AttendanceConflictException('This employee is not on break.');
                    }
                    if ($at->lt($break->timestamp)) {
                        throw new AttendanceConflictException('Close time must be after the break started.');
                    }
                    $created[] = $this->writeAdminBreakOut($employee, $break, $at, $note);

                    return $created;
                }

                if ($break) {
                    if ($at->lt($break->timestamp)) {
                        throw new AttendanceConflictException('Close time must be after the break started.');
                    }
                    $created[] = $this->writeAdminBreakOut($employee, $break, $at, $note);
                }

                $punch = $this->createPunch($employee, 'time_out', $at, [
                    'source' => 'admin',
                    'notes' => $note,
                ]);
                $punch->update(['work_minutes' => $this->computeWorkMinutes($timeIn, $at)]);
                $created[] = $punch->fresh();

                return $created;
            });
        } finally {
            $lock->release();
        }
    }

    private function writeAdminBreakOut(Employee $employee, Attendance $breakIn, Carbon $at, string $note): Attendance
    {
        $breakMinutes = max(0, (int) $breakIn->timestamp->diffInMinutes($at));
        $attendance = $this->createPunch($employee, 'break_out', $at, [
            'source' => 'admin',
            'notes' => $note,
        ]);
        $attendance->update([
            'break_minutes' => $breakMinutes,
            'is_overbreak' => $breakMinutes > 60,
            'break_kind' => $breakIn->break_kind,
            'expected_end_at' => $breakIn->expected_end_at,
        ]);

        return $attendance->fresh();
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
