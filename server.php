<?php

/**
 * Built-in PHP server router.
 *
 * Resolves the public directory explicitly so the server can be started
 * from any working directory, e.g.:
 *   php -S 0.0.0.0:8000 server.php
 */

$publicPath = __DIR__.'/public';

$uri = urldecode(
    parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?? ''
);

// Emulate Apache's "mod_rewrite": serve existing files directly.
if ($uri !== '/' && file_exists($publicPath.$uri)) {
    return false;
}

require_once $publicPath.'/index.php';
