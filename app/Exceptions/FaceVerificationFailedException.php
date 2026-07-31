<?php

namespace App\Exceptions;

use RuntimeException;

class FaceVerificationFailedException extends RuntimeException
{
    public function __construct(
        string $message,
        public readonly array $details = [],
    ) {
        parent::__construct($message);
    }
}
