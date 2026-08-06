<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AppSetting extends Model
{
    protected $fillable = [
        'breaks_enabled',
    ];

    protected $casts = [
        'breaks_enabled' => 'boolean',
    ];

    public static function current(): self
    {
        return static::query()->firstOrCreate(
            ['id' => 1],
            ['breaks_enabled' => true],
        );
    }
}
