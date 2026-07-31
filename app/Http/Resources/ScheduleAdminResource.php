<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ScheduleAdminResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'date' => $this->date->toDateString(),
            'employee' => $this->whenLoaded('employee', fn () => [
                'id' => $this->employee->id,
                'employee_id' => $this->employee->user?->employee_id,
                'name' => $this->employee->full_name,
                'department' => $this->employee->department,
                'branch_id' => $this->employee->branch_id,
            ]),
            'shift' => $this->whenLoaded('shift', fn () => [
                'id' => $this->shift->id,
                'name' => $this->shift->name,
                'start_time' => $this->shift->start_time,
                'end_time' => $this->shift->end_time,
                'grace_minutes' => $this->shift->grace_minutes,
                'break_start' => $this->shift->break_start,
                'break_end' => $this->shift->break_end,
            ]),
            'created_at' => $this->created_at?->toISOString(),
        ];
    }
}
