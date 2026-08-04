<?php

namespace App\Services;

use App\Models\Attendance;
use App\Models\FraudFlag;
use App\Models\GpsLocation;

class FraudDetectionService
{
    public function __construct(
        private readonly GPSService $gpsService,
    ) {}

    /**
     * Runs all fraud detection rules against an attendance record.
     *
     * @return array<int, FraudFlag>
     */
    public function evaluate(Attendance $attendance): array
    {
        $flags = [];

        if ($flag = $this->checkOutOfRadius($attendance)) {
            $flags[] = $flag;
        }

        if ($flag = $this->checkFaceMismatch($attendance)) {
            $flags[] = $flag;
        }

        if ($flag = $this->checkNoFace($attendance)) {
            $flags[] = $flag;
        }

        if ($flag = $this->checkImpossibleJump($attendance)) {
            $flags[] = $flag;
        }

        if ($flag = $this->checkRapidClock($attendance)) {
            $flags[] = $flag;
        }

        if ($flag = $this->checkGpsSpoof($attendance)) {
            $flags[] = $flag;
        }

        return $flags;
    }

    private function checkOutOfRadius(Attendance $attendance): ?FraudFlag
    {
        if (! $attendance->gpsLocation || $attendance->gpsLocation->is_within_radius !== false) {
            return null;
        }

        return $this->flag($attendance, 'out_of_radius', 'medium', [
            'distance_meters' => $attendance->gpsLocation->distance_from_branch_meters,
            'accuracy_meters' => $attendance->gpsLocation->accuracy_meters,
        ]);
    }

    private function checkFaceMismatch(Attendance $attendance): ?FraudFlag
    {
        $photo = $attendance->photo;

        if (! $photo || $photo->is_verified || $photo->liveness_status === 'pending') {
            return null;
        }

        return $this->flag($attendance, 'face_mismatch', 'high', [
            'confidence' => data_get($photo->verification_result, 'confidence'),
            'liveness_passed' => data_get($photo->verification_result, 'liveness_passed'),
        ]);
    }

    private function checkNoFace(Attendance $attendance): ?FraudFlag
    {
        $photo = $attendance->photo;

        if (! $photo || $photo->liveness_status === 'pending') {
            return null;
        }

        if (data_get($photo->verification_result, 'face_detected') !== false) {
            return null;
        }

        return $this->flag($attendance, 'no_face', 'high', [
            'confidence' => data_get($photo->verification_result, 'confidence'),
            'liveness_passed' => data_get($photo->verification_result, 'liveness_passed'),
        ]);
    }

    private function checkImpossibleJump(Attendance $attendance): ?FraudFlag
    {
        if ($attendance->latitude === null || $attendance->longitude === null) {
            return null;
        }

        $previous = GpsLocation::where('employee_id', $attendance->employee_id)
            ->where('captured_at', '<', $attendance->timestamp)
            ->latest('captured_at')
            ->first();

        if (! $previous) {
            return null;
        }

        $distance = $this->gpsService->distanceMeters(
            (float) $previous->latitude,
            (float) $previous->longitude,
            (float) $attendance->latitude,
            (float) $attendance->longitude,
        );

        $durationMinutes = abs((float) $attendance->timestamp->diffInMinutes($previous->captured_at));
        $speed = $this->gpsService->travelSpeedKmh($distance, $durationMinutes);

        if ($speed <= (float) config('dtr.gps.speed_threshold_kmh', 120)) {
            return null;
        }

        return $this->flag($attendance, 'impossible_jump', 'high', [
            'distance_meters' => round($distance, 2),
            'duration_minutes' => round($durationMinutes, 2),
            'estimated_speed_kmh' => round($speed, 2),
            'previous_punch_at' => $previous->captured_at->toISOString(),
        ]);
    }

    private function checkRapidClock(Attendance $attendance): ?FraudFlag
    {
        $previous = Attendance::where('employee_id', $attendance->employee_id)
            ->where('type', $attendance->type)
            ->where('id', '<', $attendance->id)
            ->latest('timestamp')
            ->first();

        if (! $previous) {
            return null;
        }

        $elapsedMinutes = abs((float) $attendance->timestamp->diffInMinutes($previous->timestamp));

        if ($elapsedMinutes > (int) config('dtr.gps.rapid_clock_minutes', 1)) {
            return null;
        }

        return $this->flag($attendance, 'rapid_clock', 'medium', [
            'previous_punch_at' => $previous->timestamp->toISOString(),
            'elapsed_minutes' => $elapsedMinutes,
        ]);
    }

    private function checkGpsSpoof(Attendance $attendance): ?FraudFlag
    {
        if ($attendance->latitude === null || $attendance->longitude === null) {
            return null;
        }

        $previous = GpsLocation::where('employee_id', $attendance->employee_id)
            ->where('captured_at', '<', $attendance->timestamp)
            ->latest('captured_at')
            ->first();

        if (! $previous) {
            return null;
        }

        $identicalCoords = (float) $previous->latitude === (float) $attendance->latitude
            && (float) $previous->longitude === (float) $attendance->longitude;

        if (! $identicalCoords) {
            return null;
        }

        return $this->flag($attendance, 'gps_spoof', 'low', [
            'identical_coordinates' => true,
            'previous_punch_at' => $previous->captured_at->toISOString(),
        ]);
    }

    private function flag(Attendance $attendance, string $type, string $severity, array $details): FraudFlag
    {
        $existing = FraudFlag::query()
            ->where('attendance_id', $attendance->id)
            ->where('type', $type)
            ->first();

        if ($existing) {
            return $existing;
        }

        return FraudFlag::create([
            'attendance_id' => $attendance->id,
            'type' => $type,
            'severity' => $severity,
            'details' => $details,
        ]);
    }
}
