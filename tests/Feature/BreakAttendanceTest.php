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

    private function makeEmployee(): Employee
    {
        $employee = Employee::factory()->create();
        $employee->user->update(['employee_id' => 'EMP-BRK']);
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

    #[Test]
    public function employee_can_break_in_and_out_without_selfie(): void
    {
        $employee = $this->makeEmployee();
        $this->timeIn($employee);

        $this->actingAs($employee->user, 'sanctum')
            ->postJson('/api/attendance/break-in', $this->gps($employee->branch))
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
            ->postJson('/api/attendance/break-in', $this->gps($employee->branch))
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
            ->postJson('/api/attendance/break-in', $this->gps($employee->branch))
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
            ->postJson('/api/attendance/break-in', $this->gps($employee->branch))
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
            ->postJson('/api/attendance/break-in', $this->gps($employee->branch))
            ->assertCreated();

        Carbon::setTestNow(now()->addMinutes(20));

        $this->actingAs($employee->user, 'sanctum')
            ->postJson('/api/attendance/break-out', $this->gps($employee->branch))
            ->assertSuccessful();

        $this->actingAs($employee->user, 'sanctum')
            ->postJson('/api/attendance/break-in', $this->gps($employee->branch))
            ->assertStatus(409)
            ->assertJsonPath('code', 'attendance_conflict');

        Carbon::setTestNow();
    }

    #[Test]
    public function break_in_requires_clock_in(): void
    {
        $employee = $this->makeEmployee();

        $this->actingAs($employee->user, 'sanctum')
            ->postJson('/api/attendance/break-in', $this->gps($employee->branch))
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
            ->postJson('/api/attendance/break-in', $this->gps($employee->branch))
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
            ->postJson('/api/attendance/break-in', $this->gps($employee->branch))
            ->assertStatus(422)
            ->assertJsonPath('code', 'breaks_disabled');
    }

    #[Test]
    public function break_out_still_allowed_when_breaks_disabled(): void
    {
        $employee = $this->makeEmployee();
        $this->timeIn($employee);

        $this->actingAs($employee->user, 'sanctum')
            ->postJson('/api/attendance/break-in', $this->gps($employee->branch))
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
