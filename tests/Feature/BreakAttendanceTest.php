<?php

namespace Tests\Feature;

use App\Models\AppSetting;
use App\Models\Attendance;
use App\Models\Branch;
use App\Models\Employee;
use App\Models\User;
use App\Notifications\GenericNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class BreakAttendanceTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Role::findOrCreate('Employee', 'web');
        Storage::fake('public');
    }

    private function makeEmployee(string $employeeId = 'EMP-BRK'): Employee
    {
        $employee = Employee::factory()->create();
        $employee->user->update(['employee_id' => $employeeId]);
        $employee->user->syncRoles(['Employee']);

        return $employee;
    }

    private function gps(Branch $branch, array $overrides = []): array
    {
        return array_merge([
            'latitude' => (float) $branch->latitude + 0.0001,
            'longitude' => (float) $branch->longitude + 0.0001,
            'accuracy_meters' => 8,
        ], $overrides);
    }

    private function timeIn(Employee $employee): void
    {
        $this->actingAs($employee->user, 'sanctum')->postJson('/api/attendance/time-in', [
            ...$this->gps($employee->branch),
            'selfie' => UploadedFile::fake()->image('selfie.jpg'),
        ])->assertCreated();
    }

    private function breakIn(Employee $employee, string $kind = 'bio'): void
    {
        $this->actingAs($employee->user, 'sanctum')
            ->postJson('/api/attendance/break-in', [
                ...$this->gps($employee->branch),
                'break_kind' => $kind,
            ])
            ->assertCreated();
    }

    #[Test]
    public function timed_break_stores_kind_and_due_time(): void
    {
        $employee = $this->makeEmployee();
        $this->timeIn($employee);
        $this->breakIn($employee, '15_min');

        $break = Attendance::where('employee_id', $employee->id)->where('type', 'break_in')->first();
        $this->assertSame('15_min', $break->break_kind);
        $this->assertTrue($break->expected_end_at->equalTo($break->timestamp->copy()->addMinutes(15)));

        $employee = $this->makeEmployee('EMP-LUNCH');
        $this->timeIn($employee);
        $this->breakIn($employee, 'lunch_60');

        $lunch = Attendance::where('employee_id', $employee->id)->where('type', 'break_in')->first();
        $this->assertSame('lunch_60', $lunch->break_kind);
        $this->assertTrue($lunch->expected_end_at->equalTo($lunch->timestamp->copy()->addMinutes(60)));
    }

    #[Test]
    public function untimed_break_has_no_due_time(): void
    {
        $employee = $this->makeEmployee();
        $this->timeIn($employee);
        $this->breakIn($employee, 'bio');

        $break = Attendance::where('employee_id', $employee->id)->where('type', 'break_in')->first();
        $this->assertSame('bio', $break->break_kind);
        $this->assertNull($break->expected_end_at);
    }

    #[Test]
    public function break_in_rejects_unknown_kind(): void
    {
        $employee = $this->makeEmployee();
        $this->timeIn($employee);

        $this->actingAs($employee->user, 'sanctum')
            ->postJson('/api/attendance/break-in', [
                ...$this->gps($employee->branch),
                'break_kind' => 'nap',
            ])
            ->assertStatus(422);
    }

    #[Test]
    public function employee_can_break_in_and_out_without_selfie(): void
    {
        $employee = $this->makeEmployee();
        $this->timeIn($employee);

        $this->actingAs($employee->user, 'sanctum')
            ->postJson('/api/attendance/break-in', [...$this->gps($employee->branch), 'break_kind' => 'bio'])
            ->assertCreated()
            ->assertJsonPath('data.type', 'break_in')
            ->assertJsonPath('data.gps_location.is_within_radius', true)
            ->assertJsonMissingPath('data.photo.path');

        Carbon::setTestNow(now()->addMinutes(25));

        $this->actingAs($employee->user, 'sanctum')
            ->postJson('/api/attendance/break-out', $this->gps($employee->branch))
            ->assertSuccessful()
            ->assertJsonPath('data.type', 'break_out')
            ->assertJsonPath('data.break_minutes', 25)
            ->assertJsonPath('data.is_overbreak', false);

        Carbon::setTestNow();
    }

    #[Test]
    public function break_out_marks_overbreak_after_60_minutes(): void
    {
        $employee = $this->makeEmployee();
        $this->timeIn($employee);

        $this->actingAs($employee->user, 'sanctum')
            ->postJson('/api/attendance/break-in', [...$this->gps($employee->branch), 'break_kind' => 'bio'])
            ->assertCreated();

        Carbon::setTestNow(now()->addMinutes(61));

        $this->actingAs($employee->user, 'sanctum')
            ->postJson('/api/attendance/break-out', $this->gps($employee->branch))
            ->assertSuccessful()
            ->assertJsonPath('data.break_minutes', 61)
            ->assertJsonPath('data.is_overbreak', true);

        Carbon::setTestNow();
    }

    #[Test]
    public function work_minutes_exclude_break_duration(): void
    {
        $employee = $this->makeEmployee();
        $this->timeIn($employee);

        $this->actingAs($employee->user, 'sanctum')
            ->postJson('/api/attendance/break-in', [...$this->gps($employee->branch), 'break_kind' => 'bio'])
            ->assertCreated();

        Carbon::setTestNow(now()->addMinutes(30));

        $this->actingAs($employee->user, 'sanctum')
            ->postJson('/api/attendance/break-out', $this->gps($employee->branch))
            ->assertSuccessful();

        Carbon::setTestNow(now()->addMinutes(90));

        $this->actingAs($employee->user, 'sanctum')
            ->postJson('/api/attendance/time-out', [
                ...$this->gps($employee->branch),
                'selfie' => UploadedFile::fake()->image('out.jpg'),
            ])
            ->assertSuccessful()
            ->assertJsonPath('data.work_minutes', 90);

        Carbon::setTestNow();
    }

    #[Test]
    public function time_out_blocked_while_on_break(): void
    {
        $employee = $this->makeEmployee();
        $this->timeIn($employee);

        $this->actingAs($employee->user, 'sanctum')
            ->postJson('/api/attendance/break-in', [...$this->gps($employee->branch), 'break_kind' => 'bio'])
            ->assertCreated();

        $this->actingAs($employee->user, 'sanctum')
            ->postJson('/api/attendance/time-out', [
                ...$this->gps($employee->branch),
                'selfie' => UploadedFile::fake()->image('out.jpg'),
            ])
            ->assertStatus(409)
            ->assertJsonPath('code', 'attendance_conflict');
    }

    #[Test]
    public function only_one_break_per_shift(): void
    {
        $employee = $this->makeEmployee();
        $this->timeIn($employee);

        $this->actingAs($employee->user, 'sanctum')
            ->postJson('/api/attendance/break-in', [...$this->gps($employee->branch), 'break_kind' => 'bio'])
            ->assertCreated();

        Carbon::setTestNow(now()->addMinutes(20));

        $this->actingAs($employee->user, 'sanctum')
            ->postJson('/api/attendance/break-out', $this->gps($employee->branch))
            ->assertSuccessful();

        $this->actingAs($employee->user, 'sanctum')
            ->postJson('/api/attendance/break-in', [...$this->gps($employee->branch), 'break_kind' => 'bio'])
            ->assertStatus(409)
            ->assertJsonPath('code', 'attendance_conflict');

        Carbon::setTestNow();
    }

    #[Test]
    public function break_in_requires_clock_in(): void
    {
        $employee = $this->makeEmployee();

        $this->actingAs($employee->user, 'sanctum')
            ->postJson('/api/attendance/break-in', [...$this->gps($employee->branch), 'break_kind' => 'bio'])
            ->assertStatus(409);
    }

    #[Test]
    public function break_gps_out_of_range(): void
    {
        $employee = $this->makeEmployee();
        $this->timeIn($employee);

        $this->actingAs($employee->user, 'sanctum')
            ->postJson('/api/attendance/break-in', [
                'latitude' => 0,
                'longitude' => 0,
                'accuracy_meters' => 5,
                'break_kind' => 'bio',
            ])
            ->assertStatus(422)
            ->assertJsonPath('code', 'gps_out_of_range');
    }

    #[Test]
    public function open_break_job_sends_warning_and_overbreak_once(): void
    {
        Notification::fake();
        $employee = $this->makeEmployee();
        $this->timeIn($employee);

        $this->actingAs($employee->user, 'sanctum')
            ->postJson('/api/attendance/break-in', [...$this->gps($employee->branch), 'break_kind' => 'bio'])
            ->assertCreated();

        $breakIn = Attendance::where('employee_id', $employee->id)->where('type', 'break_in')->first();
        $breakIn->update(['timestamp' => now()->subMinutes(50)]);

        Artisan::call('dtr:check-open-breaks');
        Notification::assertSentTo($employee->user, GenericNotification::class);

        Artisan::call('dtr:check-open-breaks');
        $this->assertSame('warned', $breakIn->fresh()->break_notify_stage);

        $breakIn->update(['timestamp' => now()->subMinutes(60)]);
        Artisan::call('dtr:check-open-breaks');
        $this->assertSame('overbreak', $breakIn->fresh()->break_notify_stage);

        $count = Notification::sent($employee->user, GenericNotification::class)->count();
        $this->assertSame(2, $count);
    }

    #[Test]
    public function break_in_rejected_when_breaks_disabled(): void
    {
        AppSetting::current()->update(['breaks_enabled' => false]);
        $employee = $this->makeEmployee();
        $this->timeIn($employee);

        $this->actingAs($employee->user, 'sanctum')
            ->postJson('/api/attendance/break-in', [...$this->gps($employee->branch), 'break_kind' => 'bio'])
            ->assertStatus(422)
            ->assertJsonPath('code', 'breaks_disabled');
    }

    #[Test]
    public function break_out_still_allowed_when_breaks_disabled(): void
    {
        $employee = $this->makeEmployee();
        $this->timeIn($employee);

        $this->actingAs($employee->user, 'sanctum')
            ->postJson('/api/attendance/break-in', [...$this->gps($employee->branch), 'break_kind' => 'bio'])
            ->assertCreated();

        AppSetting::current()->update(['breaks_enabled' => false]);

        Carbon::setTestNow(now()->addMinutes(20));

        $this->actingAs($employee->user, 'sanctum')
            ->postJson('/api/attendance/break-out', $this->gps($employee->branch))
            ->assertSuccessful()
            ->assertJsonPath('data.type', 'break_out');

        Carbon::setTestNow();
    }
}
