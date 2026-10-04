<?php

namespace App\Exceptions;

use RuntimeException;

class AttendanceConflictException extends RuntimeException
{
    public function __construct(
        string $message,
        public readonly ?array $session = null,
    ) {
        parent::__construct($message);
    }
}
