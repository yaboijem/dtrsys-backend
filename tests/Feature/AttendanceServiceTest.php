<?php

namespace Tests\Feature;

use App\Exceptions\AttendanceConflictException;
use App\Exceptions\FaceVerificationFailedException;
use App\Exceptions\GpsOutOfRangeException;
use App\Models\Branch;
use App\Models\Device;
use App\Models\Employee;
use App\Models\Schedule;
use App\Models\Shift;
use App\Services\AttendanceService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class AttendanceServiceTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        // Service-level tests assert sync face verify + mismatch rollback behavior.
        config(['dtr.attendance.async_face_verification' => false]);
    }

    private function makeEmployeeWithBranch(): array
    {
        $employee = Employee::factory()->create();
        $branch = $employee->branch;

        $employee->user->update(['password' => 'password']);

        return [$employee, $branch];
    }

    private function punchData(Branch $branch): array
    {
        return [
            'latitude' => (float) $branch->latitude + 0.0001,
            'longitude' => (float) $branch->longitude + 0.0001,
            'accuracy_meters' => 10,
            'device_id' => null,
        ];
    }

    #[Test]
    public function time_in_creates_attendance_with_photo_and_gps(): void
    {
        Storage::fake('public');
        [$employee] = $this->makeEmployeeWithBranch();

        $attendance = app(AttendanceService::class)->timeIn($employee->user, [
            ...$this->punchData($employee->branch),
            'selfie' => UploadedFile::fake()->image('selfie.jpg'),
        ]);

        $this->assertDatabaseHas('attendance', [
            'id' => $attendance->id,
            'employee_id' => $employee->id,
            'type' => 'time_in',
            'is_offline' => false,
        ]);

        $this->assertDatabaseHas('attendance_photos', [
            'attendance_id' => $attendance->id,
            'is_verified' => true,
            'liveness_status' => 'passed',
        ]);

        $this->assertDatabaseHas('gps_locations', [
            'attendance_id' => $attendance->id,
            'is_within_radius' => true,
        ]);

        Storage::disk('public')->assertExists($attendance->photo->path);
    }

    #[Test]
    public function duplicate_time_in_is_rejected(): void
    {
        [$employee] = $this->makeEmployeeWithBranch();

        $service = app(AttendanceService::class);
        $service->timeIn($employee->user, $this->punchData($employee->branch));

        $this->expectException(AttendanceConflictException::class);
        $service->timeIn($employee->user, $this->punchData($employee->branch));
    }

    #[Test]
    public function time_out_requires_prior_time_in(): void
    {
        [$employee] = $this->makeEmployeeWithBranch();

        $this->expectException(AttendanceConflictException::class);
        app(AttendanceService::class)->timeOut($employee->user, $this->punchData($employee->branch));
    }

    #[Test]
    public function time_out_computes_work_minutes(): void
    {
        [$employee] = $this->makeEmployeeWithBranch();
        $shift = Shift::factory()->create(['start_time' => '08:00:00', 'end_time' => '17:00:00']);
        Schedule::create([
            'employee_id' => $employee->id,
            'shift_id' => $shift->id,
            'date' => now()->toDateString(),
        ]);
        $service = app(AttendanceService::class);

        $this->travelTo(now()->setTime(9, 0));
        $service->timeIn($employee->user, $this->punchData($employee->branch));

        $this->travel(4 * 60 + 30)->minutes();

        $timeOut = $service->timeOut($employee->user, $this->punchData($employee->branch));

        $this->assertSame(210, $timeOut->work_minutes);
    }

    #[Test]
    public function out_of_radius_punch_is_rejected(): void
    {
        [$employee] = $this->makeEmployeeWithBranch();

        $this->expectException(GpsOutOfRangeException::class);

        app(AttendanceService::class)->timeIn($employee->user, [
            'latitude' => (float) $employee->branch->latitude - 1,
            'longitude' => (float) $employee->branch->longitude - 1,
            'accuracy_meters' => 10,
        ]);
    }

    #[Test]
    public function face_mismatch_rolls_back_the_punch(): void
    {
        Storage::fake('public');
        config(['dtr.face_verification.force_mismatch' => true]);
        [$employee] = $this->makeEmployeeWithBranch();

        try {
            app(AttendanceService::class)->timeIn($employee->user, [
                ...$this->punchData($employee->branch),
                'selfie' => UploadedFile::fake()->image('selfie.jpg'),
            ]);
            $this->fail('Expected FaceVerificationFailedException');
        } catch (FaceVerificationFailedException $e) {
            $this->assertSame('face_verification_failed', 'face_verification_failed');
        }

        $this->assertDatabaseCount('attendance', 0);
        $this->assertDatabaseCount('attendance_photos', 0);
        $this->assertDatabaseCount('gps_locations', 0);
    }

    #[Test]
    public function late_punch_is_marked_late_based_on_shift(): void
    {
        [$employee] = $this->makeEmployeeWithBranch();
        $shift = Shift::factory()->create(['start_time' => '08:00:00', 'grace_minutes' => 10]);
        Schedule::create([
            'employee_id' => $employee->id,
            'shift_id' => $shift->id,
            'date' => now()->toDateString(),
        ]);

        $service = app(AttendanceService::class);

        $this->travelTo(now()->setTime(8, 5));
        $onTime = $service->timeIn($employee->user, $this->punchData($employee->branch));
        $this->assertFalse($onTime->is_late);
    }

    #[Test]
    public function late_punch_is_marked_late(): void
    {
        [$employee] = $this->makeEmployeeWithBranch();
        $shift = Shift::factory()->create(['start_time' => '08:00:00', 'grace_minutes' => 10]);
        Schedule::create([
            'employee_id' => $employee->id,
            'shift_id' => $shift->id,
            'date' => now()->toDateString(),
        ]);

        $this->travelTo(now()->setTime(9, 0));

        $attendance = app(AttendanceService::class)->timeIn($employee->user, $this->punchData($employee->branch));

        $this->assertTrue($attendance->is_late);
    }

    #[Test]
    public function early_timeout_is_flagged_when_clocking_out_before_shift_end(): void
    {
        [$employee] = $this->makeEmployeeWithBranch();
        $shift = Shift::factory()->create(['start_time' => '08:00:00', 'end_time' => '17:00:00', 'grace_minutes' => 0]);
        Schedule::create([
            'employee_id' => $employee->id,
            'shift_id' => $shift->id,
            'date' => now()->toDateString(),
        ]);
        $service = app(AttendanceService::class);

        $this->travelTo(now()->setTime(8, 0));
        $service->timeIn($employee->user, $this->punchData($employee->branch));

        $this->travelTo(now()->setTime(15, 0));
        $timeOut = $service->timeOut($employee->user, $this->punchData($employee->branch));

        $this->assertTrue($timeOut->is_early_timeout);
    }

    #[Test]
    public function time_out_at_or_after_shift_end_is_not_flagged_early(): void
    {
        [$employee] = $this->makeEmployeeWithBranch();
        $shift = Shift::factory()->create(['start_time' => '08:00:00', 'end_time' => '17:00:00', 'grace_minutes' => 0]);
        Schedule::create([
            'employee_id' => $employee->id,
            'shift_id' => $shift->id,
            'date' => now()->toDateString(),
        ]);
        $service = app(AttendanceService::class);

        $this->travelTo(now()->setTime(8, 0));
        $service->timeIn($employee->user, $this->punchData($employee->branch));

        $this->travelTo(now()->setTime(17, 0));
        $timeOut = $service->timeOut($employee->user, $this->punchData($employee->branch));

        $this->assertFalse($timeOut->is_early_timeout);
    }

    #[Test]
    public function time_out_without_a_schedule_is_not_flagged_early(): void
    {
        [$employee] = $this->makeEmployeeWithBranch();
        $service = app(AttendanceService::class);

        $this->travelTo(now()->setTime(8, 0));
        $service->timeIn($employee->user, $this->punchData($employee->branch));

        $this->travelTo(now()->setTime(15, 0));
        $timeOut = $service->timeOut($employee->user, $this->punchData($employee->branch));

        $this->assertFalse($timeOut->is_early_timeout);
    }

    #[Test]
    public function time_in_is_never_flagged_early(): void
    {
        [$employee] = $this->makeEmployeeWithBranch();
        $shift = Shift::factory()->create(['start_time' => '08:00:00', 'end_time' => '17:00:00', 'grace_minutes' => 0]);
        Schedule::create([
            'employee_id' => $employee->id,
            'shift_id' => $shift->id,
            'date' => now()->toDateString(),
        ]);

        $this->travelTo(now()->setTime(9, 0));
        $timeIn = app(AttendanceService::class)->timeIn($employee->user, $this->punchData($employee->branch));

        $this->assertFalse($timeIn->is_early_timeout);
    }

    #[Test]
    public function time_in_records_the_device(): void
    {
        [$employee] = $this->makeEmployeeWithBranch();
        $device = Device::factory()->create([
            'employee_id' => $employee->id,
            'device_id' => 'phone-001',
        ]);

        $attendance = app(AttendanceService::class)->timeIn($employee->user, [
            ...$this->punchData($employee->branch),
            'device_id' => 'phone-001',
        ]);

        $this->assertSame($device->id, $attendance->device_id);
    }
}
