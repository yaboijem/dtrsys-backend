# Break Time Implementation Plan

> **For agentic workers:** Implement task-by-task. Checkboxes for tracking.

**Goal:** One GPS-verified break (max 1h) per open shift; exclude from work minutes; 50m/60m notifications; portal + admin display.

**Architecture:** Extend `attendance.type` with `break_in`/`break_out`; dedicated service methods; no selfie; scheduled artisan command for open-break reminders.

**Tech stack:** Laravel 12, existing AttendanceService/GPS/Notification patterns, portal React.

## Global constraints

- No selfie on break punches  
- One break per open time_in cycle  
- Overbreak threshold: 60 minutes fixed  
- Time Out blocked while open break  
- Offline break sync out of scope v1  

---

### Task 1: Migration + model

**Files:**
- Create: `database/migrations/xxxx_add_break_fields_to_attendance_table.php`
- Modify: `app/Models/Attendance.php`
- Modify: factories if needed

- [ ] Migration: alter enum type; add `break_minutes`, `is_overbreak`, `break_notify_stage` (default `none`)
- [ ] Model fillable + casts
- [ ] `php artisan migrate`

---

### Task 2: AttendanceService break logic

**Files:**
- Modify: `app/Services/AttendanceService.php`
- Possibly: helpers for open break / completed break

- [ ] `breakIn(User, data)` / `breakOut(User, data)`
- [ ] Update `timeOut` reject open break; recompute work_minutes excluding breaks
- [ ] Update `openPunchFor` to ignore break types when finding open time_in
- [ ] Unit/feature coverage via Task 4

---

### Task 3: API routes + requests + resources

**Files:**
- Modify: `routes/api.php`
- Create: `BreakPunchRequest` (lat/lng required, no selfie)
- Modify: `AttendanceController`
- Modify: `AttendanceResource` (expose break_minutes, is_overbreak)
- Modify: history type validation if restricted
- Modify: `SyncAttendanceRequest` — do not allow break types in sync (or leave and reject in SyncService)

- [ ] POST break-in / break-out
- [ ] Resource fields
- [ ] Admin resource if separate

---

### Task 4: Feature tests

**Files:**
- Create/modify: `tests/Feature/BreakAttendanceTest.php` (or extend AttendanceApiTest)

- [ ] Happy path break in/out
- [ ] GPS out of range
- [ ] Double break_in / break without in / time_out on break
- [ ] One-break limit
- [ ] work_minutes excludes break
- [ ] is_overbreak when duration > 60 (Carbon::setTestNow)

---

### Task 5: Open-break notification job

**Files:**
- Create: `app/Console/Commands/CheckOpenBreaks.php`
- Modify: `routes/console.php` or Kernel schedule
- Use: `NotificationService`

- [ ] 50m warn once, 60m overbreak once via `break_notify_stage`
- [ ] Feature test with frozen time

---

### Task 6: Portal Home + History

**Files:**
- Modify: `portal/src/pages/Home.tsx`
- Modify: `portal/src/pages/History.tsx`
- Modify: `portal/src/api/types.ts`

- [ ] State: on_break, break_used
- [ ] Break In / Break Out GPS-only (no CameraModal)
- [ ] Hide Time Out on break; show elapsed
- [ ] History tags + duration
- [ ] `npm run typecheck` in portal

---

### Task 7: Admin web attendance display

**Files:**
- Modify: `web/src/pages/AttendancePage.tsx`
- Modify: `web/src/api/types.ts`

- [ ] Type badges break_in/out
- [ ] Overbreak badge
- [ ] Typecheck web

---

### Task 8: Docs

**Files:**
- Modify: `README.md` API table

- [ ] Document break-in/out endpoints and rules

---

## Verification

```bash
php artisan test --filter=Break
php artisan test --filter=Attendance
npm run typecheck --prefix portal
npm run typecheck --prefix web
```

Manual: Time In → Break In (in radius) → wait/simulate 50m job → Break Out → Time Out; confirm work_minutes and history.
