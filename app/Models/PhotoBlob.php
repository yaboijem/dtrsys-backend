<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PhotoBlob extends Model
{
    protected $fillable = [
        'path',
        'data',
        'byte_size',
    ];
}
