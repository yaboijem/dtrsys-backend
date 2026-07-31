<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\ReviewDataRequestRequest;
use App\Http\Resources\DataRequestResource;
use App\Models\DataRequest;
use App\Services\AuditService;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class DataRequestAdminController extends Controller
{
    public function __construct(
        private readonly AuditService $auditService,
    ) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        $dataRequests = DataRequest::query()
            ->with('user', 'processor')
            ->when($request->filled('status'), fn ($query) => $query->where('status', $request->input('status')))
            ->when($request->filled('type'), fn ($query) => $query->where('type', $request->input('type')))
            ->latest()
            ->paginate(min($request->integer('per_page', 20), 100));

        return DataRequestResource::collection($dataRequests);
    }

    public function review(ReviewDataRequestRequest $request, DataRequest $dataRequest): DataRequestResource
    {
        $dataRequest->update([
            'status' => $request->input('status'),
            'notes' => $request->input('notes'),
            'processed_by' => $request->user()->id,
            'processed_at' => now(),
        ]);

        $this->auditService->changes(
            $request->user(),
            'data_request.reviewed',
            $dataRequest,
        );

        return new DataRequestResource($dataRequest->load('processor'));
    }
}
