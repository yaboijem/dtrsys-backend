<?php

namespace App\Exceptions;

use RuntimeException;

class DeviceBlockedException extends RuntimeException
{
    public function __construct(
        string $message,
        public readonly bool $hasPendingRequest = false,
    ) {
        parent::__construct($message);
    }
}
