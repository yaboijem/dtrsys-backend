# DTR System — Feature Inventory

**Product:** Daily Time Record (DTR) — multi-branch attendance with GPS and face verification, offline sync, role-based administration, and privacy controls.

**Surfaces:**

| Surface | Stack | Path |
|---------|--------|------|
| Backend API | Laravel 12 (PHP 8.4) | `app/`, `routes/api.php` |
| Employee portal | React + Vite PWA | `portal/` |
| Employee mobile | Expo / React Native | `frontend/` |
| Web admin | React + Vite | `web/` |

Timezone: **Asia/Manila**.

**Out of scope (removed):** async report CSV exports, payroll CSV exports, and the Payroll Officer role.

---

## 1. Authentication & identity

| Feature | Details |
|---------|---------|
| Login | Employee ID + password → Sanctum bearer token |
| Multi-device | Devices auto-register on login (`device_id`, platform, model, app version); shared/kiosk devices supported |
| Inactive accounts | Deactivated users cannot log in |
| TOTP MFA | Optional MFA stack (enable / confirm / verify / disable / status); privileged roles flagged via `mfa_required_by_role` |
| MFA recovery | Hashed one-time recovery codes |
| Session | Logout revokes current token; `GET /auth/me` returns user + roles + employee + branch |
| Rate limits | Login 5/min, MFA 5/min, general authenticated API 60/min |

### API

| Method | Path | Access |
|--------|------|--------|
| POST | `/api/auth/login` | Public |
| POST | `/api/auth/mfa/verify` | Public |
| POST | `/api/auth/mfa/enable` | MFA setup flow |
| POST | `/api/auth/mfa/confirm` | MFA setup flow |
| GET | `/api/auth/mfa/status` | Authenticated |
| POST | `/api/auth/mfa/disable` | Authenticated |
| POST | `/api/auth/logout` | Authenticated |
| GET | `/api/auth/me` | Authenticated |

---

## 2. Attendance (core punch loop)

| Feature | Details |
|---------|---------|
| **Time In** | Selfie + GPS required; opens a shift; late flag vs schedule/grace |
| **Time Out** | Selfie + GPS; closes open punch; computes `work_minutes` (excludes break); blocked if still on break; early-timeout flag |
| **Break In** | GPS only (no selfie); one break per open shift |
| **Break Out** | GPS; sets `break_minutes`; `is_overbreak` if break exceeds 60 minutes |
| GPS validation | Haversine vs assigned branch lat/lng + `radius_meters`; optional accuracy |
| Face verification | Selfie vs employee reference photo; liveness/spoof signals; mock or real provider |
| Photo pipeline | Compress ≤1024px JPEG, strip EXIF; store on local or S3-compatible disk |
| Async face | Optional queue job (`VerifyAttendancePhotoJob`) so live punches return quickly |
| Employee locking | Per-employee lock prevents concurrent punch races |
| Client UUID | Optional online idempotency; required for offline sync dedupe |
| Schedule gate | Punch requires an assigned shift for the day (`no_schedule`) |
| Conflict rules | Already clocked in / no open punch → `attendance_conflict` |
| History | Own records; filters `from`, `to`, `type`, pagination |
| Rate limit | Attendance 30/min; sync has a separate throttle |

### API

| Method | Path | Notes |
|--------|------|--------|
| POST | `/api/attendance/time-in` | Multipart selfie + GPS |
| POST | `/api/attendance/time-out` | Multipart selfie + GPS |
| POST | `/api/attendance/break-in` | GPS payload |
| POST | `/api/attendance/break-out` | GPS payload |
| GET | `/api/attendance/history` | Own records |
| POST | `/api/attendance/sync` | Offline batch (max 100; lower with photos) |

---

## 3. Offline sync

| Feature | Details |
|---------|---------|
| Batch sync | Up to 100 records with optional photos per request |
| Client UUID | Idempotent dedupe by `client_uuid` |
| Ordered apply | Timestamp-ordered transitions (time_in → break → time_out) |
| Re-validation | GPS, face, and fraud checks re-run on sync |
| Sync trail | `sync_logs` records outcomes |
| Portal queue | IndexedDB (legacy localStorage fallback); selfie attached; auto-flush on reconnect; manual “Sync now” |
| Mobile queue | Parallel offline queue on Expo app |

