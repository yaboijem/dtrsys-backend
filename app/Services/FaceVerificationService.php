<?php

namespace App\Services;

use App\Models\Employee;

interface FaceVerificationService
{
    public function verify(Employee $employee, ?string $photoPath): FaceVerificationResult;
}
