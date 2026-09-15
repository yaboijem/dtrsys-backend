<?php

namespace App\Exceptions;

use RuntimeException;

class HomeLocationRequiredException extends RuntimeException
{
    public function __construct(
        string $message,
        public readonly string $errorCode = 'home_location_required',
    ) {
        parent::__construct($message);
    }
}
