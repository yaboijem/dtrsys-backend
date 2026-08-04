<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('attendance', function (Blueprint $table) {
            $table->unsignedInteger('break_minutes')->nullable()->after('work_minutes');
            $table->boolean('is_overbreak')->default(false)->after('break_minutes');
            $table->string('break_notify_stage', 16)->default('none')->after('is_overbreak');
        });

        $driver = Schema::getConnection()->getDriverName();

        if ($driver === 'mysql') {
            DB::statement("ALTER TABLE attendance MODIFY COLUMN type ENUM('time_in', 'time_out', 'break_in', 'break_out') NOT NULL");
        }
    }

    public function down(): void
    {
        $driver = Schema::getConnection()->getDriverName();

        if ($driver === 'mysql') {
            DB::statement("ALTER TABLE attendance MODIFY COLUMN type ENUM('time_in', 'time_out') NOT NULL");
        }

        Schema::table('attendance', function (Blueprint $table) {
            $table->dropColumn(['break_minutes', 'is_overbreak', 'break_notify_stage']);
        });
    }
};
