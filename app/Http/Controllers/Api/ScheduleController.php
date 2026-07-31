<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\ScheduleResource;
use App\Models\Schedule;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class ScheduleController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $from = $request->date('from', 'Y-m-d') ?? now()->startOfWeek()->toDateString();
        $to = $request->date('to', 'Y-m-d') ?? now()->endOfWeek()->toDateString();

        $schedules = Schedule::with('shift')
            ->where('employee_id', $request->user()->employee->id)
            ->whereDate('date', '>=', $from)
            ->whereDate('date', '<=', $to)
            ->orderBy('date')
            ->get();

        return ScheduleResource::collection($schedules);
    }

    public function today(Request $request): ScheduleResource|JsonResponse
    {
        $schedule = Schedule::with('shift')
            ->where('employee_id', $request->user()->employee->id)
            ->whereDate('date', now()->toDateString())
            ->first();

        if (! $schedule) {
            return response()->json([
                'message' => 'No schedule assigned for today.',
                'code' => 'no_schedule',
            ], 404);
        }

        return new ScheduleResource($schedule);
    }
}
