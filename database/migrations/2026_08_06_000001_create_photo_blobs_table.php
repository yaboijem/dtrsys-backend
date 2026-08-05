<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('photo_blobs', function (Blueprint $table) {
            $table->id();
            $table->string('path')->unique();
            // Base64 JPEG payload — works on SQLite, MySQL, and Neon PostgreSQL.
            $table->longText('data');
            $table->unsignedInteger('byte_size')->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('photo_blobs');
    }
};
