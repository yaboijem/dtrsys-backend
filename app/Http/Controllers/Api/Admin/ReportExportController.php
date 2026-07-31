<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreReportRequest;
use App\Http\Resources\ReportExportResource;
use App\Jobs\GenerateReportExport;
use App\Models\ReportExport;
use App\Services\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ReportExportController extends Controller
{
    public function __construct(
        private readonly AuditService $auditService,
    ) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        $exports = ReportExport::query()
            ->with('requester')
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->input('status')))
            ->when($request->filled('type'), fn ($q) => $q->where('type', $request->input('type')))
            ->when(! $this->seesAllReports($request->user()), fn ($q) => $q->where('requested_by', $request->user()->id))
            ->latest()
            ->paginate(min($request->integer('per_page', 20), 100));

        return ReportExportResource::collection($exports);
    }

    public function store(StoreReportRequest $request): JsonResponse
    {
        $export = ReportExport::create([
            'requested_by' => $request->user()->id,
            'type' => $request->input('type'),
            'date_from' => $request->input('date_from'),
            'date_to' => $request->input('date_to'),
            'filters' => $request->input('filters'),
            'status' => 'pending',
        ]);

        GenerateReportExport::dispatch($export);

        $this->auditService->created($request->user(), 'report_export.created', $export);

        return (new ReportExportResource($export->refresh()))
            ->response()
            ->setStatusCode(202);
    }

    public function show(Request $request, ReportExport $reportExport): ReportExportResource|JsonResponse
    {
        if (! $this->canView($request->user(), $reportExport)) {
            return response()->json([
                'message' => 'You are not allowed to view this report.',
                'code' => 'not_authorized',
            ], 403);
        }

        return new ReportExportResource($reportExport->load('requester'));
    }

    public function download(Request $request, ReportExport $reportExport): JsonResponse|StreamedResponse
    {
        if (! $this->canView($request->user(), $reportExport)) {
            return response()->json([
                'message' => 'You are not allowed to view this report.',
                'code' => 'not_authorized',
            ], 403);
        }

        if ($reportExport->status !== 'ready' || ! $reportExport->file_path) {
            return response()->json([
                'message' => 'Report is not ready yet.',
                'code' => 'export_not_ready',
            ], 409);
        }

        $filename = 'report_'.$reportExport->type.'_'.$reportExport->date_from->toDateString().'_'.$reportExport->date_to->toDateString().'.csv';

        return Storage::disk(config('dtr.payroll.export_disk'))->download($reportExport->file_path, $filename);
    }

    private function seesAllReports($user): bool
    {
        return $user->hasAnyRole(['Super Admin', 'HR', 'Payroll Officer']);
    }

    private function canView($user, ReportExport $reportExport): bool
    {
        return $this->seesAllReports($user) || $reportExport->requested_by === $user->id;
    }
}
