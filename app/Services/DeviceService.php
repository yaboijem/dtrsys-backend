<?php

namespace App\Services;

use App\Models\Device;
use App\Models\DeviceChangeRequest;
use App\Models\Employee;

class DeviceService
{
    public const STATUS_REGISTERED = 'registered';

    public const STATUS_BLOCKED = 'blocked';

    public function resolveForLogin(Employee $employee, ?string $deviceId, array $metadata = []): array
    {
        if (blank($deviceId)) {
            return ['status' => self::STATUS_REGISTERED, 'device' => null];
        }

        $existing = Device::where('device_id', $deviceId)->first();

        if ($existing && $existing->employee_id !== $employee->id) {
            if ($existing->is_shared) {
                $existing->update([
                    'last_seen_at' => now(),
                    'is_active' => true,
                    ...$metadata,
                ]);

                return ['status' => self::STATUS_REGISTERED, 'device' => $existing];
            }

            return [
                'status' => self::STATUS_BLOCKED,
                'device' => $existing,
                'reason' => 'This device is registered to another employee.',
                'pending_request' => false,
            ];
        }

        if ($existing) {
            $existing->update([
                'last_seen_at' => now(),
                'is_active' => true,
                ...$metadata,
            ]);

            return ['status' => self::STATUS_REGISTERED, 'device' => $existing];
        }

        $hasActiveDevice = $employee->devices()->where('is_active', true)->exists();

        if (! $hasActiveDevice) {
            return [
                'status' => self::STATUS_REGISTERED,
                'device' => $this->registerDevice($employee, $deviceId, $metadata),
            ];
        }

        $approved = DeviceChangeRequest::where('new_device_id', $deviceId)
            ->where('status', 'approved')
            ->exists();

        if ($approved) {
            $device = $this->registerDevice($employee, $deviceId, $metadata);
            $employee->devices()->where('id', '!=', $device->id)->update(['is_active' => false]);

            return ['status' => self::STATUS_REGISTERED, 'device' => $device];
        }

        $pending = DeviceChangeRequest::firstOrCreate(
            [
                'employee_id' => $employee->id,
                'new_device_id' => $deviceId,
                'status' => 'pending',
            ],
            [
                'current_device_id' => $employee->devices()->where('is_active', true)->value('id'),
                'reason' => 'Automatic request created on login from a new device.',
            ],
        );

        return [
            'status' => self::STATUS_BLOCKED,
            'device' => null,
            'reason' => 'This device is not registered to your account. A change request has been submitted for HR approval.',
            'pending_request' => $pending,
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
}
