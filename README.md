# DTR System — Backend API

Attendance and time-tracking backend for a multi-branch organization, built with **Laravel 12**. Handles GPS-verified clock-ins with selfie face verification, automated fraud detection, offline sync, role-scoped administration, payroll/report exports, MFA, and data-privacy compliance (consent, data access/deletion requests, retention purging).

## Feature Checklist

- **Authentication** — employee ID + password (Laravel Sanctum tokens), device registration on first login, device change request/approval flow, TOTP MFA for privileged roles (Super Admin / HR / Payroll Officer / Branch Manager / Department Head)
- **Attendance validation** — GPS radius check against the assigned branch, mandatory selfie per punch, automated face match against a reference photo, liveness/spoof detection, rapid clock-in and impossible location-jump fraud rules
- **Offline sync** — queued batch upload of offline records with server-side validation and fraud re-checks (`sync_logs` trail)
- **Role-based access control** — Super Admin, HR, Payroll Officer, Branch Manager (own branch), Department Head (own department), Employee (own data)
- **Admin tools** — employee/branch/shift/schedule management, attendance review with selfie streaming, dashboard summary, fraud-flag review, device change request review
- **Reports & exports** — async daily/monthly report exports and payroll CSV exports with role-scoped visibility, delivered via in-app notifications
- **Notifications** — per-user inbox with unread count and read/mark-all-read endpoints
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

> Background jobs (report generation, notifications) run synchronously in local dev. In production set `QUEUE_CONNECTION=redis` and run `php artisan queue:work`.

## Demo Accounts

All seeded accounts use password `password`.

| Employee ID | Role | Branch | Notes |
|---|---|---|---|
| ADMIN001 | Super Admin | Makati HQ | |
| HR001 | HR | Makati HQ | MFA enabled in dev DB |
| PAY001 | Payroll Officer | Makati HQ | |
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
| POST | `/attendance/time-out` | Same payload. Completes the open punch, computes `work_minutes` |
| GET | `/attendance/history` | Paginated own records; filters `from`, `to`, `type`, `per_page` |
| POST | `/attendance/sync` | `{ device_id?, records: [{ client_uuid, type, timestamp, latitude, longitude, ... }] }` (max 100). Deduplicates by `client_uuid`, validates each record, re-runs fraud rules |
| GET | `/schedule` | Own schedules (paginated, date filters) |
| GET | `/schedule/today` | Today's shift for the employee |
| GET | `/device/change-requests` | Own device change requests |
| POST | `/device/change-requests` | `{ device_id, platform?, model?, app_version? }` |
| GET | `/notifications` | Inbox, `unread_only` + `per_page` filters |
| GET | `/notifications/unread-count` | `{ count }` |
| POST | `/notifications/{id}/read` | Marks one notification read (own only) |
| POST | `/notifications/read-all` | `{ marked }` |
| GET | `/employee/consent` | Current consents |
| POST | `/employee/consent` | `{ type: "biometric_photos"|"gps_location", granted: bool }` — grants/revokes, audited |
| GET | `/employee/data-requests` | Own data requests |
| POST | `/employee/data-requests` | `{ type: "access"|"deletion" }` — access completes immediately and returns the full personal-data export inline; deletion stays `pending` for HR review |

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
| GET | `/admin/data-requests` | All access/deletion requests, `status`/`type` filters |
| PATCH | `/admin/data-requests/{id}` | `{ status: "completed"|"rejected", notes? }` — audited |

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

### 6. Admin — Super Admin, HR, Payroll Officer

| Method | Path | Description |
|---|---|---|
| GET/POST | `/admin/payroll-exports` | List / request `{ date_from, date_to, filters? }` — async, notifies when ready |
| GET | `/admin/payroll-exports/{id}` | Export status |
| GET | `/admin/payroll-exports/{id}/download` | CSV download (`409 export_not_ready` if pending) |

### 7. Reports — Super Admin, HR, Payroll Officer, Branch Manager, Department Head

| Method | Path | Description |
|---|---|---|
| GET | `/admin/reports` | Own exports (Super Admin/HR/Payroll Officer see all); filters `status`, `type` |
| POST | `/admin/reports` | `{ type: "daily"|"monthly", date_from, date_to, filters?: { branch_id?, department? } }` (range ≤ 31 days) → 202, async |
| GET | `/admin/reports/{id}` | Export status/details |
| GET | `/admin/reports/{id}/download` | CSV download (`409 export_not_ready` if not ready) |

## Error Codes

Errors use `{ "message": "...", "code": "..." }` with an appropriate HTTP status:

| HTTP | Code | Meaning |
|---|---|---|
| 401 | `unauthenticated` | Missing/invalid bearer token |
| 403 | `forbidden` | Role not permitted (`spatie` middleware) |
| 403 | `device_not_registered` | Unregistered device; includes `pending_device_change_request` flag |
| 404 | `not_found` | Resource not found / not yours |
| 404 | `no_employee_record` | Account has no employee record |
| 409 | `attendance_conflict` | Already clocked in / no open punch |
| 409 | `export_not_ready` | Export still pending |
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

All scalability options are env-driven and require no code changes:

- **Queue**: set `QUEUE_CONNECTION=redis` (optionally add Laravel Horizon) for background exports and sync batches
- **Cache**: `CACHE_STORE=redis`
- **Media**: `ATTENDANCE_PHOTO_DISK=s3` with S3/R2-compatible credentials; selfies are pre-compressed (max 1024 px JPEG) and EXIF-stripped
- **Security**: serve behind HTTPS, set `APP_DEBUG=false`, configure `APP_KEY`, and rate limits are active by default (`login`, `mfa`, `attendance`, `api`)
- **Read replicas**: set `DB_READ_HOST`/`DB_READ_DATABASE` per Laravel read/write connection config

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
