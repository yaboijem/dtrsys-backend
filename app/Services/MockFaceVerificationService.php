<?php

namespace App\Services;

use App\Models\Employee;

class MockFaceVerificationService implements FaceVerificationService
{
    public function verify(Employee $employee, ?string $photoPath): FaceVerificationResult
    {
        $forceMismatch = (bool) config('dtr.face_verification.force_mismatch', false);
        $forceNoFace = (bool) config('dtr.face_verification.force_no_face', false);

        return new FaceVerificationResult(
            matched: ! $forceMismatch,
            confidence: $forceMismatch ? 0.21 : 0.96,
            livenessPassed: true,
            faceDetected: ! $forceNoFace,
            raw: [
                'provider' => 'mock',
                'photo_path' => $photoPath,
                'reference_photo_path' => $employee->reference_photo_path,
            ],
        );
    }
}
