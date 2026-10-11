<?php

return [
    'gps' => [
        'speed_threshold_kmh' => env('GPS_JUMP_THRESHOLD_KMH', 120),
        'rapid_clock_minutes' => env('RAPID_CLOCK_MINUTES', 1),
        'home_radius_meters' => (int) env('GPS_HOME_RADIUS_METERS', 200),
    ],

    'attendance' => [
        // public | s3 | database (MySQL LONGTEXT — no object storage)
        'photo_disk' => env('ATTENDANCE_PHOTO_DISK', 'local'),
        'client_uuid_required_online' => env('ATTENDANCE_CLIENT_UUID_REQUIRED', false),
        'employee_lock_seconds' => (int) env('ATTENDANCE_EMPLOYEE_LOCK_SECONDS', 15),
        'open_session_lookback_days' => (int) env('OPEN_SESSION_LOOKBACK_DAYS', 30),
    ],

    'retention' => [
        'attendance_days' => (int) env('RETENTION_ATTENDANCE_DAYS', 730),
        'audit_days' => (int) env('RETENTION_AUDIT_DAYS', 730),
    ],

    'push' => [
        'vapid_subject' => env('VAPID_SUBJECT', 'mailto:admin@localhost'),
        'vapid_public_key' => env('VAPID_PUBLIC_KEY'),
        'vapid_private_key' => env('VAPID_PRIVATE_KEY'),
    ],

    'nominatim' => [
        'base_url' => env('NOMINATIM_BASE_URL', 'https://nominatim.openstreetmap.org'),
        'user_agent' => env('NOMINATIM_USER_AGENT', 'DTRSys/1.0 (home-location reverse geocode)'),
        'cache_seconds' => (int) env('NOMINATIM_CACHE_SECONDS', 86400),
        // Windows PHP often lacks a CA bundle; set NOMINATIM_VERIFY_SSL=false locally only.
        'verify_ssl' => filter_var(env('NOMINATIM_VERIFY_SSL', true), FILTER_VALIDATE_BOOLEAN),
    ],
];
