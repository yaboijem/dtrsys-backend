# DTR System — Backend API

Attendance and time-tracking backend for a multi-branch organization, built with **Laravel 12**. Handles GPS-verified clock-ins with selfie face verification, automated fraud detection, offline sync, role-scoped administration, MFA, and data-privacy compliance (consent, data access/deletion requests, retention purging).

## Feature Checklist

- **Authentication** — employee ID + password (Laravel Sanctum tokens), multi-device login (devices auto-register per employee; shared kiosk devices optional), TOTP MFA for privileged roles (Super Admin / HR / Branch Manager / Department Head)
- **Attendance validation** — GPS radius check against the assigned branch, mandatory selfie per punch, automated face match against a reference photo, liveness/spoof detection, rapid clock-in and impossible location-jump fraud rules
- **Offline sync** — queued batch upload of offline records with server-side validation and fraud re-checks (`sync_logs` trail)
- **Role-based access control** — Super Admin, HR, Branch Manager (own branch), Department Head (own department), Employee (own data)
- **Admin tools** — employee/branch/shift/schedule management, attendance review with selfie streaming, dashboard summary, fraud-flag review
- **Notifications** — per-user inbox with unread count, read/mark-all-read, and delete endpoints
- **Compliance** — biometric/GPS consent management, data access & deletion requests, `dtr:purge-old-data` retention command, audit logging of admin actions and attendance changes

## Stack & Prerequisites

| Layer | Choice |
|---|---|
| Framework | Laravel 12 (PHP 8.4) |
| Database | MySQL 8 (primary), SQLite for tests |
| Cache / Queue | `database` by default; `redis` supported via env |
| Auth | Laravel Sanctum + `spatie/laravel-permission` |
| MFA | `pragmarx/google2fa-laravel`, QR via `bacon/bacon-qr-code` |
| Image processing | `intervention/image` (GD) — selfies downscaled to 1024px JPEG, EXIF stripped |
| Testing | PHPUnit (155 tests) + Laravel Pint |

Requirements: PHP ≥ 8.4 (extensions: `gd`, `intl`, `pdo_mysql`, `openssl`), Composer, MySQL.

## Setup

```bash
composer install
cp .env.example .env        # Windows: copy .env.example .env
php artisan key:generate
```

Configure `.env`:

```dotenv
APP_NAME="DTR System"
APP_URL=http://localhost:8000
APP_TIMEZONE=Asia/Manila

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=dtrsys
DB_USERNAME=root
DB_PASSWORD=

QUEUE_CONNECTION=database
CACHE_STORE=database
```

Then migrate, seed, and serve:

```bash
php artisan migrate
php artisan db:seed
php artisan serve
```

> Background jobs (face verification, notifications) run synchronously in local dev. In production set `QUEUE_CONNECTION=redis` and run `php artisan queue:work`.

## Demo Accounts

All seeded accounts use password `password`.

| Employee ID | Role | Branch | Notes |
|---|---|---|---|
| ADMIN001 | Super Admin | Makati HQ | |
| HR001 | HR | Makati HQ | MFA enabled in dev DB |
| MGR001 | Branch Manager | Makati HQ | MFA enabled in dev DB |
| MGR002 | Branch Manager | QC Branch | |
| DH001 | Department Head | Makati HQ | |
| EMP001–EMP010 | Employee | Makati HQ / QC | |

Seeded branches: `MAK-001` (Makati HQ, 14.554729, 121.0244452, radius 300 m) and `QC-001` (QC Branch).

### MFA in development

Privileged accounts may have MFA enabled. The TOTP secret is stored encrypted in `users.two_factor_secret`; to obtain a current code:

```bash
php artisan tinker --execute="echo (new PragmaRX\Google2FA\Google2FA)->getCurrentOtp(App\Models\User::where('employee_id','HR001')->first()->two_factor_secret);"
```

## API Reference

Base URL: `http://localhost:8000/api`. All responses are JSON; single resources are wrapped in `{ "data": ... }`, lists in `{ "data": [...], "links": ..., "meta": ... }`.

