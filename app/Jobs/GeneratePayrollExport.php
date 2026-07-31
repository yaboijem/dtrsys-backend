<?php

namespace App\Jobs;

use App\Models\PayrollExport;
use App\Services\PayrollExportService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class GeneratePayrollExport implements ShouldQueue
{
    use Queueable;

    public function __construct(
        public readonly PayrollExport $payrollExport,
    ) {}

    public function handle(PayrollExportService $service): void
    {
        $service->generate($this->payrollExport);
    }
}
