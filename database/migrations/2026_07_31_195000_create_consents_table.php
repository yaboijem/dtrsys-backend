<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('consents', function (Blueprint $table) {
            $table->id();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $table->string('type');
            $table->boolean('granted')->default(false);
            $table->dateTime('granted_at')->nullable();
            $table->dateTime('revoked_at')->nullable();
            $table->timestamps();

            $table->unique(['employee_id', 'type']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('consents');
    }
};
