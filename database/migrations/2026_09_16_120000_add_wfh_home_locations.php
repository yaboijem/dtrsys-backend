<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            $table->string('work_arrangement', 20)->default('onsite')->after('branch_id');
            $table->index('work_arrangement');
        });

        Schema::create('home_locations', function (Blueprint $table) {
            $table->id();
            $table->string('label')->nullable();
            $table->decimal('latitude', 10, 7);
            $table->decimal('longitude', 10, 7);
            $table->unsignedInteger('radius_meters')->default(150);
            $table->string('address_text')->nullable();
            $table->foreignId('created_by')->constrained('users');
            $table->enum('status', ['pending', 'approved', 'rejected', 'retired'])->default('pending');
            $table->foreignId('reviewed_by')->nullable()->constrained('users');
            $table->dateTime('reviewed_at')->nullable();
            $table->text('review_note')->nullable();
            $table->timestamps();
            $table->index('status');
        });

        Schema::create('employee_home_location', function (Blueprint $table) {
            $table->id();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $table->foreignId('home_location_id')->constrained('home_locations')->cascadeOnDelete();
            $table->boolean('is_primary')->default(false);
            $table->timestamp('assigned_at')->useCurrent();
            $table->timestamps();
            $table->unique(['employee_id', 'home_location_id']);
            $table->index(['employee_id', 'is_primary']);
        });

        Schema::table('gps_locations', function (Blueprint $table) {
            $table->string('verified_against_type', 32)->nullable()->after('is_within_radius');
            $table->unsignedBigInteger('verified_against_id')->nullable()->after('verified_against_type');
            $table->index(['verified_against_type', 'verified_against_id'], 'gps_verified_against_idx');
        });
    }

    public function down(): void
    {
        Schema::table('gps_locations', function (Blueprint $table) {
            $table->dropIndex('gps_verified_against_idx');
            $table->dropColumn(['verified_against_type', 'verified_against_id']);
        });
        Schema::dropIfExists('employee_home_location');
        Schema::dropIfExists('home_locations');
        Schema::table('employees', function (Blueprint $table) {
            $table->dropIndex(['work_arrangement']);
            $table->dropColumn('work_arrangement');
        });
    }
};
