<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Branch;
use App\Models\Employee;
use App\Models\ReportExport;
use App\Models\Schedule;
use App\Models\Shift;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class ReportExportApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['Super Admin', 'HR', 'Payroll Officer', 'Branch Manager', 'Department Head', 'Employee'] as $role) {
            Role::findOrCreate($role, 'web');
        }

        $this->travelTo(Carbon::parse('2026-07-15 10:00:00'));
    }

    private function makeUser(string $role, ?Branch $branch = null): Employee
    {
        $employee = Employee::factory()->create(['branch_id' => $branch?->id ?? Branch::factory()]);
        $employee->user->update(['employee_id' => 'USR-'.strtoupper(uniqid())]);
        $employee->user->syncRoles([$role]);

        return $employee;
    }

    private function makeShift(): Shift
    {
        return Shift::factory()->create([
            'name' => 'Morning Shift',
            'start_time' => '08:00:00',
            'end_time' => '17:00:00',
            'grace_minutes' => 10,
            'break_start' => '12:00:00',
            'break_end' => '13:00:00',
        ]);
    }

    private function scheduleEmployee(Employee $employee, Shift $shift, string $date): Schedule
    {
        return Schedule::factory()->create([
            'employee_id' => $employee->id,
            'shift_id' => $shift->id,
            'date' => $date,
        ]);
    }

    private function punch(Employee $employee, string $type, string $time, ?int $workMinutes = null): Attendance
    {
        return Attendance::factory()->create([
            'employee_id' => $employee->id,
            'branch_id' => $employee->branch_id,
            'type' => $type,
            'timestamp' => $time,
            'work_minutes' => $workMinutes,
        ]);
    }

    private function rowByEmployeeId(array $rows, string $employeeId): ?array
    {
        return collect($rows)->first(fn (array $row) => $row[0] === $employeeId);
    }

    private function parseCsv(string $content): array
    {
        return array_map(fn ($line) => str_getcsv($line), array_filter(explode("\n", trim($content))));
    }

    #[Test]
    public function hr_can_request_daily_report_and_download_it(): void
    {
        $hr = $this->makeUser('HR');
        $shift = $this->makeShift();
        $present = Employee::factory()->create(['branch_id' => $hr->branch_id]);
        $absent = Employee::factory()->create(['branch_id' => $hr->branch_id]);
        $this->scheduleEmployee($present, $shift, '2026-07-14');
        $this->scheduleEmployee($absent, $shift, '2026-07-14');
        $this->punch($present, 'time_in', '2026-07-14 08:00:00');
        $this->punch($present, 'time_out', '2026-07-14 17:00:00', 480);

        $response = $this->actingAs($hr->user, 'sanctum')->postJson('/api/admin/reports', [
            'type' => 'daily',
            'date_from' => '2026-07-14',
            'date_to' => '2026-07-14',
        ])->assertStatus(202)
            ->assertJsonPath('data.status', 'ready');

        $exportId = $response->json('data.id');

        $this->assertDatabaseHas('report_exports', ['id' => $exportId, 'status' => 'ready', 'row_count' => 2]);
        $this->assertDatabaseHas('audit_logs', ['action' => 'report_export.created', 'user_id' => $hr->user->id]);
        $this->assertDatabaseHas('notifications', ['type' => 'App\Notifications\GenericNotification']);

        $download = $this->actingAs($hr->user, 'sanctum')->getJson("/api/admin/reports/{$exportId}/download")
            ->assertOk()
            ->assertHeader('content-type', 'text/csv; charset=utf-8');

        $rows = $this->parseCsv($download->streamedContent());

        $this->assertSame(['employee_id', 'full_name', 'branch', 'department', 'date', 'shift', 'time_in', 'time_out', 'late_minutes', 'overtime_minutes', 'undertime_minutes', 'work_minutes', 'status'], $rows[0]);

        $presentRow = $this->rowByEmployeeId($rows, $present->user->employee_id);
        $absentRow = $this->rowByEmployeeId($rows, $absent->user->employee_id);

        $this->assertSame('PRESENT', $presentRow[12]);
        $this->assertSame('480', $presentRow[11]);
        $this->assertSame('ABSENT', $absentRow[12]);
        $this->assertSame('0', $absentRow[11]);
    }

    #[Test]
    public function daily_report_computes_late_overtime_and_undertime(): void
    {
        $hr = $this->makeUser('HR');
        $shift = $this->makeShift();

        $lateOver = Employee::factory()->create(['branch_id' => $hr->branch_id]);
        $under = Employee::factory()->create(['branch_id' => $hr->branch_id]);

        foreach ([$lateOver, $under] as $employee) {
            $this->scheduleEmployee($employee, $shift, '2026-07-14');
        }

        $this->punch($lateOver, 'time_in', '2026-07-14 08:30:00');
        $this->punch($lateOver, 'time_out', '2026-07-14 17:30:00', 480);

        $this->punch($under, 'time_in', '2026-07-14 08:00:00');
        $this->punch($under, 'time_out', '2026-07-14 16:00:00', 420);

        $response = $this->actingAs($hr->user, 'sanctum')->postJson('/api/admin/reports', [
            'type' => 'daily',
            'date_from' => '2026-07-14',
            'date_to' => '2026-07-14',
        ])->assertStatus(202);

        $download = $this->actingAs($hr->user, 'sanctum')
            ->getJson('/api/admin/reports/'.$response->json('data.id').'/download')
            ->assertOk();

        $rows = $this->parseCsv($download->streamedContent());

        $lateRow = $this->rowByEmployeeId($rows, $lateOver->user->employee_id);
        $underRow = $this->rowByEmployeeId($rows, $under->user->employee_id);

        $this->assertSame('20', $lateRow[8]);
        $this->assertSame('30', $lateRow[9]);
        $this->assertSame('0', $lateRow[10]);

        $this->assertSame('0', $underRow[8]);
        $this->assertSame('0', $underRow[9]);
        $this->assertSame('60', $underRow[10]);
    }

    #[Test]
    public function monthly_report_aggregates_attendance(): void
    {
        $hr = $this->makeUser('HR');
        $shift = $this->makeShift();
        $employee = Employee::factory()->create(['branch_id' => $hr->branch_id]);
        $this->scheduleEmployee($employee, $shift, '2026-07-13');
        $this->scheduleEmployee($employee, $shift, '2026-07-14');
        $this->punch($employee, 'time_in', '2026-07-13 08:00:00');
        $this->punch($employee, 'time_out', '2026-07-13 17:00:00', 450);

        $response = $this->actingAs($hr->user, 'sanctum')->postJson('/api/admin/reports', [
            'type' => 'monthly',
            'date_from' => '2026-07-01',
            'date_to' => '2026-07-31',
        ])->assertStatus(202);

        $download = $this->actingAs($hr->user, 'sanctum')
            ->getJson('/api/admin/reports/'.$response->json('data.id').'/download')
            ->assertOk();

        $rows = $this->parseCsv($download->streamedContent());

        $this->assertSame(['employee_id', 'full_name', 'branch', 'department', 'present_days', 'absent_days', 'total_work_minutes', 'total_late_minutes', 'total_overtime_minutes', 'total_undertime_minutes'], $rows[0]);

        $row = $this->rowByEmployeeId($rows, $employee->user->employee_id);

        $this->assertSame('1', $row[4]);
        $this->assertSame('1', $row[5]);
        $this->assertSame('450', $row[6]);
    }

    #[Test]
    public function reports_respect_branch_filter(): void
    {
        $hr = $this->makeUser('HR');
        $branchA = Branch::factory()->create();
        $branchB = Branch::factory()->create();
        $shift = $this->makeShift();

        $empA = Employee::factory()->create(['branch_id' => $branchA->id]);
        $empB = Employee::factory()->create(['branch_id' => $branchB->id]);
        $this->scheduleEmployee($empA, $shift, '2026-07-14');
        $this->scheduleEmployee($empB, $shift, '2026-07-14');

        $response = $this->actingAs($hr->user, 'sanctum')->postJson('/api/admin/reports', [
            'type' => 'daily',
            'date_from' => '2026-07-14',
            'date_to' => '2026-07-14',
            'filters' => ['branch_id' => $branchA->id],
        ])->assertStatus(202);

        $download = $this->actingAs($hr->user, 'sanctum')
            ->getJson('/api/admin/reports/'.$response->json('data.id').'/download')
            ->assertOk();

        $rows = $this->parseCsv($download->streamedContent());

        $this->assertCount(2, $rows);
        $this->assertSame($empA->user->employee_id, $rows[1][0]);
    }

    #[Test]
    public function branch_manager_sees_only_own_requests(): void
    {
        $branch = Branch::factory()->create();
        $bm = $this->makeUser('Branch Manager', $branch);
        $otherBm = $this->makeUser('Branch Manager', $branch);

        $response = $this->actingAs($bm->user, 'sanctum')->postJson('/api/admin/reports', [
            'type' => 'daily',
            'date_from' => '2026-07-14',
            'date_to' => '2026-07-14',
        ])->assertStatus(202);

        $exportId = $response->json('data.id');

        $this->actingAs($otherBm->user, 'sanctum')->getJson('/api/admin/reports')
            ->assertOk()
            ->assertJsonCount(0, 'data');

        $this->actingAs($otherBm->user, 'sanctum')->getJson("/api/admin/reports/{$exportId}")
            ->assertForbidden()
            ->assertJsonPath('code', 'not_authorized');

        $this->actingAs($otherBm->user, 'sanctum')->getJson("/api/admin/reports/{$exportId}/download")
            ->assertForbidden();
    }

    #[Test]
    public function date_range_over_31_days_is_rejected(): void
    {
        $hr = $this->makeUser('HR');

        $this->actingAs($hr->user, 'sanctum')->postJson('/api/admin/reports', [
            'type' => 'daily',
            'date_from' => '2026-07-01',
            'date_to' => '2026-08-15',
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('date_to');
    }

    #[Test]
    public function employees_cannot_access_reports(): void
    {
        $employee = $this->makeUser('Employee');

        $this->actingAs($employee->user, 'sanctum')->postJson('/api/admin/reports', [
            'type' => 'daily',
            'date_from' => '2026-07-14',
            'date_to' => '2026-07-14',
        ])->assertForbidden();
    }

    #[Test]
    public function download_before_ready_returns_409(): void
    {
        $hr = $this->makeUser('HR');
        $export = ReportExport::create([
            'requested_by' => $hr->user->id,
            'type' => 'daily',
            'date_from' => '2026-07-14',
            'date_to' => '2026-07-14',
            'status' => 'pending',
        ]);

        $this->actingAs($hr->user, 'sanctum')->getJson("/api/admin/reports/{$export->id}/download")
            ->assertStatus(409)
            ->assertJsonPath('code', 'export_not_ready');
    }
}
