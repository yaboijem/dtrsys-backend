<?php

return [
    'face_verification' => [
        'provider' => env('FACE_VERIFICATION_PROVIDER', 'mock'),
        'force_mismatch' => env('FACE_VERIFICATION_FORCE_MISMATCH', false),
        'force_no_face' => env('FACE_VERIFICATION_FORCE_NO_FACE', false),
        'confidence_threshold' => 0.8,
    ],

    'gps' => [
        'speed_threshold_kmh' => env('GPS_JUMP_THRESHOLD_KMH', 120),
        'rapid_clock_minutes' => env('RAPID_CLOCK_MINUTES', 1),
        'home_radius_meters' => (int) env('GPS_HOME_RADIUS_METERS', 150),
    ],

    'attendance' => [
        // public | s3 | database (Neon/Postgres — free tier, no object storage)
        'photo_disk' => env('ATTENDANCE_PHOTO_DISK', 'public'),
        'async_face_verification' => env('ATTENDANCE_ASYNC_FACE', true),
        'client_uuid_required_online' => env('ATTENDANCE_CLIENT_UUID_REQUIRED', false),
        'employee_lock_seconds' => (int) env('ATTENDANCE_EMPLOYEE_LOCK_SECONDS', 15),
    ],

    'sync' => [
        'max_records' => (int) env('ATTENDANCE_SYNC_MAX_RECORDS', 100),
        'max_records_with_photos' => (int) env('ATTENDANCE_SYNC_MAX_WITH_PHOTOS', 5),
    ],

    'retention' => [
        'attendance_days' => (int) env('RETENTION_ATTENDANCE_DAYS', 730),
        'audit_days' => (int) env('RETENTION_AUDIT_DAYS', 730),
    ],

    'nominatim' => [
        'base_url' => env('NOMINATIM_BASE_URL', 'https://nominatim.openstreetmap.org'),
        'user_agent' => env('NOMINATIM_USER_AGENT', 'DTRSys/1.0 (home-location reverse geocode)'),
        'cache_seconds' => (int) env('NOMINATIM_CACHE_SECONDS', 86400),
    ],
];
