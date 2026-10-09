<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\PushSubscription;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class PushSubscriptionTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Role::findOrCreate('Employee', 'web');
    }

    #[Test]
    public function employee_can_register_and_remove_a_device(): void
    {
        config([
            'dtr.push.vapid_public_key' => 'test-public-key',
            'dtr.push.vapid_private_key' => 'test-private-key',
        ]);

        $employee = Employee::factory()->create();
        $employee->user->syncRoles(['Employee']);
        $payload = [
            'endpoint' => 'https://push.example.test/subscription/1',
            'keys' => [
                'p256dh' => 'public-key',
                'auth' => 'auth-token',
            ],
        ];

        $this->actingAs($employee->user, 'sanctum')
            ->getJson('/api/push/vapid-public-key')
            ->assertOk()
            ->assertJsonPath('public_key', 'test-public-key');

        $this->actingAs($employee->user, 'sanctum')
            ->postJson('/api/push/subscribe', $payload)
            ->assertOk();

        $this->assertDatabaseHas('push_subscriptions', [
            'user_id' => $employee->user->id,
            'endpoint_hash' => hash('sha256', $payload['endpoint']),
            'content_encoding' => 'aes128gcm',
        ]);

        $this->actingAs($employee->user, 'sanctum')
            ->deleteJson('/api/push/subscribe', ['endpoint' => $payload['endpoint']])
            ->assertOk();

        $this->assertSame(0, PushSubscription::query()->count());
    }

    #[Test]
    public function test_alert_endpoint_is_removed(): void
    {
        $employee = Employee::factory()->create();
        $employee->user->syncRoles(['Employee']);

        $this->actingAs($employee->user, 'sanctum')
            ->postJson('/api/push/test', [])
            ->assertNotFound();
    }
}
