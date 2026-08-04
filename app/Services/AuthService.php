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
        private readonly MfaService $mfaService,
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

    public function verifyMfa(string $mfaToken, ?string $code, ?string $recoveryCode): array
    {
        ['user' => $user, 'payload' => $payload] = $this->mfaService->resolveToken($mfaToken);

        if (($payload['purpose'] ?? null) !== 'login') {
            throw ValidationException::withMessages([
                'mfa_token' => ['The MFA token is invalid or has expired.'],
            ]);
        }

        if (! $user->hasConfiguredTwoFactor()) {
            throw ValidationException::withMessages([
                'code' => ['Two-factor authentication is not set up yet.'],
            ]);
        }

        $verified = false;

        if ($code !== null && $this->mfaService->verifyCode($user->two_factor_secret, $code)) {
            $verified = true;
        } elseif ($recoveryCode !== null && $this->mfaService->consumeRecoveryCode($user, $recoveryCode)) {
            $verified = true;
        }

        if (! $verified) {
            throw ValidationException::withMessages([
                'code' => ['The provided code is invalid.'],
            ]);
        }

        $this->resolveDeviceForLogin($user, $payload);

        return ['user' => $user, 'token' => $user->createToken('mobile')->plainTextToken];
    }

    public function setupTwoFactor(string $mfaToken): array
    {
        ['user' => $user, 'payload' => $payload] = $this->mfaService->resolveToken($mfaToken);

        if (! in_array($payload['purpose'] ?? null, ['login', 'setup'], true)) {
            throw ValidationException::withMessages([
                'mfa_token' => ['The MFA token is invalid or has expired.'],
            ]);
        }

        if ($user->hasConfiguredTwoFactor()) {
            throw ValidationException::withMessages([
                'code' => ['Two-factor authentication is already configured.'],
            ]);
        }

        $secret = $this->mfaService->generateSecret();

        return [
            'secret' => $secret['secret'],
            'otpauth_url' => $secret['otpauth_url'],
            'qr_code' => $this->mfaService->qrCodeDataUrl($secret['otpauth_url']),
            'mfa_token' => $this->mfaService->issueToken($user, 'confirm', ['secret' => $secret['secret']]),
        ];
    }

    public function confirmTwoFactor(string $mfaToken, string $code): array
    {
        ['user' => $user, 'payload' => $payload] = $this->mfaService->resolveToken($mfaToken);

        if (($payload['purpose'] ?? null) !== 'confirm' || ! isset($payload['secret'])) {
            throw ValidationException::withMessages([
                'mfa_token' => ['The MFA token is invalid or has expired.'],
            ]);
        }

        if ($user->hasConfiguredTwoFactor()) {
            throw ValidationException::withMessages([
                'code' => ['Two-factor authentication is already configured.'],
            ]);
        }

        if (! $this->mfaService->verifyCode($payload['secret'], $code)) {
            throw ValidationException::withMessages([
                'code' => ['The provided code is invalid.'],
            ]);
        }

        $recoveryCodes = $this->mfaService->generateRecoveryCodes();

        $user->update([
            'two_factor_secret' => $payload['secret'],
            'two_factor_confirmed_at' => now(),
            'two_factor_recovery_codes' => $this->mfaService->hashRecoveryCodes($recoveryCodes),
        ]);

        return ['user' => $user, 'token' => $user->createToken('mobile')->plainTextToken, 'recovery_codes' => $recoveryCodes];
    }

    private function resolveDeviceForLogin(User $user, array $payload): void
    {
        $deviceData = $payload['device'] ?? [];

        $result = $this->deviceService->resolveForLogin(
            $user->employee,
            $deviceData['device_id'] ?? null,
            $deviceData,
        );

        if ($result['status'] === DeviceService::STATUS_BLOCKED) {
            throw new DeviceBlockedException(
                $result['reason'],
                isset($result['pending_request']) && $result['pending_request'] !== false,
            );
        }
    }
}
