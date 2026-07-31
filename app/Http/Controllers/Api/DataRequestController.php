<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreDataRequestRequest;
use App\Http\Resources\DataRequestResource;
use App\Models\DataRequest;
use App\Services\AuditService;
use App\Services\DataAccessService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class DataRequestController extends Controller
{
    public function __construct(
        private readonly AuditService $auditService,
        private readonly DataAccessService $dataAccessService,
    ) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        return DataRequestResource::collection(
            $request->user()->dataRequests()->latest()->paginate(min($request->integer('per_page', 20), 100)),
        );
    }

    public function store(StoreDataRequestRequest $request): JsonResponse
    {
        $type = $request->input('type');
        $status = $type === 'access' ? 'completed' : 'pending';

        $dataRequest = DataRequest::create([
            'user_id' => $request->user()->id,
            'type' => $type,
            'status' => $status,
            'processed_at' => $status === 'completed' ? now() : null,
        ]);

        $this->auditService->created($request->user(), 'data_request.created', $dataRequest);

        $payload = null;
        if ($type === 'access') {
            $payload = $this->dataAccessService->payloadFor($request->user());
        }

        $resource = new DataRequestResource($dataRequest->load('processor'));

        return response()->json([
            'data' => $resource->resolve($request),
            'export' => $payload,
        ], $status === 'completed' ? 200 : 201);
    }
}
