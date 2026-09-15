<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('home_locations', function (Blueprint $table) {
            $table->string('street')->nullable()->after('address_text');
            $table->string('city')->nullable()->after('street');
            $table->string('province')->nullable()->after('city');
        });
    }

    public function down(): void
    {
        Schema::table('home_locations', function (Blueprint $table) {
            $table->dropColumn(['street', 'city', 'province']);
        });
    }
};
