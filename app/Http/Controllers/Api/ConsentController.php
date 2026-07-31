<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\UpdateConsentRequest;
use App\Http\Resources\ConsentResource;
use App\Models\Consent;
use App\Services\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class ConsentController extends Controller
{
    public function __construct(
        private readonly AuditService $auditService,
    ) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        $employee = $request->user()->employee;

        return ConsentResource::collection($employee?->consents ?? collect());
    }

    public function update(UpdateConsentRequest $request): JsonResponse
    {
        $employee = $request->user()->employee;

        if (! $employee) {
            return response()->json([
                'message' => 'No employee record found for this account.',
                'code' => 'no_employee_record',
            ], 404);
        }

        $now = now();
        $granted = $request->boolean('granted');

        $consent = Consent::updateOrCreate(
            ['employee_id' => $employee->id, 'type' => $request->input('type')],
            [
                'granted' => $granted,
                'granted_at' => $granted ? $now : null,
                'revoked_at' => $granted ? null : $now,
            ],
        );

        $this->auditService->changes($request->user(), 'consent.updated', $consent);

        return (new ConsentResource($consent))->response()->setStatusCode(200);
    }
}
