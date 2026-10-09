<?php

namespace App\Services;

use App\Exceptions\InvalidGoogleIdToken;
use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthService
{
    public function __construct(
        private readonly DeviceService $deviceService,
        private readonly GoogleIdTokenVerifier $googleIdTokenVerifier,
    ) {}

    public function login(string $employeeId, string $password, array $deviceData = []): array
    {
        $user = User::where('employee_id', $employeeId)->first();

        if ($user !== null && $user->employee_id !== $employeeId) {
            $user = null;
        }

        if (! $user || ! Hash::check($password, $user->password)) {
            throw ValidationException::withMessages([
                'employee_id' => ['That employee ID and password do not match. Check both and try again.'],
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

        $this->deviceService->resolveForLogin($employee, $deviceData['device_id'] ?? null, $deviceData);

        $token = $user->createToken('mobile')->plainTextToken;

        return ['user' => $user, 'token' => $token];
    }

    public function loginWithGoogle(string $idToken, array $deviceData = []): array
    {
        if (blank(config('services.google.client_id'))) {
            $this->reject('id_token', 'Google sign-in is not configured.');
        }

        try {
            $claims = $this->googleIdTokenVerifier->verify($idToken);
        } catch (InvalidGoogleIdToken) {
            $this->reject('id_token', 'Google sign-in failed. Try again.');
        }

        if ($claims['email_verified'] !== true) {
            $this->reject('email', 'Google sign-in failed. Try again.');
        }

        $users = User::query()
            ->whereRaw('LOWER(email) = ?', [mb_strtolower($claims['email'])])
            ->limit(2)
            ->get();

        if ($users->isEmpty()) {
            $this->reject('email', 'No employee account uses this Google email.');
        }

        if ($users->count() > 1) {
            $this->reject('email', 'Google sign-in failed. Try again.');
        }

        $user = $users->first();

        if (! $user->is_active) {
            $this->reject('email', 'Your account has been deactivated. Contact HR.');
        }

        $employee = $user->employee;

        if (! $employee) {
            $this->reject('email', 'No employee profile is linked to this account.');
        }

        $this->deviceService->resolveForLogin($employee, $deviceData['device_id'] ?? null, $deviceData);

        return [
            'user' => $user,
            'token' => $user->createToken('mobile')->plainTextToken,
        ];
    }

    private function reject(string $key, string $message): never
    {
        throw ValidationException::withMessages([
            $key => [$message],
        ]);
    }
}
