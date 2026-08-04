<?php

namespace Tests\Feature;

use App\Jobs\NotifyFraudFlagJob;
use App\Jobs\VerifyAttendancePhotoJob;
use App\Models\AttendancePhoto;
use App\Models\Employee;
use App\Services\AttendanceService;
use App\Services\FaceVerificationService;
use App\Services\FraudDetectionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class AsyncFaceVerificationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Role::findOrCreate('Employee', 'web');
    }

    private function makeEmployee(): Employee
    {
        $employee = Employee::factory()->create();
        $employee->user->update(['employee_id' => 'EMP-ASYNC']);
        $employee->user->syncRoles(['Employee']);

        return $employee;
    }

    private function punchPayload(Employee $employee): array
    {
        $branch = $employee->branch;

        return [
            'latitude' => (float) $branch->latitude + 0.0001,
            'longitude' => (float) $branch->longitude + 0.0001,
            'accuracy_meters' => 8,
            'selfie' => UploadedFile::fake()->image('selfie.jpg'),
        ];
    }

    #[Test]
    public function async_face_accepts_punch_and_flags_mismatch_later(): void
    {
        Storage::fake('public');
        config(['dtr.attendance.async_face_verification' => true]);
        config(['dtr.face_verification.force_mismatch' => true]);
        Queue::fake();

        $employee = $this->makeEmployee();

        $this->actingAs($employee->user, 'sanctum')
            ->postJson('/api/attendance/time-in', $this->punchPayload($employee))
            ->assertCreated()
            ->assertJsonPath('data.type', 'time_in');

        Queue::assertPushed(VerifyAttendancePhotoJob::class);

        $photoId = AttendancePhoto::query()->firstOrFail()->id;

        (new VerifyAttendancePhotoJob($photoId))->handle(
            app(AttendanceService::class),
            app(FraudDetectionService::class),
            app(FaceVerificationService::class),
        );

        $this->assertDatabaseHas('fraud_flags', ['type' => 'face_mismatch']);
        $this->assertDatabaseHas('attendance', ['type' => 'time_in']);
    }

    #[Test]
    public function sync_face_mismatch_still_rejects_time_in(): void
    {
        Storage::fake('public');
        config(['dtr.attendance.async_face_verification' => false]);
        config(['dtr.face_verification.force_mismatch' => true]);

        $employee = $this->makeEmployee();

        $this->actingAs($employee->user, 'sanctum')
            ->postJson('/api/attendance/time-in', $this->punchPayload($employee))
            ->assertUnprocessable()
            ->assertJsonPath('code', 'face_verification_failed');

        $this->assertDatabaseCount('attendance', 0);
        $this->assertDatabaseCount('attendance_photos', 0);
    }

    #[Test]
    public function fraud_flag_created_dispatches_notify_job(): void
    {
        Queue::fake();

        $employee = Employee::factory()->create();
        $attendance = \App\Models\Attendance::factory()->create(['employee_id' => $employee->id]);
        $flag = \App\Models\FraudFlag::create([
            'attendance_id' => $attendance->id,
            'type' => 'face_mismatch',
            'severity' => 'high',
            'details' => [],
        ]);

        app(\App\Services\NotificationService::class)->fraudFlagCreated($flag);

        Queue::assertPushed(NotifyFraudFlagJob::class, function (NotifyFraudFlagJob $job) use ($flag) {
            return $job->fraudFlagId === $flag->id;
        });
    }
}
