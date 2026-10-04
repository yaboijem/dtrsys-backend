# MySQL-only database cutover

## Goal

Make MySQL 8 the only database this app supports. Replace the SQLite migration history with one baseline that creates the current schema, copy live rows from `database/local.sqlite` into local MySQL, and remove SQLite and PostgreSQL as connection paths.

## Decisions (locked)

| Topic | Choice |
|--------|--------|
| Engine | MySQL 8 only. No SQLite runtime. No PostgreSQL / Neon |
| Local server | `127.0.0.1:3306`, database `dtrsys`, user `root`, empty password |
| Schema shape | Current tables only. One new baseline migration. Delete the old migration files |
| Table options | InnoDB, `utf8mb4`, `utf8mb4_unicode_ci` |
| Constrained strings | Real `ENUM` columns, not check constraints |
| JSON | `fraud_flags.details`, `audit_logs.old_values`, `audit_logs.new_values` stay JSON |
| Photos | `photo_blobs.data` stays `LONGTEXT` base64 |
| Data | Copy persistent rows from `local.sqlite`, preserving ids |
| Tests | MySQL database `dtrsys_testing`. Not in-memory SQLite |
| Production | Bring-your-own MySQL 8. Docs and `render.yaml` stop naming Neon or `pgsql` |
| Failure | Do not write `.env` until the copy verifies. Never delete `local.sqlite` |

## Out of scope

- Installing or upgrading MySQL
- Changing business columns, relations, or application behavior
- Moving punch photos out of the database
- Redis, queue, or cache driver changes
- A permanent dual-database runtime
- Copying ephemeral tables (cache, jobs, sessions, Telescope, the old `migrations` rows)

## Current system

- Local `.env` uses SQLite file `database/local.sqlite`.
- `config/database.php` defaults to `sqlite` and still defines `pgsql`.
- `phpunit.xml` uses `DB_CONNECTION=sqlite` and `DB_DATABASE=:memory:`.
- `.env.example`, `docs/DEPLOY.md`, `render.yaml`, and the README deployment notes point production at Neon PostgreSQL.
- `composer.json` creates `database/database.sqlite` on project create.
- Incremental migrations created, then dropped, `device_change_requests`, `report_exports`, and `payroll_exports`.
- Nothing live is already on MySQL, so replaying that history is unnecessary.

## Schema

Delete every file in `database/migrations/`. Replace them with one baseline migration that creates the current schema directly. No driver branches. No SQLite testing workaround.

The `mysql` connection in `config/database.php` sets `engine=InnoDB`, `charset=utf8mb4`, and `collation=utf8mb4_unicode_ci`. The baseline relies on that. String lengths come from the original migrations, not SQLite's unbounded `varchar`.

### Not created

`device_change_requests`, `report_exports`, `payroll_exports`.

### Framework tables

`users`, `password_reset_tokens`, `sessions`, `cache`, `cache_locks`, `jobs`, `job_batches`, `failed_jobs`, `personal_access_tokens`, `notifications`, `permissions`, `roles`, `model_has_permissions`, `model_has_roles`, `role_has_permissions`, `telescope_entries`, `telescope_entries_tags`, `telescope_monitoring`.

Permission tables stay team-less, matching the current schema. Telescope tables are created so the existing package still has its storage, but their rows are not copied.

`users` keeps `employee_id` as a unique nullable string code (`varchar(30)`), plus `is_active` and the three two-factor columns. It is not a foreign key to `employees`.

### Domain tables

- `branches` — `code` `varchar(20)` unique, lat/lng `decimal(10,7)`, `radius_meters` default 200
- `departments`, `positions` — unique `name`
- `shifts` — start/end, grace, optional break window
- `employees` — `user_id` unique, cascade on user delete; `branch_id` required; `department_id` and `position_id` nullable, restrict on delete; `work_arrangement` `varchar(20)` default `onsite`
- `devices` — unique `device_id` `varchar(64)`, nullable `name` `varchar(100)`, `is_shared` default false
- `schedules` — unique `(employee_id, date)`
- `attendance` — unique `uuid`; `type` enum `time_in`, `time_out`, `break_in`, `break_out`; `source` enum `app`, `sync`, `admin` default `app`; late, early-timeout, overbreak, and offline flags; `break_notify_stage` `varchar(16)` default `none`; soft deletes. Indexes: `(employee_id, timestamp)`, `(branch_id, timestamp)`, `(employee_id, type, timestamp)`
- `attendance_photos` — unique `uuid`, cascade on attendance delete
- `photo_blobs` — unique `path`, `data` `longText`, `byte_size`
- `gps_locations` — cascade on attendance delete; nullable `verified_against_type` `varchar(32)` and `verified_against_id` with index `gps_verified_against_idx`. No foreign key on that pair
- `fraud_flags` — cascade on attendance delete. `type` enum `gps_spoof`, `impossible_jump`, `face_mismatch`, `rapid_clock`, `out_of_radius`, `no_face`. `severity` enum `low`, `medium`, `high` default `medium`. `status` enum `open`, `reviewed`, `dismissed` default `open`. `details` JSON
- `sync_logs` — `status` enum `success`, `partial`, `failed` default `success`
- `audit_logs` — `old_values` and `new_values` JSON
- `consents` — unique `(employee_id, type)`, cascade on employee delete
- `data_requests` — `type` enum `access`, `deletion`; `status` enum `pending`, `completed`, `rejected` default `pending`
- `home_locations` — `status` enum `pending`, `approved`, `rejected`, `retired` default `pending`; address parts `street`, `city`, `province`
- `employee_home_location` — unique `(employee_id, home_location_id)`, cascade both ways, `is_primary`
- `app_settings` — `breaks_enabled` default true. The baseline inserts the single row `id=1`

