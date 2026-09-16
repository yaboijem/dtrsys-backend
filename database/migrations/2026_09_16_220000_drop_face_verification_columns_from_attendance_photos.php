<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('attendance_photos', function (Blueprint $table) {
            if (Schema::hasColumn('attendance_photos', 'is_verified')) {
                $table->dropColumn('is_verified');
            }
            if (Schema::hasColumn('attendance_photos', 'verification_result')) {
                $table->dropColumn('verification_result');
            }
            if (Schema::hasColumn('attendance_photos', 'liveness_status')) {
                $table->dropColumn('liveness_status');
            }
        });
    }

    public function down(): void
    {
        Schema::table('attendance_photos', function (Blueprint $table) {
            if (! Schema::hasColumn('attendance_photos', 'is_verified')) {
                $table->boolean('is_verified')->default(false);
            }
            if (! Schema::hasColumn('attendance_photos', 'verification_result')) {
                $table->json('verification_result')->nullable();
            }
            if (! Schema::hasColumn('attendance_photos', 'liveness_status')) {
                $table->enum('liveness_status', ['not_checked', 'pending', 'passed', 'failed'])->default('not_checked');
            }
        });
    }
};
