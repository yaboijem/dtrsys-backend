<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('branches', function (Blueprint $table) {
            $table->unsignedInteger('accuracy_ceiling_meters')->default(100)->after('radius_meters');
            $table->unsignedInteger('accuracy_allowance_meters')->default(30)->after('accuracy_ceiling_meters');
        });
    }

    public function down(): void
    {
        Schema::table('branches', function (Blueprint $table) {
            $table->dropColumn(['accuracy_ceiling_meters', 'accuracy_allowance_meters']);
        });
    }
};
