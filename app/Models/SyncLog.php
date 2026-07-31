<?php

namespace App\Models;

use Database\Factories\SyncLogFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SyncLog extends Model
{
    /** @use HasFactory<SyncLogFactory> */
    use HasFactory;

    protected $fillable = [
        'employee_id',
        'device_id',
        'payload_count',
        'status',
        'error_message',
        'synced_at',
    ];

    protected $casts = [
        'payload_count' => 'integer',
        'synced_at' => 'datetime',
    ];

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function device(): BelongsTo
    {
        return $this->belongsTo(Device::class);
    }
}
