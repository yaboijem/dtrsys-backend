<?php

namespace App\Services;

final readonly class FaceVerificationResult
{
    public function __construct(
        public bool $matched,
        public float $confidence,
        public bool $livenessPassed,
        public array $raw = [],
    ) {}

    public function toArray(): array
    {
        return [
            'matched' => $this->matched,
            'confidence' => $this->confidence,
            'liveness_passed' => $this->livenessPassed,
            'raw' => $this->raw,
        ];
    }
}
