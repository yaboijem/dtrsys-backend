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
    public function __construct(
        private readonly NominatimGeocoder $geocoder,
    ) {}

    public function submit(Employee $employee, User $actor, array $data): HomeLocation
    {
        if (! $employee->requiresHomeLocation()) {
            throw new InvalidArgumentException('Only WFH or hybrid employees can submit a home location.');
        }

        $resolved = $this->resolveAddressParts(
            (float) $data['latitude'],
            (float) $data['longitude'],
            $data['address_text'] ?? null,
            $data['street'] ?? null,
            $data['city'] ?? null,
            $data['province'] ?? null,
        );

        return DB::transaction(function () use ($employee, $actor, $data, $resolved) {
            $this->rejectSolePendingFor($employee);

            $home = HomeLocation::create([
                'label' => $data['label'] ?? ($employee->full_name.' Home'),
                'latitude' => $data['latitude'],
                'longitude' => $data['longitude'],
                'radius_meters' => (int) config('dtr.gps.home_radius_meters', 200),
                'address_text' => $resolved['address_text'],
                'street' => $resolved['street'],
                'city' => $resolved['city'],
                'province' => $resolved['province'],
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

    /**
     * Fill street/city/province when missing (e.g. older pins).
     */
    public function ensureAddressParts(HomeLocation $home): HomeLocation
    {
        if (filled($home->street) || filled($home->city) || filled($home->province) || filled($home->address_text)) {
            if (filled($home->street) || filled($home->city) || filled($home->province)) {
                return $home;
            }
        }

        $resolved = $this->resolveAddressParts(
            (float) $home->latitude,
            (float) $home->longitude,
            $home->address_text,
            $home->street,
            $home->city,
            $home->province,
        );

        if (
            $resolved['street'] === $home->street
            && $resolved['city'] === $home->city
            && $resolved['province'] === $home->province
            && $resolved['address_text'] === $home->address_text
        ) {
            return $home;
        }

        $home->update([
            'address_text' => $resolved['address_text'] ?? $home->address_text,
            'street' => $resolved['street'] ?? $home->street,
            'city' => $resolved['city'] ?? $home->city,
            'province' => $resolved['province'] ?? $home->province,
        ]);

        return $home->fresh() ?? $home;
    }

    /**
     * @return array{address_text: ?string, street: ?string, city: ?string, province: ?string}
     */
    private function resolveAddressParts(
        float $lat,
        float $lng,
        ?string $addressText,
        ?string $street,
        ?string $city,
        ?string $province,
    ): array {
        if (filled($street) && filled($city) && filled($province)) {
            return [
                'address_text' => $addressText ?: collect([$street, $city, $province])->filter()->implode(', '),
                'street' => $street,
                'city' => $city,
                'province' => $province,
            ];
        }

        $geo = $this->geocoder->reverse($lat, $lng);

        return [
            'address_text' => $addressText ?: ($geo['display_name'] ?? null),
            'street' => $street ?: ($geo['street'] ?? null),
            'city' => $city ?: ($geo['city'] ?? null),
            'province' => $province ?: ($geo['province'] ?? null),
        ];
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
