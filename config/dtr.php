<?php

return [
    'face_verification' => [
        'provider' => env('FACE_VERIFICATION_PROVIDER', 'mock'),
        'force_mismatch' => env('FACE_VERIFICATION_FORCE_MISMATCH', false),
        'confidence_threshold' => 0.8,
    ],

    'gps' => [
        'speed_threshold_kmh' => env('GPS_JUMP_THRESHOLD_KMH', 120),
        'rapid_clock_minutes' => env('RAPID_CLOCK_MINUTES', 1),
    ],

    'attendance' => [
        'photo_disk' => env('ATTENDANCE_PHOTO_DISK', 'public'),
    ],

    'payroll' => [
        'export_disk' => env('PAYROLL_EXPORT_DISK', 'local'),
    ],
];
