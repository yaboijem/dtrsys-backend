<?php

namespace App\Services;

use App\Exceptions\DeviceBlockedException;
use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthService
{
    public function __construct(
        private readonly DeviceService $deviceService,
    ) {}

    public function login(string $employeeId, string $password, array $deviceData = []): array
    {
        $user = User::where('employee_id', $employeeId)->first();

        if (! $user || ! Hash::check($password, $user->password)) {
            throw ValidationException::withMessages([
                'employee_id' => ['The provided credentials are incorrect.'],
            ]);
        }

        if (! $user->is_active) {
            throw ValidationException::withMessages([
                'employee_id' => ['Your account has been deactivated. Contact HR.'],
            ]);
        }

        $employee = $user->employee;

        if (! $employee) {
            throw ValidationException::withMessages([
                'employee_id' => ['No employee profile is linked to this account.'],
            ]);
        }

        $result = $this->deviceService->resolveForLogin($employee, $deviceData['device_id'] ?? null, $deviceData);

        if ($result['status'] === DeviceService::STATUS_BLOCKED) {
            throw new DeviceBlockedException(
                $result['reason'],
                isset($result['pending_request']) && $result['pending_request'] !== false,
            );
        }

        $token = $user->createToken('mobile')->plainTextToken;

        return ['user' => $user, 'token' => $token];
    }
}
