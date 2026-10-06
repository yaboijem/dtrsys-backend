<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Employee;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class AttendanceSessionTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Role::findOrCreate('Employee', 'web');
    }

    private function employee(): Employee
    {
        $employee = Employee::factory()->create();
        $employee->user->syncRoles(['Employee']);

        return $employee;
    }

    private function punch(Employee $employee, string $type, string $timestamp): Attendance
    {
        return Attendance::factory()->create([
            'employee_id' => $employee->id,
            'branch_id' => $employee->branch_id,
            'type' => $type,
            'timestamp' => $timestamp,
        ]);
    }

    #[Test]
    public function session_is_closed_when_the_employee_has_no_punches(): void
    {
        $employee = $this->employee();

        $this->actingAs($employee->user, 'sanctum')
            ->getJson('/api/attendance/session')
            ->assertOk()
            ->assertJsonPath('data.open', false)
            ->assertJsonPath('data.on_break', false)
            ->assertJsonPath('data.time_in', null)
            ->assertJsonPath('data.break', null);
    }

    #[Test]
    public function session_is_open_after_time_in_and_closed_after_time_out(): void
    {
        $employee = $this->employee();
        $timeIn = $this->punch($employee, 'time_in', now()->subHour()->toDateTimeString());

        $this->actingAs($employee->user, 'sanctum')
            ->getJson('/api/attendance/session')
            ->assertOk()
            ->assertJsonPath('data.open', true)
            ->assertJsonPath('data.on_break', false)
            ->assertJsonPath('data.time_in.uuid', $timeIn->uuid);

        $this->punch($employee, 'time_out', now()->subMinutes(10)->toDateTimeString());

        $this->actingAs($employee->user, 'sanctum')
            ->getJson('/api/attendance/session')
            ->assertOk()
            ->assertJsonPath('data.open', false)
            ->assertJsonPath('data.time_in', null);
    }

    #[Test]
    public function session_reports_an_open_break(): void
    {
        $employee = $this->employee();
        $this->punch($employee, 'time_in', now()->subHours(2)->toDateTimeString());
        $break = $this->punch($employee, 'break_in', now()->subMinutes(20)->toDateTimeString());
        $break->update(['break_kind' => '15_min', 'expected_end_at' => now()->subMinutes(5)]);

        $this->actingAs($employee->user, 'sanctum')
            ->getJson('/api/attendance/session')
            ->assertOk()
            ->assertJsonPath('data.open', true)
            ->assertJsonPath('data.on_break', true)
            ->assertJsonPath('data.break.uuid', $break->uuid)
            ->assertJsonPath('data.break.break_kind', '15_min');
    }

    #[Test]
    public function session_uses_the_later_open_shift_not_an_older_closed_one(): void
    {
        $employee = $this->employee();
        $this->punch($employee, 'time_in', now()->subDays(2)->toDateTimeString());
        $this->punch($employee, 'time_out', now()->subDays(2)->addHours(8)->toDateTimeString());
        $current = $this->punch($employee, 'time_in', now()->subHour()->toDateTimeString());

        $this->actingAs($employee->user, 'sanctum')
            ->getJson('/api/attendance/session')
            ->assertOk()
            ->assertJsonPath('data.open', true)
            ->assertJsonPath('data.time_in.uuid', $current->uuid);
    }

    #[Test]
    public function session_lookup_does_not_load_full_history(): void
    {
        $employee = $this->employee();
        for ($i = 40; $i >= 1; $i--) {
            $this->punch($employee, 'time_in', now()->subDays($i)->toDateTimeString());
            $this->punch($employee, 'time_out', now()->subDays($i)->addHours(8)->toDateTimeString());
        }
        $current = $this->punch($employee, 'time_in', now()->subMinutes(5)->toDateTimeString());

        $sql = [];
        DB::listen(function ($query) use (&$sql) {
            if (str_contains($query->sql, 'attendance')) {
                $sql[] = strtolower($query->sql);
            }
        });

        $this->actingAs($employee->user, 'sanctum')
            ->getJson('/api/attendance/session')
            ->assertOk()
            ->assertJsonPath('data.time_in.uuid', $current->uuid);

        $this->assertNotEmpty($sql);
        foreach ($sql as $statement) {
            $this->assertStringContainsString('limit 1', $statement);
        }
    }

    #[Test]
    public function duplicate_time_in_conflict_includes_the_open_session(): void
    {
        $employee = $this->employee();
        $timeIn = $this->punch($employee, 'time_in', now()->subMinutes(30)->toDateTimeString());

        $this->actingAs($employee->user, 'sanctum')
            ->post('/api/attendance/time-in', [
                'latitude' => (float) $employee->branch->latitude + 0.0001,
                'longitude' => (float) $employee->branch->longitude + 0.0001,
                'accuracy_meters' => 8,
                'selfie' => UploadedFile::fake()->image('selfie.jpg'),
                'client_uuid' => (string) Str::uuid(),
            ])
            ->assertStatus(409)
            ->assertJsonPath('code', 'attendance_conflict')
            ->assertJsonPath('session.open', true)
            ->assertJsonPath('session.on_break', false)
            ->assertJsonPath('session.time_in.uuid', $timeIn->uuid);

        $this->assertSame(1, Attendance::where('employee_id', $employee->id)->where('type', 'time_in')->count());
    }

    #[Test]
    public function work_punches_span_the_shift_not_the_calendar_day(): void
    {
        $employee = $this->employee();
        $this->punch($employee, 'time_in', '2026-10-03 13:58:02');
        $this->punch($employee, 'time_out', '2026-10-03 13:58:25');
        $timeIn = $this->punch($employee, 'time_in', '2026-10-05 02:28:13');
        $this->punch($employee, 'break_in', '2026-10-05 02:30:53');
        $this->punch($employee, 'break_out', '2026-10-06 04:02:43');
        $timeOut = $this->punch($employee, 'time_out', '2026-10-06 04:03:23');
        $timeOut->update(['work_minutes' => 4]);

        $this->actingAs($employee->user, 'sanctum')
            ->getJson('/api/attendance/work')
            ->assertOk()
            ->assertJsonCount(4, 'data')
            ->assertJsonPath('data.0.type', 'time_in')
            ->assertJsonPath('data.0.id', $timeIn->id)
            ->assertJsonPath('data.3.type', 'time_out')
            ->assertJsonPath('data.3.id', $timeOut->id)
            ->assertJsonPath('data.3.work_minutes', 4);
    }

    #[Test]
    public function work_punches_keep_an_open_shift_from_a_previous_day(): void
    {
        $employee = $this->employee();
        $timeIn = $this->punch($employee, 'time_in', '2026-10-05 02:28:13');
        $this->punch($employee, 'break_in', '2026-10-05 02:30:53');

        $this->actingAs($employee->user, 'sanctum')
            ->getJson('/api/attendance/work')
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.type', 'time_in')
            ->assertJsonPath('data.0.id', $timeIn->id)
            ->assertJsonPath('data.1.type', 'break_in');
    }
}
