<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreHomeLocationRequest;
use App\Http\Resources\HomeLocationResource;
use App\Models\HomeLocation;
use App\Services\AuditService;
use App\Services\HomeLocationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use InvalidArgumentException;

class HomeLocationController extends Controller
{
    public function __construct(
        private readonly HomeLocationService $homeLocationService,
        private readonly AuditService $auditService,
    ) {}

    public function show(Request $request): JsonResponse
    {
        $employee = $request->user()->employee;

        if (! $employee) {
            return response()->json(['message' => 'No employee profile.', 'code' => 'forbidden'], 403);
        }

        $primary = $employee->primaryHomeLocation();
        $pending = $employee->homeLocations()
            ->where('home_locations.status', 'pending')
            ->latest('home_locations.id')
            ->first();

        if ($primary) {
            $primary = $this->homeLocationService->ensureAddressParts($primary);
        }
        if ($pending) {
            $pending = $this->homeLocationService->ensureAddressParts($pending);
        }

        return response()->json([
            'data' => [
                'work_arrangement' => $employee->work_arrangement,
                'status' => $employee->homeLocationStatus(),
                'primary' => $primary ? new HomeLocationResource($primary) : null,
                'pending' => $pending ? new HomeLocationResource($pending) : null,
            ],
        ]);
    }

    public function store(StoreHomeLocationRequest $request): JsonResponse
    {
        $employee = $request->user()->employee;

        if (! $employee) {
            return response()->json(['message' => 'No employee profile.', 'code' => 'forbidden'], 403);
        }

        try {
            $home = $this->homeLocationService->submit($employee, $request->user(), $request->validated());
        } catch (InvalidArgumentException $e) {
            return response()->json([
                'message' => $e->getMessage(),
                'code' => 'home_location_not_allowed',
            ], 422);
        }

        $this->auditService->record(
            $request->user(),
            'home_location.submitted',
            $home,
            null,
            ['latitude' => $home->latitude, 'longitude' => $home->longitude],
        );

        return response()->json([
            'message' => 'Home location submitted for approval.',
            'data' => new HomeLocationResource($home),
        ], 201);
    }
}
