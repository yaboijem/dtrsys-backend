<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\AttendanceAdminResource;
use App\Models\Attendance;
use App\Models\User;
use App\Services\PhotoStorage;
use App\Support\ScopesByRole;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\URL;
use Symfony\Component\HttpFoundation\Response;

class AttendanceAdminController extends Controller
{
    use ScopesByRole;

    public function index(Request $request): AnonymousResourceCollection
    {
        $query = Attendance::query()
            ->with(['employee.user', 'employee.department', 'employee.position', 'branch', 'device', 'photo', 'gpsLocation', 'fraudFlags'])
            ->when($request->filled('date'), fn ($q) => $q->whereDate('timestamp', $request->input('date')))
            ->when($request->filled('date_from'), fn ($q) => $q->whereDate('timestamp', '>=', $request->input('date_from')))
            ->when($request->filled('date_to'), fn ($q) => $q->whereDate('timestamp', '<=', $request->input('date_to')))
            ->when($request->filled('branch_id'), fn ($q) => $q->where('branch_id', $request->integer('branch_id')))
            ->when($request->filled('department_id'), fn ($q) => $q->whereHas('employee', fn ($q) => $q->where('department_id', $request->integer('department_id'))))
            ->when($request->filled('employee_id'), fn ($q) => $q->where('employee_id', $request->integer('employee_id')))
            ->when($request->filled('type'), fn ($q) => $q->where('type', $request->input('type')))
            ->when($request->filled('is_late'), fn ($q) => $q->where('is_late', $request->boolean('is_late')))
            ->when($request->filled('is_early_timeout'), fn ($q) => $q->where('is_early_timeout', $request->boolean('is_early_timeout')))
            ->when($request->filled('source'), fn ($q) => $q->where('source', $request->input('source')))
            ->when($request->boolean('has_open_flags'), fn ($q) => $q->whereHas('fraudFlags', fn ($q) => $q->where('status', 'open')));

        $this->applyRoleScope($query, $request->user(), 'branch_id');

        $records = $query->latest('timestamp')
            ->paginate($this->perPage($request));

        return AttendanceAdminResource::collection($records);
    }

    public function photo(Request $request, Attendance $attendance): Response
    {
        if (! $this->canView($request->user(), $attendance)) {
            abort(403, 'You are not allowed to view this attendance record.');
        }

        $photo = $attendance->loadMissing('photo')->photo;
        $storage = app(PhotoStorage::class);

        if (! $photo || ! $storage->exists($photo->path)) {
            abort(404, 'No photo found for this attendance record.');
        }

        return $storage->response($photo->path, 'selfie_'.$attendance->id.'.jpg');
    }

    public function photoUrl(Request $request, Attendance $attendance): JsonResponse
    {
        if (! $this->canView($request->user(), $attendance)) {
            abort(403, 'You are not allowed to view this attendance record.');
        }

        $expiresAt = now()->addMinutes(5);
        $absolute = URL::temporarySignedRoute('attendance.photo', $expiresAt, ['attendance' => $attendance->id]);
        $parts = parse_url($absolute);
        $relative = ($parts['path'] ?? '').(isset($parts['query']) ? '?'.$parts['query'] : '');

        return response()->json([
            'url' => $relative,
            'expires_at' => $expiresAt->toISOString(),
        ]);
    }

    public function signedPhoto(Attendance $attendance): Response
    {
        $photo = $attendance->loadMissing('photo')->photo;
        $storage = app(PhotoStorage::class);

        if (! $photo || ! $storage->exists($photo->path)) {
            abort(404, 'No photo found for this attendance record.');
        }

        return $storage->response($photo->path, 'selfie_'.$attendance->id.'.jpg', 300);
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
            return (int) $attendance->employee?->department_id === (int) $user->employee?->department_id;
        }

        return false;
    }
}
