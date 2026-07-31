<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\StorePayrollExportRequest;
use App\Http\Resources\PayrollExportResource;
use App\Jobs\GeneratePayrollExport;
use App\Models\PayrollExport;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

class PayrollExportController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $exports = PayrollExport::query()
            ->with('requester')
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->input('status')))
            ->latest()
            ->paginate(min($request->integer('per_page', 20), 100));

        return PayrollExportResource::collection($exports);
    }

    public function store(StorePayrollExportRequest $request): JsonResponse
    {
        $export = PayrollExport::create([
            'requested_by' => $request->user()->id,
            'date_from' => $request->input('date_from'),
            'date_to' => $request->input('date_to'),
            'filters' => $request->input('filters'),
            'status' => 'pending',
        ]);

        GeneratePayrollExport::dispatch($export);

        return (new PayrollExportResource($export->refresh()))
            ->response()
            ->setStatusCode(202);
    }

    public function show(PayrollExport $payrollExport): PayrollExportResource
    {
        return new PayrollExportResource($payrollExport->load('requester'));
    }

    public function download(PayrollExport $payrollExport): JsonResponse|StreamedResponse
    {
        if ($payrollExport->status !== 'ready' || ! $payrollExport->file_path) {
            return response()->json([
                'message' => 'Export is not ready yet.',
                'code' => 'export_not_ready',
            ], 409);
        }

        $filename = 'payroll_'.$payrollExport->date_from->toDateString().'_'.$payrollExport->date_to->toDateString().'.csv';

        return Storage::disk(config('dtr.payroll.export_disk'))->download($payrollExport->file_path, $filename);
    }
}
