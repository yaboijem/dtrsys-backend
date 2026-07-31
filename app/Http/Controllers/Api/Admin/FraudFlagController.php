<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\ReviewFraudFlagRequest;
use App\Http\Resources\FraudFlagResource;
use App\Models\FraudFlag;
use App\Models\User;
use App\Services\AuditService;
use App\Support\ScopesByRole;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class FraudFlagController extends Controller
{
    use ScopesByRole;

    public function __construct(
        private readonly AuditService $auditService,
    ) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        $query = FraudFlag::query()
            ->with(['attendance.employee.user', 'attendance.branch', 'attendance.photo', 'attendance.gpsLocation', 'reviewer'])
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->input('status')))
            ->when($request->filled('type'), fn ($q) => $q->where('type', $request->input('type')))
            ->when($request->filled('severity'), fn ($q) => $q->where('severity', $request->input('severity')))
            ->when($request->filled('branch_id'), fn ($q) => $q->whereHas('attendance', fn ($q) => $q->where('branch_id', $request->integer('branch_id'))));

        $this->applyRoleScope($query, $request->user(), 'attendance.branch_id');

        $flags = $query->latest()->paginate(min($request->integer('per_page', 20), 100));

        return FraudFlagResource::collection($flags);
    }

    public function review(ReviewFraudFlagRequest $request, FraudFlag $fraudFlag): FraudFlagResource|JsonResponse
    {
        if (! $this->canAccess($request->user(), $fraudFlag)) {
            return response()->json([
                'message' => 'You are not allowed to review this fraud flag.',
                'code' => 'not_authorized',
            ], 403);
        }

        $oldStatus = $fraudFlag->status;

        $fraudFlag->update([
            'status' => $request->input('status'),
            'reviewed_by' => $request->user()->id,
            'reviewed_at' => now(),
            'notes' => $request->input('notes'),
        ]);

        $this->auditService->record(
            $request->user(),
            'fraud_flag.reviewed',
            $fraudFlag,
            ['status' => $oldStatus],
            ['status' => $fraudFlag->status, 'notes' => $fraudFlag->notes],
        );

        return new FraudFlagResource($fraudFlag->load([
            'attendance.employee.user',
            'attendance.branch',
            'attendance.photo',
            'attendance.gpsLocation',
            'reviewer',
        ]));
    }

    private function canAccess(User $user, FraudFlag $fraudFlag): bool
    {
        if ($user->hasAnyRole(['Super Admin', 'HR'])) {
            return true;
        }

        $attendance = $fraudFlag->loadMissing('attendance.employee')->attendance;

        if ($user->hasRole('Branch Manager')) {
            return (int) $attendance->branch_id === (int) $user->employee?->branch_id;
        }

        if ($user->hasRole('Department Head')) {
            return $attendance->employee?->department === $user->employee?->department;
        }

        return false;
    }
}
