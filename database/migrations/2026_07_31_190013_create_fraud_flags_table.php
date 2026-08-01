<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('fraud_flags', function (Blueprint $table) {
            $table->id();
            $table->foreignId('attendance_id')->constrained('attendance')->cascadeOnDelete();
            $table->enum('type', ['gps_spoof', 'impossible_jump', 'face_mismatch', 'rapid_clock', 'out_of_radius', 'no_face']);
            $table->enum('severity', ['low', 'medium', 'high'])->default('medium');
            $table->json('details')->nullable();
            $table->enum('status', ['open', 'reviewed', 'dismissed'])->default('open');
            $table->foreignId('reviewed_by')->nullable()->constrained('users');
            $table->dateTime('reviewed_at')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['status', 'type']);
            $table->index(['attendance_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('fraud_flags');
    }
};
