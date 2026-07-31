<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\PayrollExport;
use App\Models\Schedule;
use App\Models\Shift;
use App\Services\PayrollExportService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class PayrollExportServiceTest extends TestCase
{
    use RefreshDatabase;

    private function makeEmployeeWithSchedule(): array
    {
        $employee = Employee::factory()->create();
        $shift = Shift::factory()->create(['name' => 'Morning Shift']);
        Schedule::create([
            'employee_id' => $employee->id,
            'shift_id' => $shift->id,
            'date' => now()->toDateString(),
        ]);

        return [$employee, $shift];
    }

    private function makeExport(int $requestedBy): PayrollExport
    {
        return PayrollExport::create([
            'requested_by' => $requestedBy,
            'date_from' => now()->toDateString(),
            'date_to' => now()->toDateString(),
            'filters' => ['branches' => null],
            'status' => 'pending',
        ]);
    }

    #[Test]
    public function generates_csv_with_present_and_absent_rows(): void
    {
        Storage::fake(config('dtr.payroll.export_disk'));
        [$employee] = $this->makeEmployeeWithSchedule();
        $employee->user->update(['employee_id' => 'EMP-PAY-1']);

        Attendance::create([
            'employee_id' => $employee->id,
            'branch_id' => $employee->branch_id,
            'type' => 'time_in',
            'timestamp' => now()->setTime(8, 0),
            'latitude' => $employee->branch->latitude,
            'longitude' => $employee->branch->longitude,
            'is_late' => true,
        ]);

        [$absent] = $this->makeEmployeeWithSchedule();
        $absent->user->update(['employee_id' => 'EMP-PAY-2']);

        $export = $this->makeExport($employee->user_id);
        $result = app(PayrollExportService::class)->generate($export);

        $this->assertSame('ready', $result->status);
        $this->assertSame(2, $result->row_count);
        $this->assertNotNull($result->file_path);

        Storage::disk(config('dtr.payroll.export_disk'))->assertExists($result->file_path);

        $csv = Storage::disk(config('dtr.payroll.export_disk'))->get($result->file_path);

        $this->assertStringContainsString('EMP-PAY-1', $csv);
        $this->assertStringContainsString('PRESENT', $csv);
        $this->assertStringContainsString('YES', $csv);
        $this->assertStringContainsString('EMP-PAY-2', $csv);
        $this->assertStringContainsString('ABSENT', $csv);
    }

    #[Test]
    public function marks_export_failed_when_write_fails(): void
    {
        [$employee] = $this->makeEmployeeWithSchedule();

        $export = $this->makeExport($employee->user_id);
        config(['dtr.payroll.export_disk' => 'missing-disk']);

        try {
            app(PayrollExportService::class)->generate($export);
            $this->fail('Expected an exception from the missing disk.');
        } catch (\Throwable) {
            $export->refresh();
            $this->assertSame('failed', $export->status);
            $this->assertNotNull($export->error_message);
        }
    }
}
