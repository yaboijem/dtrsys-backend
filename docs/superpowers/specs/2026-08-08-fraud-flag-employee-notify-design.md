# Fraud flag review notes → employee + richer admin alerts

## Goal

1. When an admin reviews a fraud flag (resolve or dismiss), the **employee** always receives an Alerts notification that includes status, flag type, and review notes.
2. **Admin** fraud-flag alerts (DB notifications to Super Admin/HR) include **employee name**, **punch time**, and **reason** (human flag type label).
3. **Fraud flags** web page surfaces reason clearly in the list (employee name and punch time already present).

## Out of scope

- Push/email channels
- Custom portal/app card layouts beyond plain title/body
- Making review notes required
- Changing who receives new-flag admin notifications (still Super Admin + HR only)

## Backend

### Review → employee notification

On successful `POST /api/admin/fraud-flags/{id}/review` (`FraudFlagController::review`):

1. Persist status, notes, reviewer, `reviewed_at` (unchanged).
2. Audit `fraud_flag.reviewed` (unchanged).
3. Always call `NotificationService::fraudFlagReviewed(FraudFlag $flag)` after update.

`fraudFlagReviewed`:

- Resolve employee user via `flag → attendance → employee → user`.
- If no user, return without error.
- Send database notification via existing `send()` / `GenericNotification`:
  - **Title:** `Attendance flag reviewed` when status is `reviewed`; `Attendance flag dismissed` when status is `dismissed`.
  - **Body:** Include human flag type label (lowercase in sentence), status word, and notes. If notes empty/null: append `No notes provided.`
    - Example: `Your Out of radius flag was reviewed. Notes: Verified field duty.`
    - Example (no notes): `Your Face mismatch flag was dismissed. No notes provided.`
  - **Payload `data`:** `fraud_flag_id`, `attendance_id`, `status`, `type`, `notes` (string or null).

Use one shared PHP map of flag type → label matching web `FLAG_LABELS` (e.g. `out_of_radius` → `Out of radius`). Put it on `FraudFlag` (e.g. constant or helper) or a small support class; both employee and admin notification paths use it. Unknown types fall back to the raw type string.

Do not notify Super Admin/HR again on review (they already see status on Fraud flags).

### New fraud flag → admin notification (enrich)

Update `NotifyFraudFlagJob` body and payload:

- Load flag with `attendance.employee` (and timestamp).
- **Title:** keep `New fraud flag`.
- **Body:** `{Employee Name} — {punch time} — {reason label}. Attendance #{id}.`
  - Employee name: `employee.full_name` or `"Unknown employee"` if missing.
  - Punch time: attendance `timestamp` as `Y-m-d H:i` in app timezone; if timestamp missing, use `unknown time`.
  - Reason label: human flag type (same map as above).
- **Payload adds:** `employee_name`, `attendance_timestamp` (ISO or null), `flag_type`, `severity` (keep existing `fraud_flag_id`, `attendance_id`).

## Web admin (Fraud flags)

`FraudFlagsPage` table:

- Keep **Employee** and **Punch time** columns.
- Rename the existing **Type** column header to **Reason** (same `FLAG_LABELS` badge content). Do not add a second duplicate column.
- Drawer “Why this was flagged” (`details`) stays as-is.

No API shape change required for list; resource already includes `type`, `details`, employee name, attendance timestamp.

## Tests

Extend `FraudFlagReviewTest` (and/or job test in `AsyncFaceVerificationTest`):

1. Review with notes → employee has one notification; title/body/payload include status, type, notes.
2. Dismiss without notes → employee still notified; body contains `No notes provided.`
3. `NotifyFraudFlagJob` body contains employee name, punch time string, and reason label (not only attendance id + raw type).
4. Existing auth/scope/review assertions remain green.

## Acceptance

- Employee opens portal/app **Alerts** after HR review and can read the notes (and status + flag type).
- Super Admin/HR new-flag alert text identifies who, when, and why without opening Fraud flags.
- Fraud flags list clearly shows employee, time, and reason.
