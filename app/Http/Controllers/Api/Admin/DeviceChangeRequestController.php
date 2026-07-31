<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\ReviewDeviceChangeRequest;
use App\Http\Resources\DeviceChangeRequestResource;
use App\Models\DeviceChangeRequest;
use App\Services\NotificationService;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class DeviceChangeRequestController extends Controller
{
    public function __construct(
        private readonly NotificationService $notificationService,
    ) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        $requests = DeviceChangeRequest::query()
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->input('status')))
            ->with(['employee.user', 'employee.branch'])
            ->latest()
            ->paginate(20);

        return DeviceChangeRequestResource::collection($requests);
    }

    public function review(ReviewDeviceChangeRequest $request, DeviceChangeRequest $deviceChangeRequest): DeviceChangeRequestResource
    {
        $deviceChangeRequest->update([
            'status' => $request->input('status'),
            'reviewed_by' => $request->user()->id,
            'reviewed_at' => now(),
            'review_notes' => $request->input('review_notes'),
        ]);

        $this->notificationService->deviceChangeRequestReviewed($deviceChangeRequest);

        return new DeviceChangeRequestResource($deviceChangeRequest);
    }
}
