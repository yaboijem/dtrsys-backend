# MFA removal and punch reliability

**Date:** 2026-10-05
**Status:** Approved
**Surfaces:** API, admin web (`web`), employee portal (`portal`)

## Goal

1. Remove MFA from the whole system. Sign-in is employee ID and password for every role, on the portal and the admin site.
2. A punch is recorded only when the server accepts it while the device is connected. A dropped upload replays that same upload. It is not saved for later.
3. The punch button follows the server's open shift. A saved clock-in cannot leave the button on Time In.
4. The punch hot path stays cheap for 500–1000 employees, including a shift-start spike.

## Non-goals

- Offline punch queue, service-worker sync, or saving a punch on the device after the page closes
- Detecting Wi-Fi versus mobile data
- An HR "I could not punch" exception screen
- Redis, read replicas, sharding, or a new queue cluster
- Polling the session endpoint
- Changing admin role checks, GPS rules, fraud checks, or break kinds

This supersedes the network-failure row in `2026-10-03-portal-online-punch-revision-design.md`. A dropped upload replays in memory. It still does not queue.

## Scale

Target: 500–1000 employees. The heavy moment is shift start, when many people open Home and upload one selfie. That is a short spike, not 1000 requests per second all day.

The current open-shift check loads every `time_in` and `time_out` for that employee and walks them in PHP. At a 730-day retention that is thousands of rows per person, on every punch and every Home load. That does not survive a morning spike.

Decisions:

| Topic | Choice |
|---|---|
| Open shift | One indexed lookup: latest `time_in` or `time_out` for that employee with `timestamp <= now`, `ORDER BY timestamp DESC, id DESC LIMIT 1`. If that row is `time_in`, the shift is open. This matches the old walk. Use the existing `(employee_id, timestamp)` index. Do not add an index, and do not load the full history. |
| Open break | After that `time_in`, latest `break_in` or `break_out` with a later id, same order, `LIMIT 1`. If that row is `break_in`, the break is open. Ignore soft-deleted rows. |
| Session payload | Ids, types, timestamps, `break_kind`, `expected_end_at`. No photo bytes, no fraud flags, no history page. |
| When to load session | Home load, after a successful punch, and inside a 409. No interval polling. |
| Locks | Keep the per-employee cache lock. Do not add a global lock. Database cache is enough at this size. |
| Replay | At most 3 sends of the same upload. Do not replay 4xx or 429. The attendance limit stays 30 per minute per employee. |
| History | Stays paginated for the list. The button does not read it. |
| Images | Keep the existing selfie compress and 1024px server downscale. Session and conflict responses do not touch image processing. |
| Idempotency | Keep the unique `uuid` lookup. A replay is one index read, not a history scan. |

Do not add Redis as a requirement for this size.

## MFA removal

Login already returns a token and does not check MFA. The leftover surface still exists and must go.

Remove:

- API routes and handlers: `/api/auth/mfa/verify`, `enable`, `confirm`, `status`, `disable`
- `MfaService`, MFA form requests, the MFA rate limiter, and MFA branches in `AuthService` and `AuthController`
- User columns `two_factor_secret`, `two_factor_confirmed_at`, `two_factor_recovery_codes`, via a new migration that drops them if present
- Admin web `/mfa` page, the login redirect to it, and MFA API client types
- Portal login rejection of `mfa_required`
- Debug route `GET /dev/otp/{employeeId}`
- Composer packages `pragmarx/google2fa-laravel` and `bacon/bacon-qr-code` once nothing references them
- MFA rows in README and `docs/FEATURES.md`

Every role, including Super Admin, HR, Branch Manager, and Department Head, receives a normal Sanctum token from `POST /api/auth/login`. Admin APIs stay behind their existing role middleware. Employees still cannot call them.

Old MFA audit labels may remain in stored audit rows. Do not delete audit history. New logins do not write `mfa.enabled` or `mfa.disabled`.

## Punch button

