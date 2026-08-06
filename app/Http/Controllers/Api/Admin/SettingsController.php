<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\UpdateAppSettingsRequest;
use App\Http\Resources\AppSettingsResource;
use App\Models\AppSetting;
use App\Services\AuditService;

class SettingsController extends Controller
{
    public function __construct(
        private readonly AuditService $auditService,
    ) {}

    public function show(): AppSettingsResource
    {
        return new AppSettingsResource(AppSetting::current());
    }

    public function update(UpdateAppSettingsRequest $request): AppSettingsResource
    {
        $settings = AppSetting::current();
        $before = $this->auditService->valuesOf($settings);

        $settings->update($request->validated());

        $this->auditService->changes($request->user(), 'settings.updated', $settings, $before);

        return new AppSettingsResource($settings);
    }
}