Authentication header: `Authorization: Bearer <token>` (token returned by `/auth/login`, `/auth/mfa/verify`, or `/auth/mfa/enable`).

Rate limits (per minute): `login` 5, `mfa` 5, `attendance` 30, all other authenticated routes 60. Exhausted limits return `429 { code: "too_many_attempts" }`.

### 1. Auth & MFA (public / authenticated)

| Method | Path | Access | Description |
|---|---|---|---|
| POST | `/auth/login` | public | `{ employee_id, password, device_id?, platform?, model?, app_version? }`. Returns token, or `mfa_required` / `mfa_setup_required` with a 10-minute `mfa_token` for privileged roles |
| POST | `/auth/mfa/verify` | public | `{ code, mfa_token, recovery_code? }` → completes login |
| POST | `/auth/mfa/enable` | authenticated | Begins MFA setup → `{ secret, qr_code_data_url, recovery_codes }` (codes shown once, stored hashed) |
| POST | `/auth/mfa/confirm` | authenticated | `{ code, secret? }` → activates MFA |
| POST | `/auth/mfa/disable` | authenticated | `{ password }` → disables MFA |
| GET | `/auth/mfa/status` | authenticated | `{ enabled, confirmed_at }` |
| POST | `/auth/logout` | authenticated | Revokes current token |
| GET | `/auth/me` | authenticated | Current user profile + roles + employee |

### 2. Employee self-service (any authenticated user)

| Method | Path | Description |
|---|---|---|
| POST | `/attendance/time-in` | `{ selfie: file, latitude, longitude, accuracy_meters?, device_id?, is_offline? }` → 201. Runs GPS check, face match, fraud checks |
| POST | `/attendance/time-out` | Same payload. Completes the open punch, computes `work_minutes` (excludes break minutes). Rejects if still on break. |
| POST | `/attendance/break-in` | `{ latitude, longitude, accuracy_meters?, device_id? }` — GPS only (no selfie). One break per open shift. |
| POST | `/attendance/break-out` | Same GPS payload. Sets `break_minutes`, `is_overbreak` if > 60 min. |
| GET | `/attendance/history` | Paginated own records; filters `from`, `to`, `type` (`time_in`/`time_out`/`break_in`/`break_out`), `per_page` |
| POST | `/attendance/sync` | `{ device_id?, records: [{ client_uuid, type, timestamp, latitude, longitude, ... }] }` (max 100). Deduplicates by `client_uuid`, validates each record, re-runs fraud rules |
| GET | `/schedule/today` | Today's shift for the employee |
| GET | `/device/change-requests` | Legacy list of own device change requests (unused by clients) |
| POST | `/device/change-requests` | Legacy create (`new_device_id`, `reason`) — multi-device login no longer requires approval |
| GET | `/notifications` | Inbox, `unread_only` + `per_page` filters |
| GET | `/notifications/unread-count` | `{ count }` |
| POST | `/notifications/{id}/read` | Marks one notification read (own only) |
| POST | `/notifications/read-all` | `{ marked }` |
| GET | `/employee/consent` | Current consents |
| POST | `/employee/consent` | `{ type: "biometric_photos"|"gps_location", granted: bool }` — grants/revokes, audited |

### 3. Admin — Super Admin, HR

