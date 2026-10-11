<?php

namespace App\Exceptions;

use RuntimeException;

class GpsAccuracyTooPoorException extends RuntimeException
{
    public function __construct(
        string $message,
        public readonly float $accuracyMeters,
        public readonly float $ceilingMeters,
    ) {
        parent::__construct($message);
    }
}
