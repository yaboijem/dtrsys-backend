<?php

namespace App\Services;

use App\Models\Branch;

class GPSService
{
    public function distanceMeters(float $lat1, float $lng1, float $lat2, float $lng2): float
    {
        $earthRadius = 6371000.0;

        $lat1 = deg2rad($lat1);
        $lng1 = deg2rad($lng1);
        $lat2 = deg2rad($lat2);
        $lng2 = deg2rad($lng2);

        $dLat = $lat2 - $lat1;
        $dLng = $lng2 - $lng1;

        $a = sin($dLat / 2) ** 2 + cos($lat1) * cos($lat2) * sin($dLng / 2) ** 2;

        return $earthRadius * 2 * atan2(sqrt($a), sqrt(1 - $a));
    }

    public function verify(Branch $branch, ?float $latitude, ?float $longitude, ?float $accuracyMeters = null): array
    {
        if ($latitude === null || $longitude === null) {
            return [
                'distance_meters' => null,
                'is_within_radius' => false,
                'accuracy_meters' => $accuracyMeters,
                'reason' => 'No GPS coordinates provided.',
            ];
        }

        $distance = $this->distanceMeters(
            (float) $branch->latitude,
            (float) $branch->longitude,
            $latitude,
            $longitude,
        );

        $effectiveRadius = (float) $branch->radius_meters + ($accuracyMeters ?? 0);

        return [
            'distance_meters' => round($distance, 2),
            'is_within_radius' => $distance <= $effectiveRadius,
            'accuracy_meters' => $accuracyMeters,
            'reason' => null,
        ];
    }

    public function travelSpeedKmh(float $distanceMeters, float $durationMinutes): float
    {
        if ($durationMinutes <= 0) {
            return 0.0;
        }

        return ($distanceMeters / 1000) / ($durationMinutes / 60);
    }
}
