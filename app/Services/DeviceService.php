<?php

namespace App\Services;

use App\Models\Device;
use App\Models\Employee;

class DeviceService
{
    public const STATUS_REGISTERED = 'registered';

    public const STATUS_BLOCKED = 'blocked';

    /**
     * Resolve or register a device for login. Never blocks — any employee may use any device_id.
     * If the device row exists under another employee, ownership is reassigned to the logging-in employee.
     */
    public function resolveForLogin(Employee $employee, ?string $deviceId, array $metadata = []): array
    {
        if (blank($deviceId)) {
            return ['status' => self::STATUS_REGISTERED, 'device' => null];
        }

        $existing = Device::where('device_id', $deviceId)->first();

        if ($existing) {
            $existing->update([
                'employee_id' => $employee->id,
                'last_seen_at' => now(),
                'is_active' => true,
                ...$this->deviceMetadata($metadata),
            ]);

            return ['status' => self::STATUS_REGISTERED, 'device' => $existing->fresh()];
        }

        return [
            'status' => self::STATUS_REGISTERED,
            'device' => $this->registerDevice($employee, $deviceId, $metadata),
        ];
    }

    public function registerDevice(Employee $employee, string $deviceId, array $metadata = []): Device
    {
        return Device::create([
            'employee_id' => $employee->id,
            'device_id' => $deviceId,
            'platform' => $metadata['platform'] ?? null,
            'model' => $metadata['model'] ?? null,
            'app_version' => $metadata['app_version'] ?? null,
            'first_seen_at' => now(),
            'last_seen_at' => now(),
            'is_active' => true,
        ]);
    }

    /**
     * @param  array<string, mixed>  $metadata
     * @return array{platform?: mixed, model?: mixed, app_version?: mixed}
     */
    private function deviceMetadata(array $metadata): array
    {
        return array_filter([
            'platform' => $metadata['platform'] ?? null,
            'model' => $metadata['model'] ?? null,
            'app_version' => $metadata['app_version'] ?? null,
        ], fn ($value) => $value !== null);
    }
}
