<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\ReviewHomeLocationRequest;
use App\Http\Resources\HomeLocationResource;
use App\Models\Employee;
use App\Models\HomeLocation;
use App\Services\AuditService;
use App\Services\HomeLocationService;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use InvalidArgumentException;

class HomeLocationController extends Controller
{
    public function __construct(
        private readonly HomeLocationService $homeLocationService,
        private readonly AuditService $auditService,
        private readonly NotificationService $notificationService,
    ) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        $homes = HomeLocation::query()
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->input('status')))
            ->with(['employees.user', 'creator'])
            ->latest()
            ->paginate(min($request->integer('per_page', 20), 100));

        $homes->getCollection()->transform(
            fn (HomeLocation $home) => $this->homeLocationService->ensureAddressParts($home)
        );

        return HomeLocationResource::collection($homes);
    }

    public function review(ReviewHomeLocationRequest $request, HomeLocation $homeLocation): JsonResponse
    {
        $action = $request->input('action');
        $oldStatus = $homeLocation->status;

        try {
            $home = match ($action) {
                'approve' => $this->homeLocationService->approve(
                    $homeLocation,
                    $request->user(),
                    $request->input('radius_meters'),
                    $request->input('review_note'),
                ),
                'reject' => $this->homeLocationService->reject(
                    $homeLocation,
                    $request->user(),
                    $request->input('review_note'),
                ),
                'link' => $this->homeLocationService->linkEmployeeToExisting(
                    Employee::findOrFail($request->integer('employee_id')),
                    HomeLocation::findOrFail($request->integer('link_home_location_id')),
                    $request->user(),
                    $homeLocation,
                ),
            };
        } catch (InvalidArgumentException $e) {
            return response()->json([
                'message' => $e->getMessage(),
                'code' => 'home_location_review_invalid',
            ], 422);
        }

        $this->auditService->record(
            $request->user(),
            'home_location.'.$action,
            $home,
            ['status' => $oldStatus],
            ['status' => $home->status, 'action' => $action],
        );

        $notifyEmployees = $home->employees()->with('user')->get();
        if ($action === 'link') {
            $linked = Employee::with('user')->find($request->integer('employee_id'));
            if ($linked) {
                $notifyEmployees = collect([$linked]);
            }
        }

        foreach ($notifyEmployees as $employee) {
            $this->notificationService->homeLocationReviewed($home, $employee, $action);
        }

        return response()->json([
            'message' => 'Home location '.$action.'d.',
            'data' => new HomeLocationResource($home->load(['employees.user'])),
        ]);
    }
}