| Method | Path | Description |
|---|---|---|
| GET | `/admin/branches` · POST `/admin/branches` · GET/PUT/DELETE `/admin/branches/{branch}` | Branch CRUD (`{ name, code, address?, latitude, longitude, radius_meters, is_active? }`). Delete is blocked while employees exist (`branch_has_employees`) |
| GET | `/admin/shifts` · POST `/admin/shifts` · GET/PUT/DELETE `/admin/shifts/{shift}` | Shift CRUD (`{ name, start_time, end_time, grace_minutes?, break_start?, break_end?, is_active? }`). Delete blocked while assigned (`shift_in_use`) |
| GET/POST | `/admin/employees` · GET/PUT/DELETE `/admin/employees/{employee}` | Employee CRUD (`{ employee_id, name, email, password, role, branch_id, first_name, last_name, department, position, date_hired?, is_active? }`). Delete blocks accounts with attendance history |
| POST | `/admin/employees/{employee}/reference-photo` | `{ photo: file }` (jpeg/png, ≤ 5 MB) — compressed and stored, audited |
| POST | `/admin/schedules` | `{ employee_id, date, shift_id }` — upserts per employee+date |
| DELETE | `/admin/schedules/{schedule}` | Removes an assignment |
| GET | `/admin/device-change-requests` | All requests, status filter |
| PATCH | `/admin/device-change-requests/{id}` | `{ status: "approved"|"rejected", notes? }` — approves and links the device |
| GET | `/admin/audit-logs` | Audit trail, filters (`action`, `model_type`, `model_id`, `user_id`, `from`, `to`) |

### 4. Admin — Super Admin, HR, Branch Manager

| Method | Path | Description |
|---|---|---|
| GET | `/admin/fraud-flags` | Auto-flagged records; filters `status`, `type`, `severity`, `branch_id` |
| POST | `/admin/fraud-flags/{id}/review` | `{ status: "reviewed"|"dismissed", notes? }` — audited |

### 5. Admin — Super Admin, HR, Branch Manager, Department Head

| Method | Path | Description |
|---|---|---|
| GET | `/admin/attendance` | Attendance records scoped to own branch (BM) / department (DH); filters `branch_id`, `department`, `from`, `to`, `status`, `has_open_flags`, `per_page` |
| GET | `/admin/attendance/{id}/photo` | Streams the punch selfie (access-checked) |
| GET | `/admin/dashboard/summary` | `{ time_ins, late, absent, open_fraud_flags, pending_device_change_requests }` |
| GET | `/admin/schedules` | Schedules scoped by role, date filters |

## Error Codes

Errors use `{ "message": "...", "code": "..." }` with an appropriate HTTP status:

| HTTP | Code | Meaning |
|---|---|---|
| 401 | `unauthenticated` | Missing/invalid bearer token |
| 403 | `forbidden` | Role not permitted (`spatie` middleware) |

| 404 | `not_found` | Resource not found / not yours |
| 404 | `no_employee_record` | Account has no employee record |
| 409 | `attendance_conflict` | Already clocked in / no open punch |
| 409 | `branch_has_employees` / `shift_in_use` | Referential delete blocked |
| 422 | `gps_out_of_range` | Outside assigned branch radius (with `details`) |
| 422 | `face_verification_failed` | Selfie did not match reference (with `details`) |
| 422 | `no_schedule` | No assigned shift for today |
| 429 | `too_many_attempts` | Rate limit hit |
| 422 | (validation) | Default Laravel validation errors under `errors` |

## Artisan Commands

```bash
# Purge data older than the retention period (default 730 days each)
php artisan dtr:purge-old-data                      # uses config values
php artisan dtr:purge-old-data --days=365           # override attendance cutoff
php artisan dtr:purge-old-data --audit-days=365     # override audit-log cutoff
php artisan dtr:purge-old-data --dry-run            # preview counts, delete nothing
```

Retention defaults are configurable via env: `RETENTION_ATTENDANCE_DAYS`, `RETENTION_AUDIT_DAYS`.

## Testing & Code Style

```bash
php artisan test        # 155 tests (unit + feature, in-memory SQLite)
vendor/bin/pint         # auto-fix code style
vendor/bin/pint --test  # style check
```

## Deployment Notes

**Free-tier production (Render + Neon + R2):** see **[docs/DEPLOY.md](docs/DEPLOY.md)** on branch `Deploy-v1.0`.

Summary of free defaults:

