<?php

namespace Tests\Feature;

use App\Jobs\NotifyBreakPastDueJob;
use App\Jobs\NotifyTimedBreakEndingJob;
use App\Models\AppSetting;
use App\Models\Attendance;
use App\Models\Branch;
use App\Models\Employee;
use App\Notifications\GenericNotification;
use App\Services\AttendanceService;
use App\Services\NotificationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;
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
    public function break_in_rejects_accuracy_above_the_branch_ceiling(): void
    {
        $employee = $this->makeEmployee();
        $this->timeIn($employee);

        $this->actingAs($employee->user, 'sanctum')
            ->postJson('/api/attendance/break-in', [
                ...$this->gps($employee->branch, ['accuracy_meters' => 101]),
                'break_kind' => 'bio',
            ])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'gps_accuracy_too_poor');
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
    public function employee_can_take_another_break_after_done_break(): void
    {
        $employee = $this->makeEmployee();
        $this->timeIn($employee);
        $this->breakIn($employee, 'bio');

        Carbon::setTestNow(now()->addMinutes(10));
        $this->actingAs($employee->user, 'sanctum')
            ->postJson('/api/attendance/break-out', $this->gps($employee->branch))
            ->assertSuccessful();

        $this->breakIn($employee, 'phone');

        $this->assertSame(2, Attendance::where('employee_id', $employee->id)->where('type', 'break_in')->count());
        Carbon::setTestNow();
    }

    #[Test]
    public function time_out_closes_an_open_break_then_clocks_out(): void
    {
        $employee = $this->makeEmployee();
        $this->timeIn($employee);
        $this->breakIn($employee, 'coaching');

        $this->actingAs($employee->user, 'sanctum')
            ->postJson('/api/attendance/time-out', [
                ...$this->gps($employee->branch),
                'selfie' => UploadedFile::fake()->image('out.jpg'),
                'client_uuid' => '11111111-1111-4111-8111-111111111111',
            ])
            ->assertSuccessful()
            ->assertJsonPath('data.type', 'time_out');

        $breakOut = Attendance::where('employee_id', $employee->id)->where('type', 'break_out')->first();
        $this->assertNotNull($breakOut);
        $this->assertSame('coaching', $breakOut->break_kind);
        $this->assertNull($breakOut->expected_end_at);
        $this->assertNull($this->app->make(AttendanceService::class)->openBreakFor($employee));
    }

    #[Test]
    public function time_in_after_time_out_starts_another_shift(): void
    {
        $employee = $this->makeEmployee();
        $this->timeIn($employee);

        $this->actingAs($employee->user, 'sanctum')
            ->postJson('/api/attendance/time-out', [
                ...$this->gps($employee->branch),
                'selfie' => UploadedFile::fake()->image('out.jpg'),
            ])
            ->assertSuccessful();

        $this->timeIn($employee);
        $this->assertSame(2, Attendance::where('employee_id', $employee->id)->where('type', 'time_in')->count());
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
    public function fifteen_minute_break_schedules_one_alert_for_two_minutes_left(): void
    {
        Notification::fake();
        Queue::fake();
        $employee = $this->makeEmployee();
        $this->timeIn($employee);

        $this->actingAs($employee->user, 'sanctum')
            ->postJson('/api/attendance/break-in', [...$this->gps($employee->branch), 'break_kind' => '15_min'])
            ->assertCreated();

        $breakIn = Attendance::where('employee_id', $employee->id)->where('type', 'break_in')->first();
        Queue::assertPushed(NotifyTimedBreakEndingJob::class, function (NotifyTimedBreakEndingJob $job) use ($breakIn) {
            return $job->attendanceId === $breakIn->id;
        });

        $job = new NotifyTimedBreakEndingJob($breakIn->id);
        $job->handle(app(NotificationService::class));
        $job->handle(app(NotificationService::class));

        $this->assertSame('ending', $breakIn->fresh()->break_notify_stage);
        $this->assertSame(1, Notification::sent($employee->user, GenericNotification::class)->count());
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

    #[Test]
    public function timed_break_is_flagged_and_notifies_five_minutes_past_due(): void
    {
        Notification::fake();
        Queue::fake();
        $employee = $this->makeEmployee('EMP-PAST');
        $this->timeIn($employee);

        $this->actingAs($employee->user, 'sanctum')
            ->postJson('/api/attendance/break-in', [...$this->gps($employee->branch), 'break_kind' => '15_min'])
            ->assertCreated();

        $breakIn = Attendance::where('employee_id', $employee->id)->where('type', 'break_in')->first();
        Queue::assertPushed(NotifyBreakPastDueJob::class, function (NotifyBreakPastDueJob $job) use ($breakIn) {
            return $job->attendanceId === $breakIn->id
                && Carbon::parse($job->delay)->equalTo($breakIn->expected_end_at->copy()->addMinutes(5));
        });

        $job = new NotifyBreakPastDueJob($breakIn->id);
        $job->handle(app(NotificationService::class));
        $this->assertDatabaseCount('fraud_flags', 0);

        Carbon::setTestNow($breakIn->expected_end_at->copy()->addMinutes(5));
        $job->handle(app(NotificationService::class));
        $job->handle(app(NotificationService::class));

        $this->assertDatabaseHas('fraud_flags', [
            'attendance_id' => $breakIn->id,
            'type' => 'overbreak',
            'severity' => 'medium',
            'status' => 'open',
        ]);
        $this->assertSame(1, Notification::sent($employee->user, GenericNotification::class)->count());
        Notification::assertSentTo($employee->user, GenericNotification::class, function (GenericNotification $notification) {
            return $notification->title === 'Break past due'
                && $notification->data['type'] === 'break_past_due';
        });

        Carbon::setTestNow();
    }

    #[Test]
    public function past_due_alert_is_skipped_when_the_break_already_ended(): void
    {
        Notification::fake();
        Queue::fake();
        $employee = $this->makeEmployee('EMP-CLOSED');
        $this->timeIn($employee);
        $this->breakIn($employee, '15_min');

        $breakIn = Attendance::where('employee_id', $employee->id)->where('type', 'break_in')->first();
        Carbon::setTestNow($breakIn->expected_end_at->copy()->addMinutes(6));

        $this->actingAs($employee->user, 'sanctum')
            ->postJson('/api/attendance/break-out', $this->gps($employee->branch))
            ->assertSuccessful();

        $job = new NotifyBreakPastDueJob($breakIn->id);
        $job->handle(app(NotificationService::class));

        $this->assertDatabaseMissing('fraud_flags', [
            'attendance_id' => $breakIn->id,
            'type' => 'overbreak',
        ]);
        Notification::assertNothingSent();
        Carbon::setTestNow();
    }

    #[Test]
    public function five_minute_test_break_is_rejected(): void
    {
        $employee = $this->makeEmployee('EMP-FIVE');
        $this->timeIn($employee);

        $this->actingAs($employee->user, 'sanctum')
            ->postJson('/api/attendance/break-in', [...$this->gps($employee->branch), 'break_kind' => '5_min'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('break_kind');
    }
}