---

## 4. Fraud detection

Automated flags evaluated on punches (live and sync):

| Flag type | Meaning |
|-----------|---------|
| Out of radius | GPS outside branch geofence |
| Face mismatch | Selfie did not match reference |
| No face | Face not detected in selfie |
| Impossible jump | Unrealistic travel speed between punches |
| Rapid clock | Suspiciously fast clock cycles |
| GPS spoof | Spoof / accuracy signals |

**Admin review:** Super Admin, HR, Branch Manager list flags and mark `reviewed` / `dismissed` with notes (audited). New flags can notify HR via `NotifyFraudFlagJob`.

| Method | Path | Roles |
|--------|------|--------|
| GET | `/api/admin/fraud-flags` | Super Admin, HR, Branch Manager |
| POST | `/api/admin/fraud-flags/{id}/review` | Super Admin, HR, Branch Manager |

---

## 5. Schedules & shifts

| Feature | Details |
|---------|---------|
| Shifts | Name, start/end, grace minutes, optional break window, active flag |
| Schedules | Assign employee + date + shift (upsert); delete assignment |
| Today’s shift | Employee `GET /api/schedule/today` |
| Schedule range | Employee `GET /api/schedule`; admin list with role scope and filters |
| Derived client metrics | Late, early timeout, shift progress % |

### API

| Method | Path | Access |
|--------|------|--------|
| GET | `/api/schedule` | Authenticated employee |
| GET | `/api/schedule/today` | Authenticated employee |
| GET | `/api/admin/schedules` | Super Admin, HR, Branch Manager, Department Head |
| POST | `/api/admin/schedules` | Super Admin, HR |
| DELETE | `/api/admin/schedules/{schedule}` | Super Admin, HR |

---

## 6. Organization master data (admin)

| Resource | Operations | Roles |
|----------|------------|--------|
| **Branches** | CRUD (name, code, address, lat/lng, radius, active). Delete blocked while employees exist | Super Admin, HR |
| **Shifts** | CRUD. Delete blocked while assigned | Super Admin, HR |
| **Employees** | CRUD (employee_id, name, email, password, role, branch, department, position, hire date, active). Deactivate account; optional device name / shared flag on update | Super Admin, HR |
| **Reference photo** | Upload + stream for face matching | Super Admin, HR |
| **Device change requests** | List + approve/reject (legacy API; multi-device login no longer requires approval) | Super Admin, HR |

### API (prefix `/api/admin`)

| Resource | Methods |
|----------|---------|
| `branches` | GET, POST, GET/{id}, PUT/{id}, DELETE/{id} |
| `shifts` | GET, POST, GET/{id}, PUT/{id}, DELETE/{id} |
| `employees` | GET, POST, GET/{id}, PUT/{id}, DELETE/{id} |
| `employees/{id}/reference-photo` | POST (upload), GET (stream) |
| `device-change-requests` | GET, PATCH/{id} |
| `audit-logs` | GET |

Employee self-service (legacy):

| Method | Path |
|--------|------|
| GET | `/api/device/change-requests` |
| POST | `/api/device/change-requests` |

---

## 7. Roles & access scope

| Role | Access summary |
|------|----------------|
| **Super Admin** | Full admin |
| **HR** | Org admin: branches, employees, schedules, fraud, audit, dashboard |
| **Branch Manager** | Own branch: dashboard, attendance, fraud, schedules (read) |
| **Department Head** | Own department: dashboard, attendance, schedules (read) |
| **Employee** | Own punches, history, schedule, alerts, consent |

Roles seeded: Super Admin, HR, Branch Manager, Department Head, Employee.

Middleware: `spatie/laravel-permission`. Query scoping: `ScopesByRole`.

---

## 8. Admin dashboard & attendance review

