<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\AppSettingsResource;
use App\Models\AppSetting;

class SettingsController extends Controller
{
    public function show(): AppSettingsResource
    {
        return new AppSettingsResource(AppSetting::current());
    }
}
