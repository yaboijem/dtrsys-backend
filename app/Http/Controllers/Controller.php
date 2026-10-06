<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;

abstract class Controller
{
    protected function perPage(Request $request): int
    {
        return min(max($request->integer('per_page', 20), 1), 500);
    }
}
