<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('departments', function (Blueprint $table) {
            $table->id();
            $table->string('name')->unique();
            $table->timestamps();
        });

        Schema::create('positions', function (Blueprint $table) {
            $table->id();
            $table->string('name')->unique();
            $table->timestamps();
        });

        Schema::table('employees', function (Blueprint $table) {
            $table->foreignId('department_id')->nullable()->after('last_name')->constrained()->restrictOnDelete();
            $table->foreignId('position_id')->nullable()->after('department_id')->constrained()->restrictOnDelete();
        });

        $this->backfill('department', 'departments', 'department_id');
        $this->backfill('position', 'positions', 'position_id');

        Schema::table('employees', function (Blueprint $table) {
            $table->dropIndex(['branch_id', 'department']);
        });

        Schema::table('employees', function (Blueprint $table) {
            $table->dropColumn(['department', 'position']);
        });

        Schema::table('employees', function (Blueprint $table) {
            $table->index(['branch_id', 'department_id']);
        });
    }

    public function down(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            $table->dropIndex(['branch_id', 'department_id']);
            $table->dropConstrainedForeignId('department_id');
            $table->dropConstrainedForeignId('position_id');
            $table->string('department')->nullable();
            $table->string('position')->nullable();
            $table->index(['branch_id', 'department']);
        });

        Schema::dropIfExists('positions');
        Schema::dropIfExists('departments');
    }

    private function backfill(string $sourceColumn, string $masterTable, string $fkColumn): void
    {
        $names = DB::table('employees')
            ->whereNotNull($sourceColumn)
            ->where($sourceColumn, '!=', '')
            ->distinct()
            ->pluck($sourceColumn);

        foreach ($names as $name) {
            $trimmed = trim((string) $name);
            if ($trimmed === '') {
                continue;
            }

            $id = DB::table($masterTable)->whereRaw('LOWER(name) = ?', [mb_strtolower($trimmed)])->value('id');
            if (! $id) {
                $id = DB::table($masterTable)->insertGetId([
                    'name' => $trimmed,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }

            DB::table('employees')
                ->where($sourceColumn, $name)
                ->update([$fkColumn => $id]);
        }
    }
};
