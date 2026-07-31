<?php

namespace Tests\Unit;

use App\Models\Employee;
use App\Services\FaceVerificationResult;
use App\Services\MockFaceVerificationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class FaceVerificationServiceTest extends TestCase
{
    use RefreshDatabase;

    #[Test]
    public function mock_matches_by_default(): void
    {
        $employee = Employee::factory()->create(['reference_photo_path' => 'references/juan.jpg']);

        $result = (new MockFaceVerificationService)->verify($employee, 'attendance/photo.jpg');

        $this->assertInstanceOf(FaceVerificationResult::class, $result);
        $this->assertTrue($result->matched);
        $this->assertTrue($result->livenessPassed);
        $this->assertGreaterThan(0.8, $result->confidence);
        $this->assertSame('mock', $result->raw['provider']);
    }

    #[Test]
    public function mock_can_be_forced_to_mismatch(): void
    {
        config(['dtr.face_verification.force_mismatch' => true]);

        $employee = Employee::factory()->create();

        $result = (new MockFaceVerificationService)->verify($employee, 'attendance/photo.jpg');

        $this->assertFalse($result->matched);
        $this->assertLessThan(0.8, $result->confidence);
    }

    #[Test]
    public function result_serializes_to_array(): void
    {
        $result = new FaceVerificationResult(true, 0.96, true, ['provider' => 'mock']);

        $this->assertSame([
            'matched' => true,
            'confidence' => 0.96,
            'liveness_passed' => true,
            'raw' => ['provider' => 'mock'],
        ], $result->toArray());
    }
}
