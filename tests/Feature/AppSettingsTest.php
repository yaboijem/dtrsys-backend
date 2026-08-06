<?php

namespace Tests\Feature;

use App\Models\AppSetting;
use App\Models\AuditLog;
use App\Models\Employee;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class AppSettingsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['Super Admin', 'HR', 'Employee', 'Branch Manager'] as $role) {
            Role::findOrCreate($role, 'web');
        }
    }

    private function makeUserWithRole(string $role): Employee
    {
        $employee = Employee::factory()->create();
        $employee->user->syncRoles([$role]);

        return $employee;
    }

    #[Test]
    public function current_returns_breaks_enabled_true_by_default(): void
    {
        $settings = AppSetting::current();

        $this->assertTrue($settings->breaks_enabled);
        $this->assertDatabaseHas('app_settings', [
            'id' => 1,
            'breaks_enabled' => 1,
        ]);
    }

    #[Test]
    public function hr_can_get_and_patch_settings(): void
    {
        $hr = $this->makeUserWithRole('HR');

        $this->actingAs($hr->user, 'sanctum')
            ->getJson('/api/admin/settings')
            ->assertOk()
            ->assertJsonPath('data.breaks_enabled', true);

        $this->actingAs($hr->user, 'sanctum')
            ->patchJson('/api/admin/settings', ['breaks_enabled' => false])
            ->assertOk()
            ->assertJsonPath('data.breaks_enabled', false);

        $this->assertFalse(AppSetting::current()->fresh()->breaks_enabled);
        $this->assertDatabaseHas('audit_logs', ['action' => 'settings.updated']);
    }

    #[Test]
    public function employee_cannot_patch_admin_settings(): void
    {
        $employee = $this->makeUserWithRole('Employee');

        $this->actingAs($employee->user, 'sanctum')
            ->patchJson('/api/admin/settings', ['breaks_enabled' => false])
            ->assertForbidden();
    }

    #[Test]
    public function authenticated_employee_can_read_settings(): void
    {
        AppSetting::current()->update(['breaks_enabled' => false]);
        $employee = $this->makeUserWithRole('Employee');

        $this->actingAs($employee->user, 'sanctum')
            ->getJson('/api/settings')
            ->assertOk()
            ->assertJsonPath('data.breaks_enabled', false);
    }

    #[Test]
    public function patch_requires_boolean_breaks_enabled(): void
    {
        $hr = $this->makeUserWithRole('HR');

        $this->actingAs($hr->user, 'sanctum')
            ->patchJson('/api/admin/settings', [])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['breaks_enabled']);
    }
}
