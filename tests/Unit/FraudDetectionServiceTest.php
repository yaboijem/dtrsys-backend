<?php

namespace Tests\Unit;

use App\Models\Attendance;
use App\Models\AttendancePhoto;
use App\Models\Employee;
use App\Models\GpsLocation;
use App\Services\FraudDetectionService;
use App\Services\GPSService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class FraudDetectionServiceTest extends TestCase
{
    use RefreshDatabase;

    private function service(): FraudDetectionService
    {
        return new FraudDetectionService(new GPSService);
    }

    #[Test]
    public function it_flags_out_of_radius_punches(): void
    {
        $employee = Employee::factory()->create();
        $attendance = Attendance::factory()->create(['employee_id' => $employee->id]);
        GpsLocation::create([
            'attendance_id' => $attendance->id,
            'employee_id' => $employee->id,
            'latitude' => 14.55,
            'longitude' => 121.02,
            'is_within_radius' => false,
            'distance_from_branch_meters' => 15000,
            'captured_at' => $attendance->timestamp,
        ]);

        $flags = $this->service()->evaluate($attendance->fresh());

        $this->assertCount(1, $flags);
        $this->assertSame('out_of_radius', $flags[0]->type);
    }

    #[Test]
    public function it_flags_face_mismatches(): void
    {
        $employee = Employee::factory()->create();
        $attendance = Attendance::factory()->create(['employee_id' => $employee->id]);
        AttendancePhoto::create([
            'attendance_id' => $attendance->id,
            'path' => 'attendance/photo.jpg',
            'is_verified' => false,
            'verification_result' => ['matched' => false, 'confidence' => 0.21],
            'liveness_status' => 'passed',
            'captured_at' => $attendance->timestamp,
        ]);

        $flags = $this->service()->evaluate($attendance->fresh());

        $this->assertCount(1, $flags);
        $this->assertSame('face_mismatch', $flags[0]->type);
        $this->assertSame('high', $flags[0]->severity);
    }

    #[Test]
    public function it_flags_impossible_location_jumps(): void
    {
        $employee = Employee::factory()->create();
        $previous = Attendance::factory()->create([
            'employee_id' => $employee->id,
            'timestamp' => now()->subMinutes(5),
        ]);
        GpsLocation::create([
            'attendance_id' => $previous->id,
            'employee_id' => $employee->id,
            'latitude' => 14.554729,
            'longitude' => 121.024445,
            'is_within_radius' => true,
            'captured_at' => now()->subMinutes(5),
        ]);

        $current = Attendance::factory()->create([
            'employee_id' => $employee->id,
            'timestamp' => now(),
            'latitude' => 15.554729,
            'longitude' => 122.024445,
        ]);
        GpsLocation::create([
            'attendance_id' => $current->id,
            'employee_id' => $employee->id,
            'latitude' => $current->latitude,
            'longitude' => $current->longitude,
            'is_within_radius' => false,
            'captured_at' => $current->timestamp,
        ]);

        $flags = $this->service()->evaluate($current->fresh());

        $jump = collect($flags)->firstWhere('type', 'impossible_jump');

        $this->assertNotNull($jump);
        $this->assertGreaterThan(1000, $jump->details['estimated_speed_kmh']);
    }

    #[Test]
    public function it_flags_rapid_clock_punches(): void
    {
        $employee = Employee::factory()->create();
        Attendance::factory()->create([
            'employee_id' => $employee->id,
            'type' => 'time_in',
            'timestamp' => now()->subSeconds(30),
        ]);

        $current = Attendance::factory()->create([
            'employee_id' => $employee->id,
            'type' => 'time_in',
            'timestamp' => now(),
        ]);

        $flags = $this->service()->evaluate($current->fresh());

        $this->assertCount(1, $flags);
        $this->assertSame('rapid_clock', $flags[0]->type);
    }

    #[Test]
    public function it_flags_repeated_identical_coordinates(): void
    {
        $employee = Employee::factory()->create();
        $previous = Attendance::factory()->create([
            'employee_id' => $employee->id,
            'timestamp' => now()->subDay(),
            'latitude' => 14.554729,
            'longitude' => 121.024445,
        ]);
        GpsLocation::create([
            'attendance_id' => $previous->id,
            'employee_id' => $employee->id,
            'latitude' => 14.554729,
            'longitude' => 121.024445,
            'is_within_radius' => true,
            'captured_at' => now()->subDay(),
        ]);

        $current = Attendance::factory()->create([
            'employee_id' => $employee->id,
            'timestamp' => now(),
            'latitude' => 14.554729,
            'longitude' => 121.024445,
        ]);
        GpsLocation::create([
            'attendance_id' => $current->id,
            'employee_id' => $employee->id,
            'latitude' => 14.554729,
            'longitude' => 121.024445,
            'is_within_radius' => true,
            'captured_at' => $current->timestamp,
        ]);

        $flags = $this->service()->evaluate($current->fresh());

        $spoof = collect($flags)->firstWhere('type', 'gps_spoof');

        $this->assertNotNull($spoof);
        $this->assertSame('low', $spoof->severity);
    }

    #[Test]
    public function it_does_not_flag_clean_punches(): void
    {
        $employee = Employee::factory()->create();

        $attendance = Attendance::factory()->create(['employee_id' => $employee->id]);

        $flags = $this->service()->evaluate($attendance->fresh());

        $this->assertEmpty($flags);
    }
}
