<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::dropIfExists('report_exports');
        Schema::dropIfExists('payroll_exports');
    }

    public function down(): void
    {
        // Tables intentionally not recreated; feature removed.
    }
};
