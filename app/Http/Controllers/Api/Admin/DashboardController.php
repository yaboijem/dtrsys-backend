<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Attendance;
use App\Models\DeviceChangeRequest;
use App\Models\Employee;
use App\Models\FraudFlag;
use App\Support\ScopesByRole;
use Illuminate\Http\Request;

class DashboardController extends Controller
{
    use ScopesByRole;

    public function summary(Request $request): array
    {
        $user = $request->user();
        $today = now()->toDateString();

        $timeIns = Attendance::query()->where('type', 'time_in')->whereDate('timestamp', $today);
        $this->applyRoleScope($timeIns, $user, 'branch_id');

        $lateIns = (clone $timeIns)->where('is_late', true);

        $employees = Employee::query()->whereHas('user', fn ($q) => $q->where('is_active', true));

        if ($user->hasRole('Branch Manager')) {
            $employees->where('branch_id', $user->employee?->branch_id);
        } elseif ($user->hasRole('Department Head')) {
            $employees->where('department', $user->employee?->department);
        }

        $absent = (clone $employees)->whereDoesntHave('attendanceRecords', fn ($q) => $q->where('type', 'time_in')->whereDate('timestamp', $today))->count();

        $openFlags = FraudFlag::query()->where('status', 'open');
        $this->applyRoleScope($openFlags, $user, 'attendance.branch_id');

        $pendingDeviceRequests = DeviceChangeRequest::query()->where('status', 'pending');
        $this->applyRoleScope($pendingDeviceRequests, $user, 'employee.branch_id');

        return [
            'date' => $today,
            'time_ins_today' => $timeIns->count(),
            'late_ins_today' => $lateIns->count(),
            'absent_today' => $absent,
            'open_fraud_flags' => $openFlags->count(),
            'pending_device_change_requests' => $pendingDeviceRequests->count(),
        ];
    }
}