The button has its own state. The history list does not drive it.

`GET /api/attendance/session` uses the limited open-shift and open-break lookups above.

```json
{
  "data": {
    "open": true,
    "on_break": false,
    "time_in": { "id": 1, "uuid": "...", "type": "time_in", "timestamp": "..." },
    "break": null
  }
}
```

When `on_break` is true, `break` includes `break_kind`, `expected_end_at`, and `timestamp`. The portal still renders the countdown from `expected_end_at`. It does not invent a due time.

Button mapping:

| Session | Control |
|---|---|
| `open: false` | Time In |
| `open: true`, `on_break: false` | Break list, or Time Out if breaks are disabled |
| `on_break: true` | Done Break and Time Out |

A successful punch response is applied to that session state immediately. A history reload may refresh Today's punches only. It must not move the button backward.

A session request that started before a punch completes is ignored if a newer punch result was already applied.

## Dropped upload

Applies only after selfie and GPS are captured and the upload starts, or after a break upload starts. If GPS or the camera fails first, nothing is stored and nothing is replayed.

Keep the selfie, GPS, punch type, and `client_uuid` in memory for this attempt only.

1. Send the upload.
2. If the connection drops, times out, or the server returns 502, 503, or 504, send that same request again. Stop after 3 sends total.
3. Do not mark the user clocked in until a success response arrives.
4. If those 3 sends fail, show Retry. Each tap sends the same payload once. It does not start another automatic loop, open the camera, or mint a new `client_uuid`. The user may tap Retry again if that send also drops. |
5. Time In, breaks, and Time Out stay disabled while a send or replay is in flight.
6. Leaving the page discards the attempt. The user punches again only while connected.

A replay uses the same `client_uuid`. If the first request was saved and only the reply was lost, the server returns the existing row and does not create a second punch. The button then follows that row.

Do not replay: GPS out of range, home pin missing or pending, validation errors, 401, 409, or 429. Those keep the current button and show the message. 429 is "slow down", not "send it again."

## Conflict

`attendance_conflict` stays HTTP 409. The body adds the same session object the GET returns:

```json
{
  "message": "You already clocked in today.",
  "code": "attendance_conflict",
  "session": { "open": true, "on_break": false, "time_in": {}, "break": null }
}
```

The portal applies `session` immediately and shows "Already clocked in." It does not leave Time In up when `session.open` is true. It does not start a new Time In to "fix" the conflict.

Other conflict messages ("not clocked in", "already on break", "not on break", "attendance is busy") also include `session` when the employee record exists. The button follows that session. "Attendance is busy" does not replay in a loop. The user can tap again after the in-flight send finishes.

## Errors

| Case | Button | Stored punch |
|---|---|---|
| Success | Follow the returned punch, then confirm with session | Server row |
| Dropped upload, replay succeeds | Follow the returned or existing row | One server row |
| Dropped upload, 3 sends fail | Unchanged. Retry stays available until the page closes | None until a later send succeeds |
| 409 conflict | Follow `session` in the 409 | Whatever the server already had |
| 422 rule failure, 401, 429 | Unchanged | None |
| GPS or camera failure before upload | Unchanged | None |
| Page closed during replay | Next visit loads session from the server | Only if a send had already been saved |

## Testing

API:

- Login for Employee, HR, and Super Admin returns a token and no `mfa_required`, including when old two-factor columns are already gone
- Removed MFA routes are gone
- Session is closed with no punches, open after Time In, on break after Break In, closed after Time Out
- An old closed shift plus a later open shift returns the later shift
- A 409 for a second Time In includes `session.open: true` and does not create a second row
- The same `client_uuid` on Time In still creates one row
- Session and conflict queries do not load the employee's full attendance history

Portal has no test runner. Do not add one in this pass. API tests cover the contract the button uses.

## Docs

Update README and `docs/FEATURES.md` so login is employee ID and password only, and so the punch section describes session state and same-upload replay. Do not document an offline queue.
