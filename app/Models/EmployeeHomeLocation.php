<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class EmployeeHomeLocation extends Model
{
    protected $table = 'employee_home_location';

    protected $fillable = [
        'employee_id',
        'home_location_id',
        'is_primary',
        'assigned_at',
    ];

    protected $casts = [
        'is_primary' => 'boolean',
        'assigned_at' => 'datetime',
    ];

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function homeLocation(): BelongsTo
    {
        return $this->belongsTo(HomeLocation::class);
    }
}
