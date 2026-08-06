<?php

namespace Tests\Feature;

use App\Models\AppSetting;
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
}
