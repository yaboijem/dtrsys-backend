<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\GoogleLoginRequest;
use App\Http\Requests\LoginRequest;
use App\Http\Resources\UserResource;
use App\Services\AuthService;
use App\Support\AuthCookie;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AuthController extends Controller
{
    public function __construct(
        private readonly AuthService $authService,
    ) {}

    public function login(LoginRequest $request): JsonResponse
    {
        $result = $this->authService->login(
            $request->input('employee_id'),
            $request->input('password'),
            $request->only(['device_id', 'platform', 'model', 'app_version']),
        );

        $result['user']->load(['employee.branch', 'employee.department', 'employee.position']);

        return $this->authenticated($result);
    }

    public function google(GoogleLoginRequest $request): JsonResponse
    {
        $result = $this->authService->loginWithGoogle(
            $request->string('id_token')->toString(),
            $request->only(['device_id', 'platform', 'model', 'app_version']),
        );

        $result['user']->load(['employee.branch', 'employee.department', 'employee.position']);

        return $this->authenticated($result);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()?->delete();

        return response()->json(['message' => 'Logged out.'])->withCookie(AuthCookie::forget());
    }

    private function authenticated(array $result): JsonResponse
    {
        return response()->json([
            'message' => 'Login successful.',
            'user' => new UserResource($result['user']),
        ])->withCookie(AuthCookie::make($result['token']));
    }

    public function me(Request $request): UserResource
    {
        return new UserResource($request->user()->load(['employee.branch', 'employee.department', 'employee.position']));
    }
}
