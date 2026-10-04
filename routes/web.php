<?php

use Illuminate\Support\Facades\Route;

$servePortal = function () {
    $path = public_path('index.html');

    abort_unless(is_file($path), 503, 'Portal has not been deployed. Run: node scripts/deploy-portal.mjs');

    return response()->file($path, [
        'Content-Type' => 'text/html; charset=UTF-8',
        'Cache-Control' => 'no-cache',
    ]);
};

// Employee PWA SPA — static files under public/ are served by the web server first.
Route::get('/{any?}', $servePortal)->where('any', '.*');
