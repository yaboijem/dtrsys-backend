<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('schedules', function (Blueprint $table) {
            $table->id();
            $table->foreignId('employee_id')->constrained();
            $table->foreignId('shift_id')->constrained();
            $table->date('date');
            $table->timestamps();

            $table->unique(['employee_id', 'date']);
            $table->index(['employee_id', 'shift_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('schedules');
    }
};
