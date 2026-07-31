<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Services\NotificationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class NotificationApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['Super Admin', 'HR', 'Payroll Officer', 'Branch Manager', 'Department Head', 'Employee'] as $role) {
            Role::findOrCreate($role, 'web');
        }
    }

    private function makeUser(string $role): Employee
    {
        $employee = Employee::factory()->create();
        $employee->user->syncRoles([$role]);

        return $employee;
    }

    #[Test]
    public function user_can_list_own_notifications(): void
    {
        $employee = $this->makeUser('Employee');
        $service = app(NotificationService::class);

        $service->send($employee->user, 'Request approved', 'Your device change request was approved.', ['device_change_request_id' => 1]);
        $service->send($employee->user, 'Request rejected', 'Your device change request was rejected.', ['device_change_request_id' => 2]);

        $second = $employee->user->notifications()->get()
            ->first(fn ($n) => ($n->data['data']['device_change_request_id'] ?? null) === 2);
        $second->forceFill(['created_at' => $second->created_at->addSecond()])->save();

        $this->actingAs($employee->user, 'sanctum')->getJson('/api/notifications')
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.title', 'Request rejected')
            ->assertJsonPath('data.0.payload.device_change_request_id', 2)
            ->assertJsonPath('data.1.title', 'Request approved')
            ->assertJsonPath('data.0.read_at', null);
    }

    #[Test]
    public function unread_count_returns_only_unread(): void
    {
        $employee = $this->makeUser('Employee');
        $service = app(NotificationService::class);

        $service->send($employee->user, 'First', 'One');
        $service->send($employee->user, 'Second', 'Two');

        $employee->user->notifications()->first()->markAsRead();

        $this->actingAs($employee->user, 'sanctum')->getJson('/api/notifications/unread-count')
            ->assertOk()
            ->assertJsonPath('count', 1);
    }

    #[Test]
    public function unread_only_filter_returns_unread_notifications(): void
    {
        $employee = $this->makeUser('Employee');
        $service = app(NotificationService::class);

        $service->send($employee->user, 'First', 'One');
        $service->send($employee->user, 'Second', 'Two');

        $employee->user->notifications()->first()->markAsRead();

        $this->actingAs($employee->user, 'sanctum')->getJson('/api/notifications?unread_only=1')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.title', 'Second');
    }

    #[Test]
    public function user_can_mark_a_notification_as_read(): void
    {
        $employee = $this->makeUser('Employee');
        app(NotificationService::class)->send($employee->user, 'First', 'One');

        $notification = $employee->user->notifications()->first();

        $this->actingAs($employee->user, 'sanctum')->postJson("/api/notifications/{$notification->id}/read")
            ->assertOk()
            ->assertJsonPath('data.id', $notification->id)
            ->assertJsonStructure(['data' => ['id', 'read_at']]);

        $this->assertTrue($notification->fresh()->read());
    }

    #[Test]
    public function user_cannot_mark_another_users_notification_as_read(): void
    {
        $owner = $this->makeUser('Employee');
        $other = $this->makeUser('Employee');
        app(NotificationService::class)->send($owner->user, 'Private', 'Secret');

        $notification = $owner->user->notifications()->first();

        $this->actingAs($other->user, 'sanctum')->postJson("/api/notifications/{$notification->id}/read")
            ->assertNotFound()
            ->assertJsonPath('code', 'not_found');

        $this->assertFalse($notification->fresh()->read());
    }

    #[Test]
    public function user_can_mark_all_notifications_as_read(): void
    {
        $employee = $this->makeUser('Employee');
        $service = app(NotificationService::class);

        $service->send($employee->user, 'First', 'One');
        $service->send($employee->user, 'Second', 'Two');

        $this->actingAs($employee->user, 'sanctum')->postJson('/api/notifications/read-all')
            ->assertOk()
            ->assertJsonPath('marked', 2);

        $this->assertSame(0, $employee->user->unreadNotifications()->count());
    }
}
