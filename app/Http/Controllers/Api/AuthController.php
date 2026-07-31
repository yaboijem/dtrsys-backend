<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\LoginRequest;
use App\Http\Requests\MfaConfirmRequest;
use App\Http\Requests\MfaDisableRequest;
use App\Http\Requests\MfaEnableRequest;
use App\Http\Requests\MfaVerifyRequest;
use App\Http\Resources\UserResource;
use App\Services\AuditService;
use App\Services\AuthService;
use App\Services\MfaService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function __construct(
        private readonly AuthService $authService,
        private readonly MfaService $mfaService,
        private readonly AuditService $auditService,
    ) {}

    public function login(LoginRequest $request): JsonResponse
    {
        $result = $this->authService->login(
            $request->input('employee_id'),
            $request->input('password'),
            $request->only(['device_id', 'platform', 'model', 'app_version']),
        );

        if (($result['mfa_required'] ?? false) === true) {
            return response()->json([
                'message' => 'Two-factor authentication is required to continue.',
                'mfa_required' => true,
                'mfa_setup_required' => $result['mfa_setup_required'] ?? false,
                'mfa_token' => $result['mfa_token'],
            ]);
        }

        $result['user']->load('employee.branch');

        return response()->json([
            'message' => 'Login successful.',
            'token' => $result['token'],
            'user' => new UserResource($result['user']),
        ]);
    }

    public function mfaVerify(MfaVerifyRequest $request): JsonResponse
    {
        $result = $this->authService->verifyMfa(
            $request->input('mfa_token'),
            $request->input('code'),
            $request->input('recovery_code'),
        );

        $result['user']->load('employee.branch');

        return response()->json([
            'message' => 'Login successful.',
            'token' => $result['token'],
            'user' => new UserResource($result['user']),
        ]);
    }

    public function mfaEnable(MfaEnableRequest $request): JsonResponse
    {
        $result = $this->authService->setupTwoFactor($request->input('mfa_token'));

        return response()->json([
            'message' => 'Scan the QR code with your authenticator app, then confirm with the code it shows.',
            'secret' => $result['secret'],
            'otpauth_url' => $result['otpauth_url'],
            'qr_code' => $result['qr_code'],
            'mfa_token' => $result['mfa_token'],
        ]);
    }

    public function mfaConfirm(MfaConfirmRequest $request): JsonResponse
    {
        $result = $this->authService->confirmTwoFactor(
            $request->input('mfa_token'),
            $request->input('code'),
        );

        $this->auditService->record($result['user'], 'mfa.enabled', $result['user']);

        $result['user']->load('employee.branch');

        return response()->json([
            'message' => 'Two-factor authentication enabled. Save your recovery codes somewhere safe.',
            'token' => $result['token'],
            'user' => new UserResource($result['user']),
            'recovery_codes' => $result['recovery_codes'],
        ]);
    }

    public function mfaDisable(MfaDisableRequest $request): JsonResponse
    {
        $user = $request->user();

        if (! $user->hasConfiguredTwoFactor()) {
            throw ValidationException::withMessages([
                'code' => ['Two-factor authentication is not enabled.'],
            ]);
        }

        if (! Hash::check($request->input('password'), $user->password)) {
            throw ValidationException::withMessages([
                'password' => ['The provided password is incorrect.'],
            ]);
        }

        if (! $this->mfaService->verifyCode($user->two_factor_secret, $request->input('code'))) {
            throw ValidationException::withMessages([
                'code' => ['The provided code is invalid.'],
            ]);
        }

        $user->update([
            'two_factor_secret' => null,
            'two_factor_confirmed_at' => null,
            'two_factor_recovery_codes' => null,
        ]);

        $this->auditService->record($user, 'mfa.disabled', $user);

        return response()->json(['message' => 'Two-factor authentication disabled.']);
    }

    public function mfaStatus(Request $request): JsonResponse
    {
        $user = $request->user();

        return response()->json([
            'mfa_enabled' => $user->hasConfiguredTwoFactor(),
            'mfa_required_by_role' => $this->mfaService->isPrivileged($user),
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json(['message' => 'Logged out.']);
    }

    public function me(Request $request): UserResource
    {
        return new UserResource($request->user()->load('employee.branch'));
    }
}
