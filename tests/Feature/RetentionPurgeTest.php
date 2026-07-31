<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\AuditLog;
use App\Models\Branch;
use App\Models\Employee;
use App\Models\SyncLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class RetentionPurgeTest extends TestCase
{
    use RefreshDatabase;

    private function makeEmployee(): Employee
    {
        return Employee::factory()->create(['branch_id' => Branch::factory()]);
    }

    private function punch(Employee $employee, string $timestamp): Attendance
    {
        return Attendance::factory()->create([
            'employee_id' => $employee->id,
            'branch_id' => $employee->branch_id,
            'type' => 'time_in',
            'timestamp' => $timestamp,
        ]);
    }

    #[Test]
    public function purges_attendance_sync_logs_and_audit_logs_older_than_retention(): void
    {
        $employee = $this->makeEmployee();

        $old = $this->punch($employee, now()->subDays(400)->toDateTimeString());
        $recent = $this->punch($employee, now()->subDays(10)->toDateTimeString());

        $oldSync = SyncLog::factory()->create([
            'employee_id' => $employee->id,
            'synced_at' => now()->subDays(400),
        ]);
        SyncLog::factory()->create([
            'employee_id' => $employee->id,
            'synced_at' => now()->subDays(10),
        ]);

        $oldAudit = AuditLog::factory()->create(['created_at' => now()->subDays(400)]);
        AuditLog::factory()->create(['created_at' => now()->subDays(10)]);

        Artisan::call('dtr:purge-old-data', ['--days' => 365, '--audit-days' => 365]);

        $this->assertDatabaseMissing('attendance', ['id' => $old->id]);
        $this->assertDatabaseHas('attendance', ['id' => $recent->id]);
        $this->assertDatabaseMissing('sync_logs', ['id' => $oldSync->id]);
        $this->assertDatabaseMissing('audit_logs', ['id' => $oldAudit->id]);
        $this->assertSame(1, Attendance::count());
        $this->assertSame(1, SyncLog::count());
        $this->assertSame(3, AuditLog::count());
    }

    #[Test]
    public function defaults_come_from_config(): void
    {
        $employee = $this->makeEmployee();

        $old = $this->punch($employee, now()->subDays(800)->toDateTimeString());
        $kept = $this->punch($employee, now()->subDays(600)->toDateTimeString());

        Artisan::call('dtr:purge-old-data');

        $this->assertDatabaseMissing('attendance', ['id' => $old->id]);
        $this->assertDatabaseHas('attendance', ['id' => $kept->id]);
    }

    #[Test]
    public function dry_run_deletes_nothing(): void
    {
        $employee = $this->makeEmployee();

        $old = $this->punch($employee, now()->subDays(400)->toDateTimeString());

        Artisan::call('dtr:purge-old-data', ['--days' => 365, '--dry-run' => true]);

        $this->assertDatabaseHas('attendance', ['id' => $old->id]);
        $this->assertSame(1, Attendance::count());
    }
}
