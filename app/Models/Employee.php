<?php

namespace App\Models;

use Database\Factories\EmployeeFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Employee extends Model
{
    /** @use HasFactory<EmployeeFactory> */
    use HasFactory;

    protected $fillable = [
        'user_id',
        'branch_id',
        'work_arrangement',
        'first_name',
        'middle_name',
        'last_name',
        'department_id',
        'position_id',
        'date_hired',
    ];

    protected $casts = [
        'date_hired' => 'date',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function department(): BelongsTo
    {
        return $this->belongsTo(Department::class);
    }

    public function position(): BelongsTo
    {
        return $this->belongsTo(Position::class);
    }

    public function attendanceRecords(): HasMany
    {
        return $this->hasMany(Attendance::class);
    }

    public function devices(): HasMany
    {
        return $this->hasMany(Device::class);
    }

    public function schedules(): HasMany
    {
        return $this->hasMany(Schedule::class);
    }

    public function latestDevice(): HasOne
    {
        return $this->hasOne(Device::class)->latestOfMany();
    }

    public function consents(): HasMany
    {
        return $this->hasMany(Consent::class);
    }

    public function homeLocationAssignments(): HasMany
    {
        return $this->hasMany(EmployeeHomeLocation::class);
    }

    public function homeLocations(): BelongsToMany
    {
        return $this->belongsToMany(HomeLocation::class, 'employee_home_location')
            ->withPivot(['is_primary', 'assigned_at'])
            ->withTimestamps();
    }

    public function primaryHomeLocation(): ?HomeLocation
    {
        return $this->homeLocations()
            ->wherePivot('is_primary', true)
            ->where('home_locations.status', 'approved')
            ->first();
    }

    public function isWfh(): bool
    {
        return $this->work_arrangement === 'wfh';
    }

    public function isHybrid(): bool
    {
        return $this->work_arrangement === 'hybrid';
    }

    public function requiresHomeLocation(): bool
    {
        return $this->isWfh() || $this->isHybrid();
    }

    public function homeLocationStatus(): string
    {
        if ($this->primaryHomeLocation()) {
            return 'approved';
        }

        if ($this->homeLocations()->where('home_locations.status', 'pending')->exists()) {
            return 'pending';
        }

        return 'none';
    }

    public function getFullNameAttribute(): string
    {
        return collect([$this->first_name, $this->middle_name, $this->last_name])
            ->filter(fn ($part) => filled($part))
            ->implode(' ');
    }
}
