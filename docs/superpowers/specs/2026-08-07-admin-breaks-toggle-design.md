# Admin global break in/out toggle

## Goal

Admins (Super Admin | HR) can enable or disable the employee break in/out feature from the admin Shifts page. When disabled, employees do not see Break In and the API rejects new break-ins; anyone already on break can still Break Out.

## Scope

- **Global** setting for all employees (not per shift).
- Default: **enabled** (`breaks_enabled = true`).
- Admin UI control lives on the **Shifts** page only.
- Per-shift `break_start` / `break_end` fields are unchanged (scheduled window metadata only).

## Data model

Table `app_settings` (singleton row, id = 1):

| Column | Type | Default |
|--------|------|---------|
| `id` | bigint PK | 1 |
| `breaks_enabled` | boolean | `true` |
| `created_at` / `updated_at` | timestamps | |

Model `App\Models\AppSetting`:

- Fillable / cast `breaks_enabled` as boolean.
- `AppSetting::current(): self` — firstOrCreate id=1 with defaults.

Migration inserts the default row so production starts with breaks on.

## API

### Admin (middleware: `auth:sanctum`, `role:Super Admin|HR`)

- `GET /api/admin/settings`  
  Response: `{ data: { breaks_enabled: bool } }`

- `PATCH /api/admin/settings`  
  Body: `{ breaks_enabled: bool }` (required boolean)  
  Response: same shape as GET  
  Audit: `settings.updated` with before/after values (via existing `AuditService`)

Controller: `App\Http\Controllers\Api\Admin\SettingsController`.

### Employee-facing

- `GET /api/settings` (auth:sanctum)  
  Response: `{ data: { breaks_enabled: bool } }`  

Used by the employee portal so Home can read the flag even when `GET /api/schedule/today` returns 404 (no schedule).

### Enforcement

In `AttendanceService` (live punches) and `SyncService` (offline sync):

| Action | When `breaks_enabled` is false |
|--------|--------------------------------|
| `break_in` | Reject 422, `code: breaks_disabled`, clear message |
| `break_out` | Allowed if an open break exists (unchanged rules otherwise) |
| `time_in` / `time_out` | Unaffected |

UI must not be the only gate; API is authoritative.

## Admin UI (`web` Shifts page)

- Page header actions: **Break in/out** label + existing `Toggle`, beside “Create new shift”.
- On mount: `GET /api/admin/settings`.
- Toggle: immediate `PATCH`; toast “Break in/out enabled.” / “Break in/out disabled.”; revert UI on error.
- Page description (or helper next to toggle) states: when off, Break In is hidden for employees; open breaks can still end.

No new admin nav item.

## Employee portal (`portal` Home)

- On load (with today’s punches/schedule): also `GET /api/settings`.
- **Break In** shown only when: `breaks_enabled && isOpen && !breakUsed && !onBreak`.
- **Break Out** shown when `onBreak` regardless of `breaks_enabled`.
- Persist last known `breaks_enabled` in `localStorage` after each successful fetch (default `true` if never fetched).
- Offline: use that cached value (do not offer Break In if false). On sync, server rejects queued `break_in` with `breaks_disabled`; surface that error like other sync failures.
- Online Home load always re-fetches `/api/settings` and updates the cache.

## Out of scope

- Per-shift or per-branch break toggles.
- Changing break duration rules (60 min / overbreak).
- Mobile native `frontend` app (breaks UI is portal-only today).
- Env/config-only control.

## Tests

Feature tests (PHPUnit):

1. Default after migrate: `breaks_enabled` is true; break in/out still works.
2. Admin can GET/PATCH settings; non-admin forbidden.
3. With `breaks_enabled = false`: live `break_in` → 422 `breaks_disabled`.
4. With flag false and open break: `break_out` succeeds.
5. Offline sync: queued `break_in` rejected when disabled; `break_out` still accepted when open break exists.

## Success criteria

- Admin can flip the toggle on Shifts without redeploy.
- Employees lose Break In immediately after disable (next load / next API check).
- Mid-break employees can always end break.
- Setting survives restarts (DB-backed).
