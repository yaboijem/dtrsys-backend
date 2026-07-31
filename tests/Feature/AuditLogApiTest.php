<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Branch;
use App\Models\Employee;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class AuditLogApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['Super Admin', 'HR', 'Employee'] as $role) {
            Role::findOrCreate($role, 'web');
        }
    }

    private function makeHr(): Employee
    {
        $employee = Employee::factory()->create();
        $employee->user->update(['employee_id' => 'HR-AUDIT']);
        $employee->user->syncRoles(['HR']);

        return $employee;
    }

    private function makeEmployee(): Employee
    {
        $employee = Employee::factory()->create();
        $employee->user->update(['employee_id' => 'EMP-AUDIT']);
        $employee->user->syncRoles(['Employee']);

        return $employee;
    }

    #[Test]
    public function admin_crud_actions_are_audited(): void
    {
        $hr = $this->makeHr();

        $this->actingAs($hr->user, 'sanctum')->postJson('/api/admin/branches', [
            'name' => 'Cebu Branch',
            'code' => 'CEB-001',
            'address' => '123 Osmeña Blvd, Cebu City',
            'latitude' => 10.3157,
            'longitude' => 123.8854,
            'radius_meters' => 300,
            'is_active' => true,
        ])->assertCreated();

        $branch = Branch::where('code', 'CEB-001')->firstOrFail();
        $branchId = (string) $branch->id;

        $this->actingAs($hr->user, 'sanctum')->patchJson("/api/admin/branches/{$branchId}", [
            'name' => 'Cebu City Branch',
        ])->assertOk();

        $created = AuditLog::where('action', 'branch.created')->first();
        $updated = AuditLog::where('action', 'branch.updated')->first();

        $this->assertNotNull($created);
        $this->assertSame($hr->user->id, $created->user_id);
        $this->assertSame(Branch::class, $created->model_type);
        $this->assertSame('Cebu Branch', $created->new_values['name']);

        $this->assertNotNull($updated);
        $this->assertSame(['name' => 'Cebu Branch'], $updated->old_values);
        $this->assertSame(['name' => 'Cebu City Branch'], $updated->new_values);
    }

    #[Test]
    public function attendance_punches_are_audited(): void
    {
        Storage::fake('public');
        $employee = $this->makeEmployee();
        $branch = $employee->branch;

        $this->actingAs($employee->user, 'sanctum')->postJson('/api/attendance/time-in', [
            'latitude' => (float) $branch->latitude + 0.0001,
            'longitude' => (float) $branch->longitude + 0.0001,
            'accuracy_meters' => 8,
            'selfie' => UploadedFile::fake()->image('selfie.jpg'),
        ])->assertCreated();

        $log = AuditLog::where('action', 'attendance.created')->first();

        $this->assertNotNull($log);
        $this->assertSame($employee->user->id, $log->user_id);
        $this->assertSame('time_in', $log->new_values['type']);
    }

    #[Test]
    public function hr_can_list_audit_logs_with_filters(): void
    {
        $hr = $this->makeHr();

        $this->actingAs($hr->user, 'sanctum')->postJson('/api/admin/branches', [
            'name' => 'Davao Branch',
            'code' => 'DVO-001',
            'address' => '456 Rizal St, Davao City',
            'latitude' => 7.1907,
            'longitude' => 125.4553,
            'radius_meters' => 300,
            'is_active' => true,
        ])->assertCreated();

        $this->actingAs($hr->user, 'sanctum')->getJson('/api/admin/audit-logs')
            ->assertOk()
            ->assertJsonPath('data.0.action', 'branch.created')
            ->assertJsonPath('data.0.actor.employee_id', 'HR-AUDIT');

        $this->actingAs($hr->user, 'sanctum')->getJson('/api/admin/audit-logs?action=branch.updated')
            ->assertOk()
            ->assertJsonCount(0, 'data');

        $this->actingAs($hr->user, 'sanctum')->getJson('/api/admin/audit-logs?user_id='.$hr->user->id)
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }

    #[Test]
    public function employees_cannot_access_audit_logs(): void
    {
        $employee = $this->makeEmployee();

        $this->actingAs($employee->user, 'sanctum')
            ->getJson('/api/admin/audit-logs')
            ->assertForbidden();
    }
}
