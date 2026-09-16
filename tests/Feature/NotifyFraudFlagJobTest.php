<?php

namespace Tests\Feature;

use App\Jobs\NotifyFraudFlagJob;
use App\Models\Attendance;
use App\Models\Employee;
use App\Models\FraudFlag;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class NotifyFraudFlagJobTest extends TestCase
{
    use RefreshDatabase;

    #[Test]
    public function fraud_flag_created_dispatches_notify_job(): void
    {
        Queue::fake();

        $employee = Employee::factory()->create();
        $attendance = Attendance::factory()->create(['employee_id' => $employee->id]);
        $flag = FraudFlag::create([
            'attendance_id' => $attendance->id,
            'type' => 'out_of_radius',
            'severity' => 'medium',
            'details' => [],
        ]);

        app(\App\Services\NotificationService::class)->fraudFlagCreated($flag);

        Queue::assertPushed(NotifyFraudFlagJob::class, function (NotifyFraudFlagJob $job) use ($flag) {
            return $job->fraudFlagId === $flag->id;
        });
    }

    #[Test]
    public function notify_job_runs_after_db_commit(): void
    {
        $this->assertTrue((new NotifyFraudFlagJob(1))->afterCommit);
    }
}
