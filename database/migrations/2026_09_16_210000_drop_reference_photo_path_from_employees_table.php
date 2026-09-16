<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('employees', 'reference_photo_path')) {
            Schema::table('employees', function (Blueprint $table) {
                $table->dropColumn('reference_photo_path');
            });
        }
    }

    public function down(): void
    {
        if (! Schema::hasColumn('employees', 'reference_photo_path')) {
            Schema::table('employees', function (Blueprint $table) {
                $table->string('reference_photo_path')->nullable()->after('date_hired');
            });
        }
    }
};
