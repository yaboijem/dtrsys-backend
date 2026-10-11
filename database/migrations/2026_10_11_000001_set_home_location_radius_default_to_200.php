<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('home_locations', function (Blueprint $table) {
            $table->unsignedInteger('radius_meters')->default(200)->change();
        });
    }

    public function down(): void
    {
        Schema::table('home_locations', function (Blueprint $table) {
            $table->unsignedInteger('radius_meters')->default(150)->change();
        });
    }
};
