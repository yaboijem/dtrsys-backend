<?php

namespace App\Models;

use Database\Factories\HomeLocationFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class HomeLocation extends Model
{
    /** @use HasFactory<HomeLocationFactory> */
    use HasFactory;

    protected $fillable = [
        'label',
        'latitude',
        'longitude',
        'radius_meters',
        'address_text',
        'street',
        'city',
        'province',
        'created_by',
        'status',
        'reviewed_by',
        'reviewed_at',
        'review_note',
    ];

    protected $casts = [
        'latitude' => 'float',
        'longitude' => 'float',
        'radius_meters' => 'integer',
        'reviewed_at' => 'datetime',
    ];

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }

    public function assignments(): HasMany
    {
        return $this->hasMany(EmployeeHomeLocation::class);
    }

    public function employees(): BelongsToMany
    {
        return $this->belongsToMany(Employee::class, 'employee_home_location')
            ->withPivot(['is_primary', 'assigned_at'])
            ->withTimestamps();
    }
}
