<?php

namespace App\Jobs;

use App\Models\ReportExport;
use App\Services\NotificationService;
use App\Services\ReportExportService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class GenerateReportExport implements ShouldQueue
{
    use Queueable;

    public function __construct(
        public readonly ReportExport $reportExport,
    ) {}

    public function handle(ReportExportService $service, NotificationService $notificationService): void
    {
        $service->generate($this->reportExport);

        $notificationService->reportReady($this->reportExport);
    }
}
