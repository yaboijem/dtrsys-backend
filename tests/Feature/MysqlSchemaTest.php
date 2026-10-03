<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class MysqlSchemaTest extends TestCase
{
    use RefreshDatabase;

    #[Test]
    public function baseline_migration_creates_the_current_mysql_schema(): void
    {
        $this->assertSame(
            ['2026_10_03_000000_create_dtr_mysql_schema'],
            DB::table('migrations')->pluck('migration')->all(),
        );

        $this->assertFalse(Schema::hasTable('device_change_requests'));
        $this->assertFalse(Schema::hasTable('report_exports'));
        $this->assertFalse(Schema::hasTable('payroll_exports'));
        $this->assertFalse(Schema::hasColumn('employees', 'department'));
        $this->assertFalse(Schema::hasColumn('employees', 'position'));
        $this->assertTrue(Schema::hasColumn('employees', 'department_id'));
        $this->assertTrue(Schema::hasColumn('employees', 'position_id'));
        $this->assertTrue(Schema::hasColumn('employees', 'work_arrangement'));

        $this->assertSame(
            "enum('time_in','time_out','break_in','break_out')",
            $this->columnType('attendance', 'type'),
        );
        $this->assertSame(
            "enum('app','sync','admin')",
            $this->columnType('attendance', 'source'),
        );
        $this->assertSame('longtext', $this->columnType('photo_blobs', 'data'));
        $this->assertTrue($this->isJsonColumn('fraud_flags', 'details'));
        $this->assertTrue($this->isJsonColumn('audit_logs', 'old_values'));
        $this->assertTrue($this->isJsonColumn('audit_logs', 'new_values'));
        $this->assertSame('InnoDB', $this->tableEngine('users'));

        $this->assertDatabaseHas('app_settings', [
            'id' => 1,
            'breaks_enabled' => 1,
        ]);
    }

    private function isJsonColumn(string $table, string $column): bool
    {
        if ($this->columnType($table, $column) === 'json') {
            return true;
        }

        $row = DB::selectOne('SHOW CREATE TABLE `'.$table.'`');
        $create = (string) ($row->{'Create Table'} ?? '');

        return str_contains($create, 'json_valid(`'.$column.'`)');
    }

    private function columnType(string $table, string $column): string
    {
        $row = DB::selectOne(
            'SELECT COLUMN_TYPE AS column_type FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
            [$table, $column],
        );

        return (string) $row->column_type;
    }

    private function tableEngine(string $table): string
    {
        $row = DB::selectOne(
            'SELECT ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
            [$table],
        );

        return (string) $row->engine;
    }
}
