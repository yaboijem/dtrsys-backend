<?php

namespace App\Models;

use Database\Factories\DeviceChangeRequestFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DeviceChangeRequest extends Model
{
    /** @use HasFactory<DeviceChangeRequestFactory> */
    use HasFactory;

    protected $fillable = [
        'employee_id',
        'current_device_id',
        'new_device_id',
        'reason',
        'status',
        'reviewed_by',
        'reviewed_at',
        'review_notes',
    ];

    protected $casts = [
        'reviewed_at' => 'datetime',
    ];

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function currentDevice(): BelongsTo
    {
        return $this->belongsTo(Device::class, 'current_device_id');
    }

    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }
}
