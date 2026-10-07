<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement("ALTER TABLE fraud_flags MODIFY COLUMN type ENUM('gps_spoof', 'impossible_jump', 'face_mismatch', 'rapid_clock', 'out_of_radius', 'no_face', 'overbreak') NOT NULL");
    }

    public function down(): void
    {
        DB::statement("ALTER TABLE fraud_flags MODIFY COLUMN type ENUM('gps_spoof', 'impossible_jump', 'face_mismatch', 'rapid_clock', 'out_of_radius', 'no_face') NOT NULL");
    }
};