- Employee PWA + API: one Render **Docker** web service (`Dockerfile`)
- Admin: Render **Static Site** with `VITE_API_URL` pointing at the API
- DB: Neon PostgreSQL (`DB_URL`)
- Photos: Cloudflare R2 (`ATTENDANCE_PHOTO_DISK=s3`)
- No paid Redis/worker: `QUEUE_CONNECTION=sync`, `CACHE_STORE=database`, `ATTENDANCE_ASYNC_FACE=false`

When scaling later:

- **Queue / cache**: `QUEUE_CONNECTION=redis`, `CACHE_STORE=redis`, background `queue:work`
- **Media**: keep R2/S3; selfies pre-compressed (max 1024 px JPEG), EXIF stripped
- **Security**: HTTPS, `APP_DEBUG=false`, `APP_KEY`, rate limits (`login`, `mfa`, `attendance`, `api`)
- **CORS**: `CORS_ALLOWED_ORIGINS` must include the admin static origin

### Scale runbook (~1000 concurrent punches)

Before a shift-start load test or production go-live at this scale:

1. **Redis up** — `CACHE_STORE=redis`, `QUEUE_CONNECTION=redis`, `SESSION_DRIVER=redis` (if sessions used). Locks and rate limiters depend on Redis under load.
2. **Queue workers on `attendance`** — run enough workers, e.g. `php artisan queue:work redis --queue=attendance,default --tries=3` (or Horizon supervising the same queues). Face verify and fraud fan-out land here.
3. **MySQL** — raise `max_connections` above `(app servers × PHP workers) + queue workers + admin headroom`. Prefer InnoDB; watch slow query log on `attendance` indexes.
4. **Object storage** — production: `ATTENDANCE_PHOTO_DISK=s3` (or R2-compatible). Local/staging may use `public` disk; ensure disk I/O and permissions will not bottleneck selfie writes.
5. **Async face on** — `ATTENDANCE_ASYNC_FACE=true` (or project env equivalent) so live punches return quickly and verification runs on the queue.
6. **Telescope off** — `TELESCOPE_ENABLED=false` (do not run Telescope in production load paths; it amplifies DB/write cost).
7. **App hardening** — `APP_DEBUG=false`, HTTPS only, adequate PHP-FPM/Octane workers (see sizing note above).

### Load test (k6)

Script: [`scripts/load/punch-storm.k6.js`](scripts/load/punch-storm.k6.js) — ramps to 1000 VUs posting multipart `POST /api/attendance/time-in` with a tiny JPEG + branch GPS. Thresholds: `<1%` failed requests, p95 `<3s`.

```bash
# Install k6: https://k6.io/docs/get-started/installation/
# Prefer a pre-issued Sanctum token (one employee or a pool) so login is not part of the storm.

k6 run \
  -e BASE_URL=https://api.example.com \
  -e TOKEN="<sanctum-token>" \
  -e LAT=14.554729 \
  -e LNG=121.0244452 \
  scripts/load/punch-storm.k6.js
```

Optional env: `LOGIN_EMPLOYEE_ID` / `LOGIN_PASSWORD` if `TOKEN` is omitted (each VU logs in once — not ideal for pure punch load).

**Reconnect storm:** the script documents a second scenario (`syncStorm`) — 1000 VUs each calling `POST /api/attendance/sync` with one offline record. Uncomment that scenario in the k6 file; reconnect storms are often harder than live punches (batch validation + photos + fraud re-checks).

## Repository Layout

```
app/Console/Commands/PurgeRetainedData.php   # retention purge
app/Services/                                # business logic (attendance, gps, sync, fraud, mfa, reports, ...)
app/Http/Controllers/Api/                    # REST controllers (employee + admin)
app/Http/Requests/                           # form requests / validation
app/Http/Resources/                          # JSON resources
app/Support/ScopesByRole.php                 # role-scoping trait
app/Notifications/GenericNotification.php    # database notifications
database/seeders/                            # demo data (roles, branches, employees, devices, shifts)
scripts/acceptance.ps1                       # end-to-end acceptance smoke script
tests/                                       # PHPUnit suites
```