Foreign keys that are not listed above use the default restrict behavior already in the current schema (`employees.branch_id`, `devices.employee_id`, `schedules`, `attendance.employee_id` / `branch_id` / `device_id`, `gps_locations.employee_id`, `sync_logs`, `home_locations.created_by` / `reviewed_by`, `fraud_flags.reviewed_by`, `data_requests.processed_by`, `audit_logs.user_id`).

## Data copy

After `dtrsys` exists and the baseline migration has run, a one-shot Artisan command `dtr:import-sqlite` copies rows from `database/local.sqlite`.

It opens `database/local.sqlite` by path and writes to MySQL through an explicit `dtrsys` connection. It does not use the default connection, which still points at SQLite until `.env` is switched.

It aborts if `users` already has rows, so it cannot overwrite a populated MySQL database. If `app_settings` has source rows, it deletes the baseline seed row and inserts those rows. If the source table is empty, the seed row stays.

Copy these tables, preserving primary keys:

`users`, `password_reset_tokens`, `permissions`, `roles`, `model_has_permissions`, `model_has_roles`, `role_has_permissions`, `personal_access_tokens`, `notifications`, `branches`, `departments`, `positions`, `shifts`, `employees`, `devices`, `schedules`, `attendance`, `attendance_photos`, `photo_blobs`, `gps_locations`, `fraud_flags`, `sync_logs`, `audit_logs`, `consents`, `data_requests`, `home_locations`, `employee_home_location`, `app_settings`.

Do not copy `migrations`, `cache`, `cache_locks`, `jobs`, `job_batches`, `failed_jobs`, `sessions`, or Telescope tables.

Load with foreign-key checks disabled, in dependency order, then re-enable them. For tables whose primary key is an auto-increment integer, set the counter to `max(id)+1`. Tables with a string or composite primary key are copied as-is. SQLite `0`/`1` booleans map to `tinyint(1)`. Empty strings stored in JSON columns become `NULL`. Invalid JSON becomes `NULL`. An enum value outside the column definition fails the import. Before `photo_blobs` inserts, raise the session `max_allowed_packet` to 64M.

The command is the cutover tool, not a second database driver. `local.sqlite` stays on disk.

## Config, tests, and deploy

- `.env` is updated only after the row-count check passes: `DB_CONNECTION=mysql`, `DB_HOST=127.0.0.1`, `DB_PORT=3306`, `DB_DATABASE=dtrsys`, `DB_USERNAME=root`, `DB_PASSWORD=` empty. Clear `DB_URL` if set.
- `.env.example` uses those same MySQL values. Remove the SQLite default and the Neon / `pgsql` example.
- `config/database.php`: default `mysql`. Remove the `sqlite` and `pgsql` connection blocks. Leave `mariadb` and `sqlsrv` as unused Laravel stubs. They are not documented or selected.
- `config/queue.php`: batch and failed-job database defaults use `mysql`.
- `composer.json`: remove the `database.sqlite` touch from `post-create-project-cmd`.
- `phpunit.xml`: `DB_CONNECTION=mysql`, `DB_HOST=127.0.0.1`, `DB_PORT=3306`, `DB_DATABASE=dtrsys_testing`, `DB_USERNAME=root`, `DB_PASSWORD` empty, `DB_URL` empty. Tests must not use `dtrsys`.
- Create empty database `dtrsys_testing` before running tests. `RefreshDatabase` migrates that database only.
- `render.yaml`: `DB_CONNECTION=mysql`. Remove the Neon comment and the `DB_URL` entry. Add `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, and `DB_PASSWORD`, each `sync: false`. Do not invent a host.
- `docs/DEPLOY.md` and the README deployment notes replace Neon / `pgsql` with MySQL 8. The README testing note stops saying "in-memory SQLite". The DEPLOY photo bullet says the bytes live in MySQL, not Neon. Do not change the README scaling note that mentions R2. `config/dtr.php` and the `photo_blobs` comment stop mentioning Neon or PostgreSQL.
- `scripts/docker-entrypoint.sh` already runs `php artisan migrate --force`. No entrypoint change.

## Failure behavior

1. If MySQL is not reachable on `127.0.0.1:3306` as `root` with an empty password, stop. Do not change `.env`.
2. Connect without a schema selected and create `dtrsys` and `dtrsys_testing` if they do not exist.
3. Run the baseline migration and the import with process env overrides: `DB_CONNECTION=mysql`, `DB_DATABASE=dtrsys`, `DB_HOST=127.0.0.1`, `DB_PORT=3306`, `DB_USERNAME=root`, `DB_PASSWORD` empty, `DB_URL` empty. Do not write those values into `.env` yet. The current `DB_DATABASE` file path must not be passed to the MySQL connection.
4. Compare source and target row counts for every copied table. A mismatch, an unknown enum, or a failed insert aborts the command and leaves `.env` on SQLite.
5. Write `.env` to MySQL only after that check passes.
6. Never delete `local.sqlite`.

## Verification

- `dtrsys` has the baseline migration recorded and the copied row counts match `local.sqlite`.
- A login-capable user row from SQLite is present in MySQL with the same id.
- `php artisan test` runs against `dtrsys_testing` and does not touch `dtrsys`.
- Config and docs no longer select `sqlite` or `pgsql` as the app database.
