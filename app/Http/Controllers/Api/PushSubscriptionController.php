<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PushSubscription;
use App\Services\WebPushService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PushSubscriptionController extends Controller
{
    public function __construct(
        private readonly WebPushService $webPushService,
    ) {}

    public function publicKey(): JsonResponse
    {
        $key = $this->webPushService->publicKey();

        if ($key === null) {
            return response()->json([
                'message' => 'Device push is not configured.',
                'code' => 'push_not_configured',
            ], 503);
        }

        return response()->json(['public_key' => $key]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'endpoint' => ['required', 'string', 'max:2048'],
            'keys.p256dh' => ['required', 'string', 'max:255'],
            'keys.auth' => ['required', 'string', 'max:255'],
            'content_encoding' => ['nullable', 'in:aes128gcm,aesgcm'],
        ]);

        PushSubscription::query()->updateOrCreate(
            ['endpoint_hash' => hash('sha256', $data['endpoint'])],
            [
                'user_id' => $request->user()->id,
                'endpoint' => $data['endpoint'],
                'public_key' => $data['keys']['p256dh'],
                'auth_token' => $data['keys']['auth'],
                'content_encoding' => $data['content_encoding'] ?? 'aes128gcm',
            ],
        );

        return response()->json(['message' => 'Device registered for alerts.']);
    }

    public function destroy(Request $request): JsonResponse
    {
        $data = $request->validate([
            'endpoint' => ['required', 'string', 'max:2048'],
        ]);

        PushSubscription::query()
            ->where('user_id', $request->user()->id)
            ->where('endpoint', $data['endpoint'])
            ->delete();

        return response()->json(['message' => 'Device alerts turned off.']);
    }
}
