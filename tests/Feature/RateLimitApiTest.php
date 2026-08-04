<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Employee;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class RateLimitApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['Super Admin', 'HR', 'Branch Manager', 'Department Head', 'Employee'] as $role) {
            Role::findOrCreate($role, 'web');
        }
    }

    private function makeEmployee(string $role = 'Employee'): Employee
    {
        $employee = Employee::factory()->create(['branch_id' => Branch::factory()]);
        $employee->user->syncRoles([$role]);

        return $employee;
    }

    #[Test]
    public function attendance_endpoints_are_rate_limited(): void
    {
        $employee = $this->makeEmployee();

        for ($i = 0; $i < 30; $i++) {
            $this->actingAs($employee->user, 'sanctum')->postJson('/api/attendance/time-in', []);
        }

        $this->actingAs($employee->user, 'sanctum')->postJson('/api/attendance/time-in', [])
            ->assertStatus(429)
            ->assertJsonPath('code', 'too_many_attempts');
    }

    #[Test]
    public function attendance_sync_is_rate_limited(): void
    {
        $employee = $this->makeEmployee();

        for ($i = 0; $i < 10; $i++) {
            $this->actingAs($employee->user, 'sanctum')->postJson('/api/attendance/sync', [
                'records' => [],
            ]);
        }

        $this->actingAs($employee->user, 'sanctum')->postJson('/api/attendance/sync', [
            'records' => [],
        ])
            ->assertStatus(429)
            ->assertJsonPath('code', 'too_many_attempts')
            ->assertJsonPath('message', 'Too many sync requests. Please wait.');
    }

    #[Test]
    public function unauthenticated_requests_get_json_401(): void
    {
        $this->getJson('/api/attendance/history')
            ->assertStatus(401)
            ->assertJsonPath('code', 'unauthenticated');
    }
}