| Feature | Details |
|---------|---------|
| Dashboard summary | Time-ins / late / early timeouts / absent (today vs yesterday); open fraud flags by severity |
| Attendance list | Role-scoped; filters branch, employee, type, dates, late, early timeout, source, open flags |
| Punch selfie | Stream photo for a record (access-checked) |
| Audit logs | Filter by action, model, user, date range; recent activity on dashboard (HR/Super Admin) |

### API

| Method | Path | Roles |
|--------|------|--------|
| GET | `/api/admin/dashboard/summary` | Super Admin, HR, Branch Manager, Department Head |
| GET | `/api/admin/attendance` | Super Admin, HR, Branch Manager, Department Head |
| GET | `/api/admin/attendance/{id}/photo` | Super Admin, HR, Branch Manager, Department Head |
| GET | `/api/admin/audit-logs` | Super Admin, HR |

---

## 9. Notifications (alerts)

| Feature | Details |
|---------|---------|
| Inbox | Paginated list; `unread_only` filter |
| Unread count | Client badge |
| Mark read | Single notification (owner only) |
| Mark all read | Bulk mark unread as read |
| Delete one | Hard delete (owner only) |
| Clear all | Hard delete all for current user |

### Notification triggers

- Fraud flag created  
- Device change request reviewed  
- Break warning (open break approaching limit)  
- Overbreak (open break past 60 minutes)  

### API

| Method | Path |
|--------|------|
| GET | `/api/notifications` |
| GET | `/api/notifications/unread-count` |
| POST | `/api/notifications/{id}/read` |
| POST | `/api/notifications/read-all` |
| DELETE | `/api/notifications/{id}` |
| DELETE | `/api/notifications` |

---

## 10. Privacy & compliance

| Feature | Details |
|---------|---------|
| Consent | Grant/revoke **biometric photos** and **GPS location**; audited |
| Retention purge | `php artisan dtr:purge-old-data` (attendance + audit cutoffs; `--dry-run`) |
| Env cutoffs | `RETENTION_ATTENDANCE_DAYS`, `RETENTION_AUDIT_DAYS` |
| Audit service | Records admin create/change/delete and sensitive actions |
| Break monitor | `php artisan` open-break check → warning / overbreak notifications |

### API

| Method | Path |
|--------|------|
| GET | `/api/employee/consent` |
| POST | `/api/employee/consent` |

---

## 11. Employee portal (`portal/`)

Installable Progressive Web App for employees.

| Screen | Capabilities |
|--------|----------------|
| **Login / MFA** | Employee ID + password; MFA screen; theme toggle; session restore |
| **Home** | GPS status; Time In / Time Out (camera selfie, client-side compress); Break In / Break Out; today’s schedule (shift, grace, start/end, progress); compact today’s punches with Activity / Time / **Duration** columns; offline queue + sync; result stamp |
| **History** | Attendance history with filters and tags (offline, late, etc.) |
| **Alerts** | Grouped inbox; mark read / mark all read; per-alert trash + clear all via `ConfirmModal`; unread badge |
| **More** | Profile (department, branch, position, roles); MFA status; consent link; light / dark / system theme; logout via `ConfirmModal` |
| **Consent** | Biometric + GPS toggles |
| **PWA** | Manifest, service worker, offline shell banner, install prompt, IndexedDB offline punch queue |

Routes: `/login`, `/mfa`, `/home`, `/history`, `/alerts`, `/more`, `/more/consent`.

Shared UI: `ConfirmModal`, `ThemeToggle`, `CameraModal`, `TabBar`, `PwaChrome`.

---

## 12. Employee mobile (`frontend/`)

Expo / React Native app parallel to the portal:

- Login, MFA  
- Home (punch + schedule + offline queue)  
- History  
- Notifications  
- More (profile, consent, config as implemented)  
- Consent  

Designed for field use: one-handed targets, offline-first punches, high contrast.

---

## 13. Web admin (`web/`)

