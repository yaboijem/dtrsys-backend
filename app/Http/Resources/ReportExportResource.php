<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ReportExportResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'type' => $this->type,
            'date_from' => $this->date_from->toDateString(),
            'date_to' => $this->date_to->toDateString(),
            'filters' => $this->filters,
            'status' => $this->status,
            'row_count' => $this->row_count,
            'file_path' => $this->file_path,
            'error_message' => $this->error_message,
            'completed_at' => $this->completed_at?->toISOString(),
            'requested_by' => $this->whenLoaded('requester', fn () => [
                'id' => $this->requester->id,
                'employee_id' => $this->requester->employee_id,
                'name' => $this->requester->name,
            ]),
            'created_at' => $this->created_at?->toISOString(),
        ];
    }
}
