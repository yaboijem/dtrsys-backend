<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Employee;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class ConsentApiTest extends TestCase
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
    public function employee_lists_consents_and_grants_biometric_consent(): void
    {
        $employee = $this->makeEmployee();

        $this->actingAs($employee->user, 'sanctum')->getJson('/api/employee/consent')
            ->assertOk()
            ->assertJsonCount(0, 'data');

        $this->actingAs($employee->user, 'sanctum')->postJson('/api/employee/consent', [
            'type' => 'biometric_photos',
            'granted' => true,
        ])
            ->assertOk()
            ->assertJsonPath('data.type', 'biometric_photos')
            ->assertJsonPath('data.granted', true)
            ->assertJsonPath('data.granted_at', now()->startOfSecond()->toISOString())
            ->assertJsonPath('data.revoked_at', null);

        $this->assertDatabaseHas('consents', ['employee_id' => $employee->id, 'type' => 'biometric_photos', 'granted' => 1]);
        $this->assertDatabaseHas('audit_logs', ['action' => 'consent.updated']);
    }

    #[Test]
    public function employee_can_revoke_consent(): void
    {
        $employee = $this->makeEmployee();

        $this->actingAs($employee->user, 'sanctum')->postJson('/api/employee/consent', [
            'type' => 'gps_location',
            'granted' => true,
        ])->assertOk();

        $this->actingAs($employee->user, 'sanctum')->postJson('/api/employee/consent', [
            'type' => 'gps_location',
            'granted' => false,
        ])
            ->assertOk()
            ->assertJsonPath('data.granted', false)
            ->assertJsonPath('data.granted_at', null)
            ->assertJsonPath('data.revoked_at', now()->startOfSecond()->toISOString());

        $this->assertDatabaseHas('consents', ['employee_id' => $employee->id, 'type' => 'gps_location', 'granted' => 0]);
    }

    #[Test]
    public function unknown_consent_type_is_rejected(): void
    {
        $employee = $this->makeEmployee();

        $this->actingAs($employee->user, 'sanctum')->postJson('/api/employee/consent', [
            'type' => 'bank_account',
            'granted' => true,
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('type');
    }

    #[Test]
    public function account_without_employee_record_gets_404(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user, 'sanctum')->postJson('/api/employee/consent', [
            'type' => 'biometric_photos',
            'granted' => true,
        ])->assertNotFound()
            ->assertJsonPath('code', 'no_employee_record');
    }
}
