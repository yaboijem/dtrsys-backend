<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Attendance extends Model
{
    use HasFactory, HasUuids, SoftDeletes;

    protected $table = 'attendance';

    public function uniqueIds(): array
    {
        return ['uuid'];
    }

    protected $fillable = [
        'employee_id',
        'branch_id',
        'device_id',
        'type',
        'timestamp',
        'latitude',
        'longitude',
        'gps_accuracy_meters',
        'is_offline',
        'is_late',
        'work_minutes',
        'source',
        'notes',
        'synced_at',
    ];

    protected $casts = [
        'timestamp' => 'datetime',
        'is_offline' => 'boolean',
        'is_late' => 'boolean',
        'work_minutes' => 'integer',
        'synced_at' => 'datetime',
    ];

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function device(): BelongsTo
    {
        return $this->belongsTo(Device::class);
    }

    public function photo(): HasOne
    {
        return $this->hasOne(AttendancePhoto::class);
    }

    public function gpsLocation(): HasOne
    {
        return $this->hasOne(GpsLocation::class);
    }

    public function fraudFlags(): HasMany
    {
        return $this->hasMany(FraudFlag::class);
    }
}
