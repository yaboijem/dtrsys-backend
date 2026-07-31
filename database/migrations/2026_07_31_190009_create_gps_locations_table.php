<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('gps_locations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('attendance_id')->constrained('attendance')->cascadeOnDelete();
            $table->foreignId('employee_id')->constrained();
            $table->decimal('latitude', 10, 7);
            $table->decimal('longitude', 10, 7);
            $table->decimal('accuracy_meters', 10, 2)->nullable();
            $table->decimal('distance_from_branch_meters', 12, 2)->nullable();
            $table->boolean('is_within_radius')->nullable();
            $table->dateTime('captured_at');
            $table->timestamps();

            $table->index(['employee_id', 'captured_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('gps_locations');
    }
};
