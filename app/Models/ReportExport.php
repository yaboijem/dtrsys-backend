<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ReportExport extends Model
{
    use HasFactory;

    protected $fillable = [
        'requested_by',
        'type',
        'date_from',
        'date_to',
        'filters',
        'status',
        'file_path',
        'row_count',
        'error_message',
        'completed_at',
    ];

    protected $casts = [
        'filters' => 'array',
        'date_from' => 'date',
        'date_to' => 'date',
        'completed_at' => 'datetime',
    ];

    public function requester(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requested_by');
    }
}
