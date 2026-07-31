<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('attendance_photos', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->foreignId('attendance_id')->constrained('attendance')->cascadeOnDelete();
            $table->string('path');
            $table->boolean('is_verified')->default(false);
            $table->json('verification_result')->nullable();
            $table->enum('liveness_status', ['not_checked', 'pending', 'passed', 'failed'])->default('not_checked');
            $table->dateTime('captured_at');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('attendance_photos');
    }
};
