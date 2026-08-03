<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\AttendanceAdminResource;
use App\Models\Attendance;
use App\Models\User;
use App\Support\ScopesByRole;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

class AttendanceAdminController extends Controller
{
    use ScopesByRole;

    public function index(Request $request): AnonymousResourceCollection
    {
        $query = Attendance::query()
            ->with(['employee.user', 'branch', 'device', 'photo', 'gpsLocation', 'fraudFlags'])
            ->when($request->filled('date'), fn ($q) => $q->whereDate('timestamp', $request->input('date')))
            ->when($request->filled('date_from'), fn ($q) => $q->whereDate('timestamp', '>=', $request->input('date_from')))
            ->when($request->filled('date_to'), fn ($q) => $q->whereDate('timestamp', '<=', $request->input('date_to')))
            ->when($request->filled('branch_id'), fn ($q) => $q->where('branch_id', $request->integer('branch_id')))
            ->when($request->filled('department'), fn ($q) => $q->whereHas('employee', fn ($q) => $q->where('department', $request->input('department'))))
            ->when($request->filled('employee_id'), fn ($q) => $q->where('employee_id', $request->integer('employee_id')))
            ->when($request->filled('type'), fn ($q) => $q->where('type', $request->input('type')))
            ->when($request->filled('is_late'), fn ($q) => $q->where('is_late', $request->boolean('is_late')))
            ->when($request->filled('is_early_timeout'), fn ($q) => $q->where('is_early_timeout', $request->boolean('is_early_timeout')))
            ->when($request->filled('source'), fn ($q) => $q->where('source', $request->input('source')))
            ->when($request->boolean('has_open_flags'), fn ($q) => $q->whereHas('fraudFlags', fn ($q) => $q->where('status', 'open')));

        $this->applyRoleScope($query, $request->user(), 'branch_id');

        $records = $query->latest('timestamp')
            ->paginate(min($request->integer('per_page', 20), 100));

        return AttendanceAdminResource::collection($records);
    }

    public function photo(Request $request, Attendance $attendance): StreamedResponse
    {
        if (! $this->canView($request->user(), $attendance)) {
            abort(403, 'You are not allowed to view this attendance record.');
        }

        $photo = $attendance->loadMissing('photo')->photo;

        if (! $photo || ! Storage::disk(config('dtr.attendance.photo_disk'))->exists($photo->path)) {
            abort(404, 'No photo found for this attendance record.');
        }

        return Storage::disk(config('dtr.attendance.photo_disk'))
            ->response($photo->path, 'selfie_'.$attendance->id.'.jpg');
    }

    private function canView(User $user, Attendance $attendance): bool
    {
        if ($user->hasAnyRole(['Super Admin', 'HR'])) {
            return true;
        }

        $attendance->loadMissing('employee');

        if ($user->hasRole('Branch Manager')) {
            return (int) $attendance->branch_id === (int) $user->employee?->branch_id;
        }

        if ($user->hasRole('Department Head')) {
            return $attendance->employee?->department === $user->employee?->department;
        }

        return false;
    }
}
