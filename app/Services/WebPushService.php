<?php

namespace App\Services;

use App\Models\PushSubscription;
use App\Models\User;
use GuzzleHttp\Client;
use GuzzleHttp\Psr7\HttpFactory;
use Illuminate\Support\Facades\Log;
use Minishlink\WebPush\Subscription;
use Minishlink\WebPush\WebPush;

class WebPushService
{
    public function publicKey(): ?string
    {
        $key = config('dtr.push.vapid_public_key');

        return is_string($key) && $key !== '' ? $key : null;
    }

    public function send(User $user, string $title, string $body, array $data = []): void
    {
        $publicKey = $this->publicKey();
        $privateKey = config('dtr.push.vapid_private_key');

        if ($publicKey === null || ! is_string($privateKey) || $privateKey === '') {
            return;
        }

        $subscriptions = $user->pushSubscriptions()->get();
        if ($subscriptions->isEmpty()) {
            return;
        }

        $payload = json_encode([
            'title' => $title,
            'body' => $body,
            'data' => $data,
        ], JSON_THROW_ON_ERROR);

        $factory = new HttpFactory();
        $webPush = new WebPush(
            [
                'VAPID' => [
                    'subject' => config('dtr.push.vapid_subject'),
                    'publicKey' => $publicKey,
                    'privateKey' => $privateKey,
                ],
            ],
            ['TTL' => 120, 'urgency' => 'high'],
            new Client([
                'timeout' => 15,
                'verify' => $this->caBundle(),
            ]),
            $factory,
            $factory,
        );

        foreach ($subscriptions as $subscription) {
            $webPush->queueNotification(
                Subscription::create([
                    'endpoint' => $subscription->endpoint,
                    'publicKey' => $subscription->public_key,
                    'authToken' => $subscription->auth_token,
                    'contentEncoding' => $subscription->content_encoding ?: 'aes128gcm',
                ]),
                $payload,
                ['TTL' => 120, 'urgency' => 'high'],
            );
        }

        foreach ($webPush->flush() as $report) {
            if ($report->isSubscriptionExpired()) {
                PushSubscription::query()->where('endpoint', $report->getEndpoint())->delete();
                continue;
            }

            if (! $report->isSuccess()) {
                Log::warning('Web push failed', [
                    'endpoint' => $report->getEndpoint(),
                    'reason' => $report->getReason(),
                ]);
            }
        }
    }

    private function caBundle(): bool|string
    {
        $bundle = storage_path('app/cacert.pem');

        return is_file($bundle) ? $bundle : true;
    }
}
