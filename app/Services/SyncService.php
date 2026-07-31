<?php

namespace App\Services;

use App\Models\Attendance;
use App\Models\Device;
use App\Models\GpsLocation;
use App\Models\SyncLog;
use App\Models\User;
use Carbon\Carbon;

class SyncService
{
    public function __construct(
        private readonly GPSService $gpsService,
        private readonly FraudDetectionService $fraudDetectionService,
    ) {}

    /**
     * Server-side validation and storage of offline attendance records.
     */
    public function sync(User $user, array $records, ?string $deviceId = null): array
    {
        $employee = $user->employee;
        $device = $deviceId ? Device::where('device_id', $deviceId)->first() : null;
        $now = now();

        $results = [];
        $synced = 0;
        $failed = 0;
        $duplicates = 0;

        foreach ($records as $index => $record) {
            $record = is_array($record) ? $record : [];

            try {
                $attendance = $this->storeRecord($employee, $device, $record);

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

    private function storeRecord($employee, ?Device $device, array $record): Attendance|string
    {
        $clientUuid = $record['client_uuid'] ?? null;

        if (! $clientUuid) {
            throw new \InvalidArgumentException('client_uuid is required for every record.');
        }

        if (Attendance::where('uuid', $clientUuid)->exists()) {
            return 'duplicate';
        }

        $type = $record['type'] ?? null;
        $timestamp = $this->parseTimestamp($record['timestamp'] ?? null);

        if (! in_array($type, ['time_in', 'time_out'], true)) {
            throw new \InvalidArgumentException('type must be time_in or time_out.');
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

        $this->fraudDetectionService->evaluate($attendance);

        return $attendance;
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
