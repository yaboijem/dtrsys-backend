<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class GpsLocation extends Model
{
    protected $fillable = [
        'attendance_id',
        'employee_id',
        'latitude',
        'longitude',
        'accuracy_meters',
        'distance_from_branch_meters',
        'is_within_radius',
        'captured_at',
    ];

    protected $casts = [
        'latitude' => 'float',
        'longitude' => 'float',
        'accuracy_meters' => 'float',
        'distance_from_branch_meters' => 'float',
        'is_within_radius' => 'boolean',
        'captured_at' => 'datetime',
    ];

    public function attendance(): BelongsTo
    {
        return $this->belongsTo(Attendance::class);
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }
}
