<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreDeviceChangeRequest;
use App\Http\Resources\DeviceChangeRequestResource;
use App\Models\DeviceChangeRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class DeviceChangeRequestController extends Controller
{
    public function store(StoreDeviceChangeRequest $request): JsonResponse
    {
        $employee = $request->user()->employee;

        $deviceRequest = DeviceChangeRequest::firstOrCreate(
            [
                'employee_id' => $employee->id,
                'new_device_id' => $request->input('new_device_id'),
                'status' => 'pending',
            ],
            [
                'current_device_id' => $request->input('current_device_id') ?? $employee->devices()->where('is_active', true)->value('id'),
                'reason' => $request->input('reason'),
            ],
        );

        return response()->json([
            'message' => 'Device change request submitted.',
            'request' => new DeviceChangeRequestResource($deviceRequest),
        ], 201);
    }

    public function index(Request $request): AnonymousResourceCollection
    {
        $requests = DeviceChangeRequest::where('employee_id', $request->user()->employee->id)
            ->latest()
            ->paginate(20);

        return DeviceChangeRequestResource::collection($requests);
    }
}
