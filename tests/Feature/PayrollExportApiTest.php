<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\PayrollExport;
use App\Models\Schedule;
use App\Models\Shift;
use App\Services\PayrollExportService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class PayrollExportApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['Payroll Officer', 'Employee'] as $role) {
            Role::findOrCreate($role, 'web');
        }
    }

    private function makePayrollOfficer(): Employee
    {
        $employee = Employee::factory()->create();
        $employee->user->update(['employee_id' => 'PAY-TEST']);
        $employee->user->syncRoles(['Payroll Officer']);

        return $employee;
    }

    private function makeScheduledEmployee(): Employee
    {
        $employee = Employee::factory()->create();
        $employee->user->update(['employee_id' => 'EMP-PAYROLL']);
        Schedule::create([
            'employee_id' => $employee->id,
            'shift_id' => Shift::factory()->create()->id,
            'date' => now()->toDateString(),
        ]);

        return $employee;
    }

    public function test_payroll_officer_can_request_export(): void
    {
        Storage::fake(config('dtr.payroll.export_disk'));
        $officer = $this->makePayrollOfficer();
        $this->makeScheduledEmployee();

        $this->actingAs($officer->user, 'sanctum')
            ->postJson('/api/admin/payroll-exports', [
                'date_from' => now()->toDateString(),
                'date_to' => now()->toDateString(),
            ])
            ->assertStatus(202)
            ->assertJsonPath('data.status', 'ready');

        $this->assertDatabaseHas('payroll_exports', [
            'requested_by' => $officer->user_id,
            'status' => 'ready',
        ]);
    }

    public function test_export_download_returns_csv(): void
    {
        Storage::fake(config('dtr.payroll.export_disk'));
        $officer = $this->makePayrollOfficer();
        $employee = $this->makeScheduledEmployee();

        $export = PayrollExport::create([
            'requested_by' => $officer->user_id,
            'date_from' => now()->toDateString(),
            'date_to' => now()->toDateString(),
            'status' => 'ready',
        ]);

        $service = app(PayrollExportService::class);
        $service->generate($export);

        $this->actingAs($officer->user, 'sanctum')
            ->getJson("/api/admin/payroll-exports/{$export->id}/download")
            ->assertOk()
            ->assertHeader('content-type', 'text/csv; charset=UTF-8');

        $streamed = $this->actingAs($officer->user, 'sanctum')
            ->get("/api/admin/payroll-exports/{$export->id}/download");
        $content = $streamed->streamedContent();

        $this->assertStringContainsString('employee_id,full_name', $content);
        $this->assertStringContainsString('EMP-PAYROLL', $content);
        $this->assertStringContainsString('ABSENT', $content);
    }

    public function test_download_of_unfinished_export_returns_409(): void
    {
        $officer = $this->makePayrollOfficer();

        $export = PayrollExport::create([
            'requested_by' => $officer->user_id,
            'date_from' => now()->toDateString(),
            'date_to' => now()->toDateString(),
            'status' => 'pending',
        ]);

        $this->actingAs($officer->user, 'sanctum')
            ->getJson("/api/admin/payroll-exports/{$export->id}/download")
            ->assertStatus(409)
            ->assertJsonPath('code', 'export_not_ready');
    }

    public function test_employee_cannot_access_payroll_endpoints(): void
    {
        $employee = Employee::factory()->create();
        $employee->user->syncRoles(['Employee']);

        $this->actingAs($employee->user, 'sanctum')
            ->getJson('/api/admin/payroll-exports')
            ->assertForbidden()
            ->assertJsonPath('code', 'forbidden');
    }
}
