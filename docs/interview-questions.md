# Senior Developer Technical Interview — Q&A (DTR System)

Questions and model answers grounded in this repository (Laravel 12 attendance/time-tracking backend). Each answer references the actual implementation so you can study the code directly.

---

## 1. Architecture & Design

### Q1. Walk me through the architecture of this system. Why a services layer instead of fat controllers?

The system is a REST API (Laravel 12 + Sanctum) with thin controllers that only translate HTTP into service calls. Business logic lives in `app/Services/` (`AttendanceService`, `SyncService`, `FraudDetectionService`, `GPSService`, `MfaService`, ...).

Reasons:

- **Reuse across entry points.** `AttendanceService` is called by the HTTP controller *and* composed inside `SyncService` (`app/Services/SyncService.php:24`). `CheckOpenBreaks` uses `NotificationService` directly from a scheduler command. Fat controllers would duplicate this.
- **Testability.** Services are plain classes with constructor injection — unit tests can instantiate them with mocks (`tests/Unit/FraudDetectionServiceTest.php`) without HTTP.
- **Transactional integrity in one place.** The service owns the `DB::transaction` + lock discipline, so every caller gets the same guarantees.

### Q2. How would you scale `POST /attendance/time-in` to 1000 concurrent punches (shift-start rush)?

The repo already has a runbook (README "Scale runbook", `scripts/load/punch-storm.k6.js`):

1. **Queue heavy side-effects** — fraud notifications and similar work run on the queue so punch requests return quickly.
2. **Redis for locks + rate limiters + cache** (`CACHE_STORE=redis`). The per-employee `Cache::lock` must not be the DB.
3. **Queue workers on the `attendance` queue** — `php artisan queue:work redis --queue=attendance,default`.
4. **Database headroom** — InnoDB, raised `max_connections`, index on `(employee_id, type, timestamp)` (migration `2026_08_05_180000`).
5. **No Telescope in the load path** (it amplifies DB writes).
6. **Object storage** for selfies (`ATTENDANCE_PHOTO_DISK=s3`); pre-compressed 1024px JPEG + EXIF stripped so uploads are small.

The k6 script ramps 1000 VUs posting multipart time-ins with thresholds `<1%` failures, p95 `<3s`.

---

## 2. Concurrency & Consistency

### Q3. What concurrency problem does `withEmployeeLock` solve, and how does it work?

**Problem:** double clock-in. Two devices (or a retry + the phone) submitting `time-in` for the same employee simultaneously — both pass the "no open punch" check, both insert.

**Solution** (`AttendanceService.php:160`):

```php
$lock = Cache::lock('attendance:employee:'.$employee->id, 15);
$lock->block(5);   // wait up to 5s
// ... inside: idempotency check + DB::transaction
// finally: $lock->release();
```

- Key is **per employee**, so different employees never contend.
- TTL 15s is a dead-lock safety net; `block(5)` handles normal contention.
- The lock **wraps the whole unit of work** (GPS verify → punch insert → photo → fraud checks), so state transitions are serialized.
- `SyncService::sync` uses the **same lock key**, so an offline batch can't interleave with a live punch.

### Q4. How is idempotency handled for punches?

A client-generated `client_uuid` is stored in the unique `attendance.uuid` column.

- **Live punches** (`withEmployeeLock`): if a record with the same `uuid` + `employee_id` exists, return it instead of creating (`AttendanceService.php:175`). Handles network retries where the first request actually succeeded.
- **Offline sync** (`SyncService.php:170`): `client_uuid` is mandatory per record; if it exists anywhere, the record is skipped and reported as `status: "duplicate"` — the client then deletes it from its queue.
- Idempotency check runs **inside the lock** to avoid a TOCTOU race between check and insert.

### Q5. The app maintains no "open punch" status column. `openTimeInAsOf` replays the punch sequence instead. Why?

`AttendanceService.php:376` loads all `time_in`/`time_out` punches up to a point in time, walks them in `(timestamp, id)` order, and derives whether a session is open.

Why not a boolean column?

- **Overnight shifts** — a session can span calendar days, so "clocked in today" is the wrong question; "open as of time T" is the correct one.
- **Late offline syncs** — a time-out synced hours late, or an old time-in arriving after the session closed, must not create phantom open sessions or second clock-ins.
- **No denormalized state to drift.** The punch log is the single source of truth; the derivation is always consistent with what auditors see.
- The same logic powers offline validation, where each record is checked *as of its own timestamp* (`SyncService` → `assertTransitionAllowed`).

---

## 3. Offline Sync

### Q6. Describe the offline sync design and its failure handling.

`SyncService::sync` (batch, max 100 records, photos only on the first 5 — `config/dtr.php`):

1. Acquire the **same per-employee lock** as live punches.
2. **Sort records by timestamp** (`orderRecordsByTimestamp`) — a break-in must be applied after its time-in, even if the client queued them in a different order.
3. **Per-record processing with try/catch** — one bad record (future timestamp, missing GPS, invalid transition) doesn't fail the whole batch; it's reported as `status: "failed"` with the message.
4. Each record re-runs **GPS validation and fraud rules server-side** — the server never trusts the device; offline punches are marked `is_offline = true`.
5. Results are re-sorted by the **original client index** (`usort` by `index`) so the client can reconcile per-record.
6. A `sync_logs` row records the outcome (`success` / `partial` / `failed`) as an audit trail.

