<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('attendance', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->foreignId('employee_id')->constrained();
            $table->foreignId('branch_id')->constrained();
            $table->foreignId('device_id')->nullable()->constrained();
            $table->enum('type', ['time_in', 'time_out', 'break_in', 'break_out']);
            $table->dateTime('timestamp');
            $table->decimal('latitude', 10, 7)->nullable();
            $table->decimal('longitude', 10, 7)->nullable();
            $table->decimal('gps_accuracy_meters', 10, 2)->nullable();
            $table->boolean('is_offline')->default(false);
            $table->boolean('is_late')->default(false);
            $table->unsignedInteger('work_minutes')->nullable();
            $table->enum('source', ['app', 'sync', 'admin'])->default('app');
            $table->string('notes')->nullable();
            $table->timestamp('synced_at')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['employee_id', 'timestamp']);
            $table->index(['branch_id', 'timestamp']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('attendance');
    }
};
