<?php

use App\Providers\AppServiceProvider;
use App\Providers\TelescopeServiceProvider;

$providers = [
    AppServiceProvider::class,
];

// Telescope is require-dev — omit in production images built with composer --no-dev.
if (class_exists(Laravel\Telescope\TelescopeApplicationServiceProvider::class)) {
    $providers[] = TelescopeServiceProvider::class;
}

return $providers;
