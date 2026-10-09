<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\AttendancePhoto;
use App\Models\Branch;
use App\Models\Department;
use App\Models\Employee;
use App\Models\FraudFlag;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class AttendanceAdminApiTest extends TestCase
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
        $dept = Department::firstOrCreate(['name' => $department]);
        $employee = Employee::factory()->create([
            'branch_id' => $branch?->id ?? Branch::factory(),
            'department_id' => $dept->id,
        ]);
        $employee->user->update(['employee_id' => 'USR-'.strtoupper(uniqid())]);
        $employee->user->syncRoles([$role]);

        return $employee;
    }

    private function makePunch(Branch $branch, string $department = 'IT', array $overrides = []): Attendance
    {
        $dept = Department::firstOrCreate(['name' => $department]);
        $employee = Employee::factory()->create([
            'branch_id' => $branch->id,
            'department_id' => $dept->id,
        ]);

        return Attendance::factory()->create(array_merge([
            'employee_id' => $employee->id,
            'branch_id' => $branch->id,
            'type' => 'time_in',
            'timestamp' => now()->startOfDay()->addHours(8),
        ], $overrides));
    }

    #[Test]
    public function hr_sees_attendance_across_all_branches(): void
    {
        $hr = $this->makeUser('HR');
        $branchA = Branch::factory()->create();
        $branchB = Branch::factory()->create();
        $this->makePunch($branchA);
        $this->makePunch($branchB);

        $this->actingAs($hr->user, 'sanctum')->getJson('/api/admin/attendance')
            ->assertOk()
            ->assertJsonCount(2, 'data');

        $this->actingAs($hr->user, 'sanctum')->getJson('/api/admin/attendance?branch_id='.$branchA->id)
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }

    #[Test]
    public function branch_manager_only_sees_own_branch(): void
    {
        $branchA = Branch::factory()->create();
        $branchB = Branch::factory()->create();
        $manager = $this->makeUser('Branch Manager', $branchA);

        $punch = $this->makePunch($branchA);
        $this->makePunch($branchB);

        $this->actingAs($manager->user, 'sanctum')->getJson('/api/admin/attendance')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.branch.id', $branchA->id)
            ->assertJsonPath('data.0.id', $punch->id);
    }

    #[Test]
    public function department_head_only_sees_own_department(): void
    {
        $branch = Branch::factory()->create();
        $dh = $this->makeUser('Department Head', $branch, 'IT');

        $punch = $this->makePunch($branch, 'IT');
        $this->makePunch($branch, 'Sales');

        $this->actingAs($dh->user, 'sanctum')->getJson('/api/admin/attendance')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $punch->id);
    }

    #[Test]
    public function attendance_list_supports_filters(): void
    {
        $hr = $this->makeUser('HR');
        $branch = Branch::factory()->create();
        $this->makePunch($branch, 'IT', ['is_late' => true]);
        $this->makePunch($branch, 'IT', ['is_late' => false]);
        $flagged = $this->makePunch($branch, 'IT', ['is_late' => false]);
        FraudFlag::create([
            'attendance_id' => $flagged->id,
            'type' => 'gps_spoof',
            'severity' => 'high',
            'status' => 'open',
        ]);

        $this->actingAs($hr->user, 'sanctum')->getJson('/api/admin/attendance?is_late=true')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.is_late', true);

        $this->actingAs($hr->user, 'sanctum')->getJson('/api/admin/attendance?has_open_flags=true')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.fraud_flags.0.type', 'gps_spoof');

        $this->actingAs($hr->user, 'sanctum')->getJson('/api/admin/attendance?date='.now()->toDateString())
            ->assertOk()
            ->assertJsonCount(3, 'data');
    }

    #[Test]
    public function attendance_list_filters_by_early_timeout(): void
    {
        $hr = $this->makeUser('HR');
        $branch = Branch::factory()->create();
        $this->makePunch($branch, 'IT', ['type' => 'time_out', 'is_early_timeout' => true]);
        $this->makePunch($branch, 'IT', ['type' => 'time_out', 'is_early_timeout' => false]);

        $this->actingAs($hr->user, 'sanctum')->getJson('/api/admin/attendance?is_early_timeout=true')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.is_early_timeout', true);
    }

    #[Test]
    public function employees_cannot_access_attendance_admin(): void
    {
        $employee = $this->makeUser('Employee');

        $this->actingAs($employee->user, 'sanctum')
            ->getJson('/api/admin/attendance')
            ->assertForbidden();
    }

    #[Test]
    public function authorized_roles_can_view_selfie(): void
    {
        Storage::fake('public');
        $branch = Branch::factory()->create();
        $hr = $this->makeUser('HR', $branch);
        $manager = $this->makeUser('Branch Manager', $branch);
        $otherManager = $this->makeUser('Branch Manager', Branch::factory()->create());

        $punch = $this->makePunch($branch);
        Storage::disk('public')->put('attendance/selfie.jpg', 'fake-image-bytes');
        AttendancePhoto::create([
            'attendance_id' => $punch->id,
            'path' => 'attendance/selfie.jpg',
            'captured_at' => now(),
        ]);

        $this->actingAs($hr->user, 'sanctum')->getJson("/api/admin/attendance/{$punch->id}/photo")
            ->assertOk()
            ->assertHeader('content-type', 'image/jpeg');

        $this->actingAs($manager->user, 'sanctum')->getJson("/api/admin/attendance/{$punch->id}/photo")
            ->assertOk();

        $this->actingAs($otherManager->user, 'sanctum')->getJson("/api/admin/attendance/{$punch->id}/photo")
            ->assertForbidden();
    }

    #[Test]
    public function selfie_link_is_short_lived_and_signed(): void
    {
        Storage::fake('public');
        $branch = Branch::factory()->create();
        $hr = $this->makeUser('HR', $branch);
        $punch = $this->makePunch($branch);
        Storage::disk('public')->put('attendance/selfie.jpg', 'fake-image-bytes');
        AttendancePhoto::create([
            'attendance_id' => $punch->id,
            'path' => 'attendance/selfie.jpg',
            'captured_at' => now(),
        ]);

        $url = $this->actingAs($hr->user, 'sanctum')
            ->getJson("/api/admin/attendance/{$punch->id}/photo-url")
            ->assertOk()
            ->json('url');

        $this->assertIsString($url);
        $this->assertStringContainsString('signature=', $url);
        $this->get($url)->assertOk()->assertHeader('content-type', 'image/jpeg');

        $this->travel(6)->minutes();
        $this->get($url)->assertForbidden();
    }

    #[Test]
    public function selfie_view_returns_404_when_missing(): void
    {
        $branch = Branch::factory()->create();
        $hr = $this->makeUser('HR', $branch);
        $punch = $this->makePunch($branch);

        $this->actingAs($hr->user, 'sanctum')->getJson("/api/admin/attendance/{$punch->id}/photo")
            ->assertNotFound();
    }

    #[Test]
    public function dashboard_summary_is_role_scoped(): void
    {
        $branchA = Branch::factory()->create();
        $branchB = Branch::factory()->create();
        $manager = $this->makeUser('Branch Manager', $branchA);

        $employeeA = Employee::factory()->create(['branch_id' => $branchA->id]);
        $employeeA->user->update(['is_active' => true]);
        $late = $this->makePunch($branchA, 'IT', ['is_late' => true, 'timestamp' => now()]);
        Employee::factory()->create(['branch_id' => $branchA->id]);
        $this->makePunch($branchB, 'IT', ['is_late' => true, 'timestamp' => now()]);
        FraudFlag::create([
            'attendance_id' => $late->id,
            'type' => 'rapid_clock',
            'severity' => 'medium',
            'status' => 'open',
        ]);

        $this->actingAs($manager->user, 'sanctum')->getJson('/api/admin/dashboard/summary')
            ->assertOk()
            ->assertJsonPath('time_ins_today', 1)
            ->assertJsonPath('open_fraud_flags', 1);
    }

    #[Test]
    public function dashboard_includes_trends_and_fraud_severity(): void
    {
        $branch = Branch::factory()->create();
        $hr = $this->makeUser('HR', $branch);

        $this->makePunch($branch, 'IT', ['type' => 'time_in', 'timestamp' => now()]);
        $this->makePunch($branch, 'IT', ['type' => 'time_in', 'timestamp' => now()->subDay()]);

        $this->actingAs($hr->user, 'sanctum')->getJson('/api/admin/dashboard/summary')
            ->assertOk()
            ->assertJsonPath('time_ins_today', 1)
            ->assertJsonPath('time_ins_yesterday', 1)
            ->assertJsonStructure([
                'open_fraud_by_severity' => ['high', 'medium', 'low'],
            ]);
    }

    #[Test]
    public function dashboard_counts_people_on_break_by_kind_and_employees(): void
    {
        $branchA = Branch::factory()->create();
        $branchB = Branch::factory()->create();
        $hr = $this->makeUser('HR', $branchA);
        $manager = $this->makeUser('Branch Manager', $branchA);

        $this->openBreak($branchA, 'lunch_60');
        $this->returnedFromBreak($branchA);
        $this->openBreak($branchB, 'coaching');
        $this->clockedOutAfterBreak($branchA);

        $this->actingAs($hr->user, 'sanctum')->getJson('/api/admin/dashboard/summary')
            ->assertOk()
            ->assertJsonPath('on_break', 2)
            ->assertJsonPath('on_break_by_kind.lunch_60', 1)
            ->assertJsonPath('on_break_by_kind.coaching', 1)
            ->assertJsonPath('on_break_by_kind.bio', 0)
            ->assertJsonPath('employees_total', 6);

        $this->actingAs($manager->user, 'sanctum')->getJson('/api/admin/dashboard/summary')
            ->assertOk()
            ->assertJsonPath('on_break', 1)
            ->assertJsonPath('on_break_by_kind.lunch_60', 1)
            ->assertJsonPath('on_break_by_kind.coaching', 0)
            ->assertJsonPath('employees_total', 5);
    }

    private function openBreak(Branch $branch, string $kind): void
    {
        $employee = Employee::factory()->create(['branch_id' => $branch->id]);
        Attendance::factory()->create([
            'employee_id' => $employee->id,
            'branch_id' => $branch->id,
            'type' => 'time_in',
            'timestamp' => now()->subHours(3),
            'is_late' => false,
        ]);
        Attendance::factory()->create([
            'employee_id' => $employee->id,
            'branch_id' => $branch->id,
            'type' => 'break_in',
            'break_kind' => $kind,
            'timestamp' => now()->subMinutes(20),
            'is_late' => false,
        ]);
    }

    private function returnedFromBreak(Branch $branch): void
    {
        $employee = Employee::factory()->create(['branch_id' => $branch->id]);
        Attendance::factory()->create([
            'employee_id' => $employee->id,
            'branch_id' => $branch->id,
            'type' => 'time_in',
            'timestamp' => now()->subHours(4),
            'is_late' => false,
        ]);
        Attendance::factory()->create([
            'employee_id' => $employee->id,
            'branch_id' => $branch->id,
            'type' => 'break_in',
            'break_kind' => 'bio',
            'timestamp' => now()->subHours(2),
            'is_late' => false,
        ]);
        Attendance::factory()->create([
            'employee_id' => $employee->id,
            'branch_id' => $branch->id,
            'type' => 'break_out',
            'timestamp' => now()->subHour(),
            'is_late' => false,
        ]);
    }

    private function clockedOutAfterBreak(Branch $branch): void
    {
        $employee = Employee::factory()->create(['branch_id' => $branch->id]);
        Attendance::factory()->create([
            'employee_id' => $employee->id,
            'branch_id' => $branch->id,
            'type' => 'time_in',
            'timestamp' => now()->subHours(5),
            'is_late' => false,
        ]);
        Attendance::factory()->create([
            'employee_id' => $employee->id,
            'branch_id' => $branch->id,
            'type' => 'break_in',
            'break_kind' => 'huddle',
            'timestamp' => now()->subHours(3),
            'is_late' => false,
        ]);
        Attendance::factory()->create([
            'employee_id' => $employee->id,
            'branch_id' => $branch->id,
            'type' => 'break_out',
            'timestamp' => now()->subHours(2),
            'is_late' => false,
        ]);
        Attendance::factory()->create([
            'employee_id' => $employee->id,
            'branch_id' => $branch->id,
            'type' => 'time_out',
            'timestamp' => now()->subMinutes(30),
            'is_late' => false,
        ]);
    }
}
