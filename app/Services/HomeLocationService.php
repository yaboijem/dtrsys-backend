<?php

namespace App\Services;

use App\Models\Employee;
use App\Models\EmployeeHomeLocation;
use App\Models\HomeLocation;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

class HomeLocationService
{
    public function submit(Employee $employee, User $actor, array $data): HomeLocation
    {
        if (! $employee->isWfh()) {
            throw new InvalidArgumentException('Only WFH employees can submit a home location.');
        }

        return DB::transaction(function () use ($employee, $actor, $data) {
            $this->rejectSolePendingFor($employee);

            $home = HomeLocation::create([
                'label' => $data['label'] ?? ($employee->full_name.' Home'),
                'latitude' => $data['latitude'],
                'longitude' => $data['longitude'],
                'radius_meters' => (int) config('dtr.gps.home_radius_meters', 150),
                'address_text' => $data['address_text'] ?? null,
                'created_by' => $actor->id,
                'status' => 'pending',
            ]);

            EmployeeHomeLocation::create([
                'employee_id' => $employee->id,
                'home_location_id' => $home->id,
                'is_primary' => false,
                'assigned_at' => now(),
            ]);

            return $home;
        });
    }

    public function approve(HomeLocation $home, User $reviewer, ?int $radiusMeters = null, ?string $note = null): HomeLocation
    {
        if ($home->status !== 'pending') {
            throw new InvalidArgumentException('Only pending home locations can be approved.');
        }

        return DB::transaction(function () use ($home, $reviewer, $radiusMeters, $note) {
            $home->update([
                'status' => 'approved',
                'reviewed_by' => $reviewer->id,
                'reviewed_at' => now(),
                'review_note' => $note,
                'radius_meters' => $radiusMeters ?? $home->radius_meters,
            ]);

            $employeeIds = EmployeeHomeLocation::where('home_location_id', $home->id)
                ->pluck('employee_id');

            foreach ($employeeIds as $employeeId) {
                $employee = Employee::find($employeeId);
                if ($employee) {
                    $this->setPrimary($employee, $home);
                }
            }

            return $home->fresh();
        });
    }

    public function reject(HomeLocation $home, User $reviewer, ?string $note = null): HomeLocation
    {
        if ($home->status !== 'pending') {
            throw new InvalidArgumentException('Only pending home locations can be rejected.');
        }

        $home->update([
            'status' => 'rejected',
            'reviewed_by' => $reviewer->id,
            'reviewed_at' => now(),
            'review_note' => $note,
        ]);

        return $home->fresh();
    }

    public function linkEmployeeToExisting(
        Employee $employee,
        HomeLocation $approvedHome,
        User $reviewer,
        ?HomeLocation $pendingToRetire = null,
    ): HomeLocation {
        if ($approvedHome->status !== 'approved') {
            throw new InvalidArgumentException('Link target must be an approved home location.');
        }

        return DB::transaction(function () use ($employee, $approvedHome, $reviewer, $pendingToRetire) {
            if ($pendingToRetire && $pendingToRetire->status === 'pending') {
                $pendingToRetire->update([
                    'status' => 'retired',
                    'reviewed_by' => $reviewer->id,
                    'reviewed_at' => now(),
                    'review_note' => 'Replaced by shared home location #'.$approvedHome->id,
                ]);
            }

            $this->setPrimary($employee, $approvedHome);

            return $approvedHome->fresh();
        });
    }

    public function setPrimary(Employee $employee, HomeLocation $home): void
    {
        EmployeeHomeLocation::where('employee_id', $employee->id)
            ->where('is_primary', true)
            ->update(['is_primary' => false]);

        $assignment = EmployeeHomeLocation::firstOrNew([
            'employee_id' => $employee->id,
            'home_location_id' => $home->id,
        ]);

        $assignment->is_primary = true;
        $assignment->assigned_at = now();
        $assignment->save();
    }

    private function rejectSolePendingFor(Employee $employee): void
    {
        $pendingIds = $employee->homeLocations()
            ->where('home_locations.status', 'pending')
            ->pluck('home_locations.id');

        foreach ($pendingIds as $homeId) {
            $otherEmployees = EmployeeHomeLocation::where('home_location_id', $homeId)
                ->where('employee_id', '!=', $employee->id)
                ->exists();

            if ($otherEmployees) {
                continue;
            }

            HomeLocation::where('id', $homeId)->where('status', 'pending')->update([
                'status' => 'rejected',
                'review_note' => 'Superseded by a new submission.',
                'reviewed_at' => now(),
            ]);
        }
    }
}