| Page | Roles | Notable UI |
|------|--------|------------|
| Login / MFA | Privileged users | — |
| Dashboard | Super Admin, HR, Branch Manager, Department Head | Metrics + day-over-day deltas; fraud severity; recent audit activity |
| Attendance | Super Admin, HR, Branch Manager, Department Head | Filters; searchable **EmployeePicker**; selfie / map drawer |
| Fraud flags | Super Admin, HR, Branch Manager | Resolve / dismiss; drawer with selfie + reference photo; severity filters |
| Employees | Super Admin, HR | Search; create/edit; reference photo; deactivate; device name / shared |
| Branches | Super Admin, HR | CRUD + map location picker |
| Shifts | Super Admin, HR | CRUD |
| Schedules | Super Admin, HR, Branch Manager, Department Head | List + week view; searchable employee filter; add schedule; **bulk assign** via multi `EmployeePicker` |

Shared UI: `EmployeePicker` (typeahead single/multi), `DataTable`, drawers, toasts, photo viewer, location map.

---

## 14. Platform, ops & tooling

| Area | Details |
|------|---------|
| Queue jobs | `VerifyAttendancePhotoJob`, `NotifyFraudFlagJob` |
| Cache / locks | Database default; Redis supported for scale |
| Media disk | Local or S3/R2-compatible (`ATTENDANCE_PHOTO_DISK`) |
| Security | HTTPS, rate limits, `APP_DEBUG=false` in production |
| Load testing | `scripts/load/punch-storm.k6.js` (live punch + optional sync storm) |
| Demo data | Seeded roles, branches (Makati HQ, QC), employees, shifts |
| Tests | PHPUnit feature/unit suite |
| Style | Laravel Pint |
| Retention CLI | `dtr:purge-old-data` |
| Break CLI | Open-break warning / overbreak notifications (`CheckOpenBreaks`) |

### Key services (`app/Services/`)

| Service | Responsibility |
|---------|----------------|
| `AuthService` / `MfaService` | Login, MFA tokens, recovery codes |
| `DeviceService` | Device resolve/register on login |
| `AttendanceService` | Time in/out, break in/out, late/work minutes, photo capture |
| `GPSService` | Distance and geofence verify |
| `FaceVerificationService` (+ mock) | Selfie match |
| `FraudDetectionService` | Automated fraud rules |
| `SyncService` | Offline batch apply |
| `ScheduleService` | Shift for date / week |
| `NotificationService` | In-app database notifications |
| `AuditService` | Audit log writes |
| `ImageService` | Compress and store images |

### Domain models

`User`, `Employee`, `Branch`, `Shift`, `Schedule`, `Attendance`, `AttendancePhoto`, `GpsLocation`, `Device`, `DeviceChangeRequest`, `FraudFlag`, `Consent`, `AuditLog`, `SyncLog`.

---

## 15. Architecture snapshot

```
Employees (portal PWA / mobile Expo)
        │
        ▼
   Sanctum API  ──► Attendance / GPS / Face / Fraud / Sync services
        │                      │
        │                      ▼
        │                   MySQL (+ Redis optional)
        │                      │
Admins (web)  ─────────────────┘
        │
Background workers: face verify, fraud notify, break checks
```

Portal is also deployable as the Laravel public SPA shell (`public/index.html` via `scripts/deploy-portal.mjs`).

---

## 16. Common error codes

| HTTP | Code | Meaning |
|------|------|---------|
| 401 | `unauthenticated` | Missing/invalid bearer token |
| 403 | `forbidden` | Role not permitted |
| 403 | `device_not_registered` | Device blocked (legacy path) |
| 403 | `not_authorized` | Cannot review this fraud flag |
| 404 | `not_found` | Resource missing or not owned |
| 404 | `no_employee_record` | Account has no employee row |
| 409 | `attendance_conflict` | Invalid punch state |
| 409 | `branch_has_employees` / `shift_in_use` | Referential delete blocked |
| 422 | `gps_out_of_range` | Outside branch radius |
| 422 | `face_verification_failed` | Selfie mismatch |
| 422 | `no_schedule` | No shift for today |
| 429 | `too_many_attempts` | Rate limit |

---

## Related docs

- [README.md](../README.md) — setup, API tables, deployment  
- [PRODUCT.md](../PRODUCT.md) — product purpose and principles  
- `docs/superpowers/specs/` — design specs for portal PWA, admin, notifications, etc.  
