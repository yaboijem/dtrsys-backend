<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::dropIfExists('device_change_requests');
    }

    public function down(): void
    {
        Schema::create('device_change_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $table->string('current_device_id')->nullable();
            $table->string('new_device_id');
            $table->text('reason')->nullable();
            $table->string('status')->default('pending');
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            $table->text('review_notes')->nullable();
            $table->timestamps();
        });
    }
};
