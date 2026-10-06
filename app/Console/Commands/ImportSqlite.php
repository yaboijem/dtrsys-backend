<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use PDO;
use Throwable;

class ImportSqlite extends Command
{
    protected $signature = 'dtr:import-sqlite {path=database/local.sqlite}';

    protected $description = 'Copy persistent rows from a SQLite file into the mysql connection';

    public const TABLES = [
        'users',
        'password_reset_tokens',
        'permissions',
        'roles',
        'role_has_permissions',
        'model_has_permissions',
        'model_has_roles',
        'personal_access_tokens',
        'notifications',
        'branches',
        'departments',
        'positions',
        'employees',
        'devices',
        'attendance',
        'attendance_photos',
        'photo_blobs',
        'gps_locations',
        'fraud_flags',
        'sync_logs',
        'audit_logs',
        'consents',
        'data_requests',
        'home_locations',
        'employee_home_location',
        'app_settings',
    ];

    public const JSON_COLUMNS = [
        'fraud_flags' => ['details'],
        'audit_logs' => ['old_values', 'new_values'],
    ];

    public const ENUMS = [
        'attendance' => [
            'type' => ['time_in', 'time_out', 'break_in', 'break_out'],
            'source' => ['app', 'sync', 'admin'],
        ],
        'fraud_flags' => [
            'type' => ['gps_spoof', 'impossible_jump', 'face_mismatch', 'rapid_clock', 'out_of_radius', 'no_face'],
            'severity' => ['low', 'medium', 'high'],
            'status' => ['open', 'reviewed', 'dismissed'],
        ],
        'sync_logs' => [
            'status' => ['success', 'partial', 'failed'],
        ],
        'data_requests' => [
            'type' => ['access', 'deletion'],
            'status' => ['pending', 'completed', 'rejected'],
        ],
        'home_locations' => [
            'status' => ['pending', 'approved', 'rejected', 'retired'],
        ],
    ];

    public const AUTO_INCREMENT = [
        'users',
        'permissions',
        'roles',
        'personal_access_tokens',
        'branches',
        'departments',
        'positions',
        'employees',
        'devices',
        'attendance',
        'attendance_photos',
        'photo_blobs',
        'gps_locations',
        'fraud_flags',
        'sync_logs',
        'audit_logs',
        'consents',
        'data_requests',
        'home_locations',
        'employee_home_location',
        'app_settings',
    ];

    public function handle(): int
    {
        $path = $this->argument('path');
        $isAbsolute = str_starts_with($path, DIRECTORY_SEPARATOR)
            || (strlen($path) >= 3 && ctype_alpha($path[0]) && $path[1] === ':' && ($path[2] === '\\' || $path[2] === '/'));
        if (! $isAbsolute) {
            $path = base_path($path);
        }

        if (! is_file($path)) {
            $this->error('SQLite file not found: '.$path);

            return self::FAILURE;
        }

        $mysql = DB::connection('mysql');
        if ($mysql->table('users')->count() > 0) {
            $this->error('MySQL users table already has rows. Refusing to import.');

            return self::FAILURE;
        }

        $sqlite = new PDO('sqlite:'.$path, null, null, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);

        $outerLevel = $mysql->transactionLevel();

        if (! $this->raisePacketLimit($mysql)) {
            return self::FAILURE;
        }
        $mysql = DB::connection('mysql');

        $mysql->statement('SET FOREIGN_KEY_CHECKS=0');

        try {
            $mysql->transaction(function () use ($mysql, $sqlite) {
                foreach (self::TABLES as $table) {
                    $this->copyTable($mysql, $sqlite, $table);
                }
            });
        } catch (Throwable $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        } finally {
            $mysql->statement('SET FOREIGN_KEY_CHECKS=1');
        }

        if ($outerLevel === 0) {
            foreach (self::AUTO_INCREMENT as $table) {
                $max = (int) $mysql->table($table)->max('id');
                $next = max(1, $max + 1);
                $mysql->statement('ALTER TABLE `'.$table.'` AUTO_INCREMENT = '.$next);
            }
        }

        $this->info('SQLite import finished.');

        return self::SUCCESS;
    }

    private function raisePacketLimit($mysql): bool
    {
        try {
            $mysql->statement('SET SESSION max_allowed_packet=67108864');

            return true;
        } catch (Throwable) {
            try {
                $mysql->statement('SET GLOBAL max_allowed_packet=67108864');
            } catch (Throwable $e) {
                $this->error('Could not raise max_allowed_packet to 64M: '.$e->getMessage());

                return false;
            }

            if ($mysql->transactionLevel() === 0) {
                DB::purge('mysql');
                DB::reconnect('mysql');
            }

            return true;
        }
    }

    private function copyTable($mysql, PDO $sqlite, string $table): void
    {
        $exists = $sqlite->query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ".$sqlite->quote($table))->fetch();
        if (! $exists) {
            throw new \RuntimeException('SQLite database is missing table '.$table.'.');
        }

        $columns = Schema::connection('mysql')->getColumnListing($table);
        $quoted = implode(', ', array_map(fn (string $column) => '"'.$column.'"', $columns));
        $rows = $sqlite->query('SELECT '.$quoted.' FROM "'.$table.'"')->fetchAll();

        if ($table === 'app_settings' && count($rows) > 0) {
            $mysql->table('app_settings')->delete();
        }

        if ($table === 'app_settings' && count($rows) === 0) {
            return;
        }

        $payload = [];
        foreach ($rows as $row) {
            $payload[] = $this->normalize($table, $row);
            if ($table === 'photo_blobs' || count($payload) === 200) {
                $mysql->table($table)->insert($payload);
                $payload = [];
            }
        }
        if ($payload !== []) {
            $mysql->table($table)->insert($payload);
        }

        $targetCount = $mysql->table($table)->count();
        if ($targetCount !== count($rows)) {
            throw new \RuntimeException('Row count mismatch for '.$table.': sqlite='.count($rows).' mysql='.$targetCount);
        }
    }

    private function normalize(string $table, array $row): array
    {
        foreach (self::ENUMS[$table] ?? [] as $column => $allowed) {
            $value = $row[$column] ?? null;
            if ($value === null || $value === '') {
                continue;
            }
            if (! in_array($value, $allowed, true)) {
                throw new \RuntimeException('Invalid enum value for '.$table.'.'.$column.': '.$value);
            }
        }

        foreach (self::JSON_COLUMNS[$table] ?? [] as $column) {
            $value = $row[$column] ?? null;
            if ($value === null || $value === '') {
                $row[$column] = null;

                continue;
            }
            json_decode((string) $value);
            if (json_last_error() !== JSON_ERROR_NONE) {
                $row[$column] = null;
            }
        }

        return $row;
    }
}
