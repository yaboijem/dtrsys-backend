<?php

namespace App\Services;

use App\Exceptions\AttendanceConflictException;
use App\Jobs\VerifyAttendancePhotoJob;
use App\Models\Attendance;
use App\Models\Device;
use App\Models\GpsLocation;
use App\Models\SyncLog;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Contracts\Cache\LockTimeoutException;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Cache;

class SyncService
{
    public function __construct(
        private readonly GPSService $gpsService,
        private readonly FraudDetectionService $fraudDetectionService,
        private readonly AttendanceService $attendanceService,
        private readonly ScheduleService $scheduleService,
    ) {}

    /**
     * Server-side validation and storage of offline attendance records.
     *
     * @param  array<int, UploadedFile|null>  $photos  keyed by record index
     */
    public function sync(User $user, array $records, ?string $deviceId = null, array $photos = []): array
    {
        $employee = $user->employee;
        $device = $deviceId ? Device::where('device_id', $deviceId)->first() : null;
        $now = now();

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
            return $this->applySync($employee, $device, $records, $photos, $now);
        } finally {
            $lock->release();
        }
    }

    /**
     * @param  array<int, UploadedFile|null>  $photos
     */
    private function applySync($employee, ?Device $device, array $records, array $photos, Carbon $now): array
    {
        $ordered = $this->orderRecordsByTimestamp($records);

        $results = [];
        $synced = 0;
        $failed = 0;
        $duplicates = 0;

        foreach ($ordered as $item) {
            $index = $item['index'];
            $record = $item['record'];

            try {
                $attendance = $this->storeRecord($employee, $device, $record, $photos[$index] ?? null);

                if ($attendance === 'duplicate') {
                    $duplicates++;
                    $results[] = ['index' => $index, 'status' => 'duplicate'];

                    continue;
                }

                $synced++;
                $results[] = [
                    'index' => $index,
                    'status' => 'created',
                    'uuid' => $attendance->uuid,
                    'photo' => $this->photoResult($attendance),
                ];
            } catch (\Throwable $e) {
                $failed++;
                $results[] = [
                    'index' => $index,
                    'status' => 'failed',
                    'message' => $e->getMessage(),
                ];
            }
        }

        // Keep result order aligned with the original client payload indices.
        usort($results, fn (array $a, array $b) => $a['index'] <=> $b['index']);

        $log = SyncLog::create([
            'employee_id' => $employee->id,
            'device_id' => $device?->id,
            'payload_count' => count($records),
            'status' => $failed > 0 && $synced > 0 ? 'partial' : ($failed > 0 ? 'failed' : 'success'),
            'error_message' => $failed > 0 ? "{$failed} record(s) failed validation." : null,
            'synced_at' => $now,
        ]);

        return [
            'synced' => $synced,
            'failed' => $failed,
            'duplicates' => $duplicates,
            'records' => $results,
            'sync_log' => $log,
        ];
    }

    /**
     * @return list<array{index: int, record: array}>
     */
    private function orderRecordsByTimestamp(array $records): array
    {
        $ordered = [];

        foreach ($records as $index => $record) {
            $ordered[] = [
                'index' => $index,
                'record' => is_array($record) ? $record : [],
            ];
        }

        usort($ordered, function (array $a, array $b): int {
            $ta = $this->timestampSortKey($a['record']['timestamp'] ?? null);
            $tb = $this->timestampSortKey($b['record']['timestamp'] ?? null);

            if ($ta === $tb) {
                return $a['index'] <=> $b['index'];
            }

            return $ta <=> $tb;
        });

        return $ordered;
    }

    private function timestampSortKey(mixed $value): string
    {
        if (! $value) {
            return '';
        }

        try {
            return Carbon::parse($value)->format('Y-m-d H:i:s.u');
        } catch (\Throwable) {
            return (string) $value;
        }
    }

    private function storeRecord($employee, ?Device $device, array $record, ?UploadedFile $selfie = null): Attendance|string
    {
        $clientUuid = $record['client_uuid'] ?? null;

        if (! $clientUuid) {
            throw new \InvalidArgumentException('client_uuid is required for every record.');
        }

        if (Attendance::where('uuid', $clientUuid)->exists()) {
            return 'duplicate';
        }

        $type = $record['type'] ?? null;
        $timestamp = $this->parseTimestamp($record['timestamp'] ?? null)->setTimezone(config('app.timezone'));

        if (! in_array($type, ['time_in', 'time_out', 'break_in', 'break_out'], true)) {
            throw new \InvalidArgumentException('type must be time_in, time_out, break_in, or break_out.');
        }

        if ($timestamp->isFuture()) {
            throw new \InvalidArgumentException('timestamp cannot be in the future.');
        }

        $latitude = isset($record['latitude']) ? (float) $record['latitude'] : null;
        $longitude = isset($record['longitude']) ? (float) $record['longitude'] : null;

        if ($latitude === null || $longitude === null) {
            throw new \InvalidArgumentException('latitude and longitude are required.');
        }

        if ($device && $device->employee_id !== $employee->id) {
            throw new \InvalidArgumentException('device is not registered to this employee.');
        }

        $gps = $this->gpsService->verify(
            $employee->branch,
            $latitude,
            $longitude,
            isset($record['accuracy_meters']) ? (float) $record['accuracy_meters'] : null,
        );

        $workMinutes = null;
        $breakMinutes = null;
        $isOverbreak = false;
        $isEarlyTimeout = false;

        $this->assertTransitionAllowed($employee, $type);

        if ($type === 'break_out') {
            $breakIn = $this->attendanceService->openBreakFor($employee);
            $breakMinutes = max(0, (int) $breakIn->timestamp->diffInMinutes($timestamp));
            $isOverbreak = $breakMinutes > 60;
        }

        if ($type === 'time_out') {
            $timeIn = $this->attendanceService->openPunchFor($employee, 'time_in');
            $shift = $this->scheduleService->shiftFor($employee, $timestamp);
            $workMinutes = $this->attendanceService->computeWorkMinutes(
                $timeIn,
                \Illuminate\Support\Carbon::instance($timestamp),
                $shift,
            );
            $isEarlyTimeout = $this->attendanceService->isEarlyTimeout(
                \Illuminate\Support\Carbon::instance($timestamp),
                $shift,
                $timeIn->timestamp,
            );
        }

        $attendance = Attendance::create([
            'uuid' => $clientUuid,
            'employee_id' => $employee->id,
            'branch_id' => $employee->branch_id,
            'device_id' => $device?->id,
            'type' => $type,
            'timestamp' => $timestamp,
            'latitude' => $latitude,
            'longitude' => $longitude,
            'gps_accuracy_meters' => $record['accuracy_meters'] ?? null,
            'is_offline' => true,
            'is_late' => false,
            'is_early_timeout' => $isEarlyTimeout,
            'work_minutes' => $workMinutes,
            'break_minutes' => $breakMinutes,
            'is_overbreak' => $isOverbreak,
            'source' => 'sync',
            'notes' => $record['notes'] ?? null,
            'synced_at' => now(),
        ]);

        GpsLocation::create([
            'attendance_id' => $attendance->id,
            'employee_id' => $employee->id,
            'latitude' => $latitude,
            'longitude' => $longitude,
            'accuracy_meters' => $attendance->gps_accuracy_meters,
            'distance_from_branch_meters' => $gps['distance_meters'],
            'is_within_radius' => $gps['is_within_radius'],
            'captured_at' => $timestamp,
        ]);

        if ($selfie) {
            // Offline punches are always kept; face verification runs asynchronously.
            $photo = $this->attendanceService->storePhotoOnly($employee, $attendance, $selfie);
            VerifyAttendancePhotoJob::dispatch($photo->id);
        }

        $this->fraudDetectionService->evaluate($attendance->load(['photo', 'gpsLocation']));

        return $attendance;
    }

    private function assertTransitionAllowed($employee, string $type): void
    {
        match ($type) {
            'time_in' => $this->assertTimeInAllowed($employee),
            'time_out' => $this->assertTimeOutAllowed($employee),
            'break_in' => $this->assertBreakInAllowed($employee),
            'break_out' => $this->assertBreakOutAllowed($employee),
            default => null,
        };
    }

    private function assertTimeInAllowed($employee): void
    {
        if ($this->attendanceService->openPunchFor($employee, 'time_in')) {
            throw new \InvalidArgumentException('You already clocked in today.');
        }
    }

    private function assertTimeOutAllowed($employee): void
    {
        if (! $this->attendanceService->openPunchFor($employee, 'time_in')) {
            throw new \InvalidArgumentException('You have not clocked in yet today.');
        }

        if ($this->attendanceService->openBreakFor($employee)) {
            throw new \InvalidArgumentException('End your break before clocking out.');
        }
    }

    private function assertBreakInAllowed($employee): void
    {
        $timeIn = $this->attendanceService->openPunchFor($employee, 'time_in');

        if (! $timeIn) {
            throw new \InvalidArgumentException('You have not clocked in yet today.');
        }

        if ($this->attendanceService->openBreakFor($employee)) {
            throw new \InvalidArgumentException('You are already on break.');
        }

        if ($this->attendanceService->hasCompletedBreakSince($employee, $timeIn)) {
            throw new \InvalidArgumentException('You have already taken your break for this shift.');
        }
    }

    private function assertBreakOutAllowed($employee): void
    {
        if (! $this->attendanceService->openBreakFor($employee)) {
            throw new \InvalidArgumentException('You are not on break.');
        }
    }

    private function photoResult(Attendance $attendance): array
    {
        $photo = $attendance->photo;

        if (! $photo) {
            return ['present' => false];
        }

        return [
            'present' => true,
            'is_verified' => (bool) $photo->is_verified,
            'face_detected' => data_get($photo->verification_result, 'face_detected'),
            'flags' => $attendance->fraudFlags->pluck('type')->all(),
        ];
    }

    private function parseTimestamp(mixed $value): Carbon
    {
        if (! $value) {
            throw new \InvalidArgumentException('timestamp is required.');
        }

        try {
            return Carbon::parse($value);
        } catch (\Throwable) {
            throw new \InvalidArgumentException('timestamp is not a valid date.');
        }
    }
}
