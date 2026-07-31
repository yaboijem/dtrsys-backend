<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Branch;
use App\Models\DataRequest;
use App\Models\Employee;
use App\Models\Schedule;
use App\Models\Shift;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class DataRequestApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['Super Admin', 'HR', 'Payroll Officer', 'Branch Manager', 'Department Head', 'Employee'] as $role) {
            Role::findOrCreate($role, 'web');
        }
    }

    private function makeEmployee(string $role): Employee
    {
        $employee = Employee::factory()->create(['branch_id' => Branch::factory()]);
        $employee->user->syncRoles([$role]);

        return $employee;
    }

    #[Test]
    public function access_request_is_completed_immediately_with_data_export(): void
    {
        $employee = $this->makeEmployee('Employee');

        Attendance::factory()->create([
            'employee_id' => $employee->id,
            'branch_id' => $employee->branch_id,
            'type' => 'time_in',
            'timestamp' => now()->subDay()->setTime(8, 0),
        ]);

        $shift = Shift::factory()->create();
        Schedule::factory()->create([
            'employee_id' => $employee->id,
            'shift_id' => $shift->id,
            'date' => now()->addDay()->toDateString(),
        ]);

        $this->actingAs($employee->user, 'sanctum')->postJson('/api/employee/data-requests', [
            'type' => 'access',
        ])
            ->assertOk()
            ->assertJsonPath('data.type', 'access')
            ->assertJsonPath('data.status', 'completed')
            ->assertJsonPath('export.profile.employee_id', $employee->user->employee_id)
            ->assertJsonCount(1, 'export.attendance')
            ->assertJsonCount(1, 'export.schedules');

        $this->assertDatabaseHas('data_requests', ['user_id' => $employee->user->id, 'type' => 'access', 'status' => 'completed']);
        $this->assertDatabaseHas('audit_logs', ['action' => 'data_request.created']);
    }

    #[Test]
    public function deletion_request_stays_pending_until_reviewed(): void
    {
        $employee = $this->makeEmployee('Employee');

        $this->actingAs($employee->user, 'sanctum')->postJson('/api/employee/data-requests', [
            'type' => 'deletion',
        ])
            ->assertCreated()
            ->assertJsonPath('data.status', 'pending')
            ->assertJsonPath('export', null);
    }

    #[Test]
    public function invalid_type_is_rejected(): void
    {
        $employee = $this->makeEmployee('Employee');

        $this->actingAs($employee->user, 'sanctum')->postJson('/api/employee/data-requests', [
            'type' => 'salary_slip',
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('type');
    }

    #[Test]
    public function employee_sees_only_own_requests(): void
    {
        $employee = $this->makeEmployee('Employee');
        $other = $this->makeEmployee('Employee');

        DataRequest::factory()->create(['user_id' => $employee->user->id, 'type' => 'access']);
        DataRequest::factory()->create(['user_id' => $other->user->id, 'type' => 'deletion']);

        $this->actingAs($employee->user, 'sanctum')->getJson('/api/employee/data-requests')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.type', 'access');
    }

    #[Test]
    public function hr_can_list_and_review_requests(): void
    {
        $hr = $this->makeEmployee('HR');
        $employee = $this->makeEmployee('Employee');

        $dataRequest = DataRequest::factory()->create(['user_id' => $employee->user->id, 'type' => 'deletion']);

        $this->actingAs($hr->user, 'sanctum')->getJson('/api/admin/data-requests')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.user.employee_id', $employee->user->employee_id);

        $this->actingAs($hr->user, 'sanctum')->patchJson("/api/admin/data-requests/{$dataRequest->id}", [
            'status' => 'completed',
            'notes' => 'Account deleted per request.',
        ])
            ->assertOk()
            ->assertJsonPath('data.status', 'completed')
            ->assertJsonPath('data.processed_by.id', $hr->user->id);

        $this->assertDatabaseHas('data_requests', ['id' => $dataRequest->id, 'status' => 'completed', 'notes' => 'Account deleted per request.']);
        $this->assertDatabaseHas('audit_logs', ['action' => 'data_request.reviewed']);
    }

    #[Test]
    public function employee_cannot_review_requests(): void
    {
        $employee = $this->makeEmployee('Employee');
        $dataRequest = DataRequest::factory()->create(['user_id' => $employee->user->id, 'type' => 'deletion']);

        $this->actingAs($employee->user, 'sanctum')->patchJson("/api/admin/data-requests/{$dataRequest->id}", [
            'status' => 'completed',
        ])->assertForbidden();
    }
}
