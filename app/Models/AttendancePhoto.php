<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AttendancePhoto extends Model
{
    use HasUuids;

    public function uniqueIds(): array
    {
        return ['uuid'];
    }

    protected $fillable = [
        'attendance_id',
        'path',
        'captured_at',
    ];

    protected $casts = [
        'captured_at' => 'datetime',
    ];

    public function attendance(): BelongsTo
    {
        return $this->belongsTo(Attendance::class);
    }
}
