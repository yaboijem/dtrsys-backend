<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PayrollExport extends Model
{
    protected $fillable = [
        'requested_by',
        'date_from',
        'date_to',
        'filters',
        'status',
        'file_path',
        'row_count',
        'completed_at',
        'error_message',
    ];

    protected $casts = [
        'date_from' => 'date',
        'date_to' => 'date',
        'filters' => 'array',
        'row_count' => 'integer',
        'completed_at' => 'datetime',
    ];

    public function requester(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requested_by');
    }
}