### Q7. Why must records be re-validated server-side when the client already checked them?

The device is untrusted and the client clock may be wrong:

- A `timestamp` in the future is rejected (`SyncService.php:181`).
- GPS is re-verified against the branch radius with the stored branch coordinates.
- Transition rules are re-checked **as of the record's own timestamp** (`assertTransitionAllowed`), e.g. a `time_out` with no open time-in fails.
- Fraud rules run again and can flag offline punches (e.g. `impossible_jump` — an employee can't physically move 200 km between two punches 5 minutes apart, even if both were individually in range).

---

## 4. Fraud Detection & Security

### Q8. What fraud rules exist and how are they scored?

`FraudDetectionService::evaluate` runs six rules on every punch (live and synced):

| Rule | Severity | Logic |
|---|---|---|
| `out_of_radius` | medium | GPS point outside branch radius (from stored `gps_locations.is_within_radius`) |

| `impossible_jump` | high | Travel speed between consecutive GPS points > 120 km/h (`config('dtr.gps.speed_threshold_kmh')`) |
| `rapid_clock` | medium | Same punch type within 1 minute of the previous one |
| `gps_spoof` | low | Two consecutive punches report byte-identical coordinates |

Flags are **idempotent** — `flag()` looks up `(attendance_id, type)` before inserting — and a notification fires only when the flag `wasRecentlyCreated`. Flags are reviewable (`/admin/fraud-flags/{id}/review`), with the reviewer audited.

### Q9. How is GPS validated, and why add `accuracy_meters` to the radius?

`GPSService::verify` uses the **haversine formula** (`GPSService.php:9`) to compute distance between the punch and the branch.

Effective radius = `branch.radius_meters + accuracy_meters`. GPS hardware reports a confidence circle: an accuracy of 30 m means the true position is likely within 30 m of the reported point. A device legitimately near the edge would otherwise be rejected — the accuracy padding compensates for receiver error while still bounding where a punch can come from.

### Q10. Why does `ScopesByRole` fall back to `whereRaw('1 = 0')`?

`app/Support/ScopesByRole.php` — Super Admin/HR see everything; Branch Manager is scoped to their `branch_id` (supporting `whereHas` via a dotted `relation.column`); Department Head scopes via the employee's department.

The `1 = 0` fallback is **defense in depth**: if a role is missing its `employee` record (broken data), the query returns *nothing*, not *everything*. A misconfigured account must fail closed. The same principle appears in `AttendanceAdminController::canView` — every access check is explicit, including the photo stream.

### Q11. Why does the selfie endpoint stream through a checked controller instead of exposing a URL?

`GET /admin/attendance/{id}/photo` (`AttendanceAdminController.php:43`):

- `canView()` re-checks role + branch/department ownership on every request — a URL alone could be shared/leaked.
- `PhotoStorage::response()` streams the file; the storage path (R2/S3) never leaks to the client.
- Photos are biometric PII, so there's an audit + consent layer around them (`consents` table, `employee/consent` endpoints).

---

## 5. Auth & MFA

### Q12. Walk through the MFA login flow. How is the `mfa_token` secured?

1. `POST /auth/login` → if the user is privileged and has MFA configured, return `mfa_required` plus a 10-minute `mfa_token`.
2. `POST /auth/mfa/verify` with `code` or `recovery_code` → on success, issue the Sanctum token.

The token (`MfaService::issueToken`) is not a DB record — it's an **encrypted JSON payload** (`Crypt::encryptString`) containing `uid`, `purpose`, `exp`, and device data. `resolveToken` decrypts, checks expiry, and — critically — checks the `purpose` claim (`login` / `setup` / `confirm`), so a token minted for MFA *setup* cannot be replayed to complete a *login* (purpose-confusion attack). TTL is 10 minutes so a leaked token has a short window.

### Q13. How are recovery codes handled? Why hash them?

`MfaService::generateRecoveryCodes` creates 8 × 16-char hex codes. They are stored **bcrypt-hashed** (`hashRecoveryCodes`) and shown to the user only once at setup. `consumeRecoveryCode` hashes the submitted code and removes it from the list on success — **single-use**.

Why hash: recovery codes are long-term bearer credentials (they outlive the 30-second TOTP window). If the DB leaks, hashed codes are useless; the TOTP secret itself is stored via `Crypt` (encrypted at rest).

### Q14. What anti-enumeration measures are in the login endpoint?

`AuthService::login`:

- Unknown user and wrong password return the **same** generic message ("The provided credentials are incorrect") — no user enumeration.
- Separate messages are only given for states that are safe to reveal (deactivated account → "Contact HR"; no employee profile) since those don't confirm a valid password.
- Login is rate-limited (`throttle:login`, 5/min) and MFA verification is rate-limited separately (`throttle:mfa`, 5/min) — credential brute-force and OTP brute-force get different buckets from legitimate attendance traffic.

---

## 6. Business Logic Nuances

### Q15. How is `work_minutes` computed, and why is there a scheduled-break fallback?

`AttendanceService::computeWorkMinutes` (`:218`):

1. Total = time-out − time-in.
2. If real break punches exist in the window, subtract the **measured** `break_minutes` from `break_out` records (the system tracks actual break time).
3. **Fallback:** if the employee never punched a break but the shift defines `break_start`/`break_end` *and* their span covers the whole scheduled window, subtract the scheduled break minutes.

Why? Employees who skip punching breaks shouldn't be paid for a break they didn't take, but the system can't invent a measured value — so it deducts the scheduled minimum when the shift clearly contained it.

### Q16. What's tricky about `isEarlyTimeout` for overnight shifts?

`AttendanceService.php:203` — if `shift->end_time < shift->start_time` (e.g. 22:00 → 06:00), the end is moved to **the next day** before comparison. A naive same-day comparison would mark everyone on a night shift as "early timeout". The same day-rollover logic is why open-punch derivation is timestamp-based rather than date-based.

### Q17. How does the "open break" reminder command stay idempotent?

`CheckOpenBreaks` (a scheduler command) finds open breaks with a correlated `NOT EXISTS` subquery (no `break_out` with a greater id exists for the employee). It then drives a small **state machine** on `break_notify_stage`:

- `none` → at 50 min, send warning, set `warned`
- `warned` → at 60 min, send overbreak notice, set `overbreak`

Because the stage is persisted on the record, re-running the command never double-notifies — even if the scheduler fires more often than expected.

---

## 7. Compliance, Retention & Data Lifecycle

### Q18. How does the retention purge work, and why `forceDelete`?

`PurgeRetainedData` (`dtr:purge-old-data`):

- Attendance cutoffs default to 730 days (env-configurable), audit logs separately.
- Attendance rows are `forceDelete()`d — the dependent photos, GPS locations and fraud flags are removed by **FK `cascadeOnDelete`** at the database level (migrations `2026_07_31_190008/190009/190013`), plus sync logs and audit logs.
- `--dry-run` prints counts without deleting (safe preview for ops).

`forceDelete` (not `delete`) matters because the table uses **soft deletes** (`softDeletes()` in the attendance migration): a regular delete would leave rows that still count as data, and the entire point is erasing records beyond the retention period for data-privacy compliance (deletion requests, retention law).

### Q19. What's the gotcha with `AttendanceObserver` using `request()->user()`?

`AttendanceObserver.php:16` audits `attendance.created/updated/deleted` with the HTTP request's user. In **HTTP contexts** that's the actor — perfect. But in **queue/CLI contexts** (e.g. scheduler commands, purge, notification jobs), there is no request, so the audit actor is null. Any future write path that runs off-request must pass the actor explicitly or the audit trail loses accountability. This is a classic "observer + request()" coupling issue worth flagging in review.

---

## 8. Testing & Quality

### Q20. Why SQLite in-memory for tests but MySQL in production? What risks does that create?

Speed and zero external dependencies (`phpunit.xml`). The risk is **engine divergence**: MySQL and SQLite differ in JSON handling, enums, locking, and index behavior. Mitigations used here: migrations stick to portable constructs, and concurrency-sensitive behavior is still covered at the service level (`AttendanceConcurrencyTest`). A follow-up would be a MySQL-backed CI job for the critical paths.

### Q21. How would you verify a fix for "double clock-in under race"?

The repo already models this (`tests/Feature/AttendanceConcurrencyTest.php`): fire two concurrent time-ins for the same employee (or two syncs), then assert exactly one open session exists and the second request is deduplicated/rejected. The key insight to discuss: the test must exercise the **lock + idempotency path**, not just the endpoint, because the race lives at the service layer.

---

## 9. Operational / API Design

### Q22. What API design conventions does this codebase enforce?

- **Consistent envelopes** — single resources in `{ data }`, lists in `{ data, links, meta }`; errors as `{ message, code }` with stable machine-readable codes (`gps_out_of_range`, `attendance_conflict`, `too_many_attempts`, ...) so clients switch on `code`, not HTTP status.
- **Pagination capped** — `min(per_page, 100)` everywhere, preventing unbounded queries.
- **Role groups as route middleware** (`routes/api.php`) — `role:Super Admin|HR` vs `role:Super Admin|HR|Branch Manager` — with a second layer of row-level scoping in the query layer (never trust middleware alone for data visibility).
- **Separate rate-limit buckets** — `login` (5), `mfa` (5), `attendance` (30), `api` (60) per minute — so a punch storm can't lock out logins, and credential attacks can't burn the attendance budget.
- **Config, not magic numbers** — thresholds live in `config/dtr.php` behind env vars (`speed_threshold_kmh`, `rapid_clock_minutes`, retention days, photo disk), so ops can tune without deploys.

---

*Suggested interview flow: start with Q2/Q3 (architecture + concurrency), probe depth with Q5/Q6 (state derivation + offline sync), then branch into security (Q8–Q14) or compliance (Q18–Q19) depending on the candidate's seniority signal.*