<?php

namespace Tests\Feature;

use App\Console\Commands\ImportSqlite;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use PDO;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class ImportSqliteTest extends TestCase
{
    use RefreshDatabase;

    private string $sqlitePath;

    protected function setUp(): void
    {
        parent::setUp();

        $this->sqlitePath = storage_path('framework/testing-import.sqlite');
        if (file_exists($this->sqlitePath)) {
            unlink($this->sqlitePath);
        }
    }

    protected function tearDown(): void
    {
        if (file_exists($this->sqlitePath)) {
            unlink($this->sqlitePath);
        }

        parent::tearDown();
    }

    #[Test]
    public function it_copies_rows_and_preserves_ids(): void
    {
        $this->makeSqlite([
            'users' => [[
                'id' => 7,
                'name' => 'Ada',
                'email' => 'ada@example.com',
                'password' => 'secret',
                'employee_id' => 'EMP007',
                'is_active' => 1,
            ]],
            'app_settings' => [[
                'id' => 1,
                'breaks_enabled' => 0,
            ]],
        ]);

        $this->artisan('dtr:import-sqlite', ['path' => $this->sqlitePath])
            ->assertExitCode(0);

        $this->assertDatabaseHas('users', [
            'id' => 7,
            'email' => 'ada@example.com',
            'employee_id' => 'EMP007',
        ]);
        $this->assertDatabaseHas('app_settings', [
            'id' => 1,
            'breaks_enabled' => 0,
        ]);
    }

    #[Test]
    public function it_rolls_back_when_an_enum_is_invalid(): void
    {
        $this->makeSqlite([
            'users' => [[
                'id' => 3,
                'name' => 'Bad',
                'email' => 'bad@example.com',
                'password' => 'secret',
                'is_active' => 1,
            ]],
            'home_locations' => [[
                'id' => 1,
                'latitude' => '14.5500000',
                'longitude' => '121.0200000',
                'radius_meters' => 150,
                'created_by' => 3,
                'status' => 'nope',
            ]],
        ]);

        $this->artisan('dtr:import-sqlite', ['path' => $this->sqlitePath])
            ->expectsOutputToContain('Invalid enum value for home_locations.status')
            ->assertExitCode(1);

        $this->assertSame(0, DB::table('users')->count());
        $this->assertSame(0, DB::table('home_locations')->count());
    }

    #[Test]
    public function it_stores_invalid_json_as_null(): void
    {
        $this->makeSqlite([
            'audit_logs' => [[
                'id' => 4,
                'action' => 'updated',
                'old_values' => 'not-json',
                'new_values' => '',
            ]],
        ]);

        $this->artisan('dtr:import-sqlite', ['path' => $this->sqlitePath])
            ->assertExitCode(0);

        $row = DB::table('audit_logs')->where('id', 4)->first();
        $this->assertNotNull($row);
        $this->assertSame('updated', $row->action);
        $this->assertNull($row->old_values);
        $this->assertNull($row->new_values);
    }

    #[Test]
    public function it_refuses_when_users_already_exist(): void
    {
        DB::table('users')->insert([
            'name' => 'Existing',
            'email' => 'existing@example.com',
            'password' => 'secret',
            'is_active' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $this->makeSqlite();

        $this->artisan('dtr:import-sqlite', ['path' => $this->sqlitePath])
            ->expectsOutputToContain('already has rows')
            ->assertExitCode(1);
    }

    private function makeSqlite(array $rowsByTable = []): void
    {
        $pdo = new PDO('sqlite:'.$this->sqlitePath);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

        foreach (ImportSqlite::TABLES as $table) {
            $columns = Schema::connection('mysql')->getColumnListing($table);
            $defs = implode(', ', array_map(fn (string $column) => '"'.$column.'" TEXT', $columns));
            $pdo->exec('CREATE TABLE "'.$table.'" ('.$defs.')');

            foreach ($rowsByTable[$table] ?? [] as $row) {
                $keys = array_keys($row);
                $placeholders = implode(', ', array_fill(0, count($keys), '?'));
                $quoted = implode(', ', array_map(fn (string $key) => '"'.$key.'"', $keys));
                $statement = $pdo->prepare('INSERT INTO "'.$table.'" ('.$quoted.') VALUES ('.$placeholders.')');
                $statement->execute(array_values($row));
            }
        }
    }
}
