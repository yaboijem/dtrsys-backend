<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Branch;
use App\Models\Employee;
use App\Models\FraudFlag;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class FraudFlagReviewTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['Super Admin', 'HR', 'Branch Manager', 'Department Head', 'Employee'] as $role) {
            Role::findOrCreate($role, 'web');
        }
    }

    private function makeUser(string $role, ?Branch $branch = null, string $department = 'IT'): Employee
    {
        $employee = Employee::factory()->create([
            'branch_id' => $branch?->id ?? Branch::factory(),
            'department' => $department,
        ]);
        $employee->user->update(['employee_id' => 'USR-'.strtoupper(uniqid())]);
        $employee->user->syncRoles([$role]);

        return $employee;
    }

    private function makeFlag(Branch $branch, string $department = 'IT'): FraudFlag
    {
        $employee = Employee::factory()->create([
            'branch_id' => $branch->id,
            'department' => $department,
        ]);
        $attendance = Attendance::factory()->create([
            'employee_id' => $employee->id,
            'branch_id' => $branch->id,
            'type' => 'time_in',
        ]);

        return FraudFlag::create([
            'attendance_id' => $attendance->id,
            'type' => 'out_of_radius',
            'severity' => 'high',
            'details' => ['distance_meters' => 15000],
            'status' => 'open',
        ]);
    }

    #[Test]
    public function hr_can_list_and_review_fraud_flags(): void
    {
        $hr = $this->makeUser('HR');
        $branch = Branch::factory()->create();
        $flag = $this->makeFlag($branch);

        $this->actingAs($hr->user, 'sanctum')->getJson('/api/admin/fraud-flags')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.type', 'out_of_radius')
            ->assertJsonPath('data.0.status', 'open');

        $this->actingAs($hr->user, 'sanctum')->postJson("/api/admin/fraud-flags/{$flag->id}/review", [
            'status' => 'reviewed',
            'notes' => 'Verified employee was on field duty.',
        ])->assertOk()
            ->assertJsonPath('data.status', 'reviewed')
            ->assertJsonPath('data.notes', 'Verified employee was on field duty.')
            ->assertJsonPath('data.reviewer.employee_id', $hr->user->employee_id);

        $this->assertDatabaseHas('audit_logs', [
            'action' => 'fraud_flag.reviewed',
            'user_id' => $hr->user->id,
        ]);
    }

    #[Test]
    public function hr_can_dismiss_fraud_flag(): void
    {
        $hr = $this->makeUser('HR');
        $branch = Branch::factory()->create();
        $flag = $this->makeFlag($branch);

        $this->actingAs($hr->user, 'sanctum')->postJson("/api/admin/fraud-flags/{$flag->id}/review", [
            'status' => 'dismissed',
        ])->assertOk()
            ->assertJsonPath('data.id', $flag->id)
            ->assertJsonPath('data.status', 'dismissed')
            ->assertJsonPath('data.attendance.id', $flag->attendance_id);

        $this->assertSame('dismissed', $flag->fresh()->status);
    }

    #[Test]
    public function flags_can_be_filtered_by_status_and_type(): void
    {
        $hr = $this->makeUser('HR');
        $branch = Branch::factory()->create();
        $this->makeFlag($branch);
        $this->makeFlag($branch);

        $this->actingAs($hr->user, 'sanctum')->getJson('/api/admin/fraud-flags?status=open')
            ->assertOk()
            ->assertJsonCount(2, 'data');

        $this->actingAs($hr->user, 'sanctum')->getJson('/api/admin/fraud-flags?type=gps_spoof')
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    #[Test]
    public function branch_manager_only_sees_own_branch_flags(): void
    {
        $branchA = Branch::factory()->create();
        $branchB = Branch::factory()->create();
        $manager = $this->makeUser('Branch Manager', $branchA);

        $flagA = $this->makeFlag($branchA);
        $flagB = $this->makeFlag($branchB);

        $this->actingAs($manager->user, 'sanctum')->getJson('/api/admin/fraud-flags')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $flagA->id);

        $this->actingAs($manager->user, 'sanctum')->postJson("/api/admin/fraud-flags/{$flagA->id}/review", [
            'status' => 'dismissed',
        ])->assertOk()
            ->assertJsonPath('data.status', 'dismissed');

        $this->actingAs($manager->user, 'sanctum')->postJson("/api/admin/fraud-flags/{$flagB->id}/review", [
            'status' => 'reviewed',
        ])->assertForbidden()
            ->assertJsonPath('code', 'not_authorized');
    }

    #[Test]
    public function department_head_cannot_access_fraud_flags(): void
    {
        $branch = Branch::factory()->create();
        $dh = $this->makeUser('Department Head', $branch, 'IT');

        $this->actingAs($dh->user, 'sanctum')->getJson('/api/admin/fraud-flags')
            ->assertForbidden();
    }

    #[Test]
    public function employees_cannot_access_fraud_flags(): void
    {
        $employee = $this->makeUser('Employee');

        $this->actingAs($employee->user, 'sanctum')
            ->getJson('/api/admin/fraud-flags')
            ->assertForbidden();
    }
}
