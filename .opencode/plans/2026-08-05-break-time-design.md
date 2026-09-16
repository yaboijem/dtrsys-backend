# Break Time (Break In / Break Out) — Design

**Date:** 2026-08-05  
**Status:** Approved  
**Surfaces:** Backend API, employee portal, admin attendance display

## Goal

Allow an employee who is clocked in to take **one** break of up to **1 hour**, with GPS vicinity proof (no selfie), exclude break duration from work minutes, flag overbreak, and notify if they forget to end the break.

## Product rules (confirmed)

| Rule | Decision |
|------|----------|
| When available | After Time In, before Time Out |
| Count | **One** break per open shift / day cycle |
| Max duration | **60 minutes**; longer = overbreak |
| Proof | GPS within branch radius only — **no photo** |
| Work minutes | Break time **excluded** from `work_minutes` |
| UI while on break | **Hide Time Out**; show **Break Out** only |
| Time Out with open break | Server **rejects**; UI prevents |
| Forgot Break Out | Notify at **50 min** (warning) and **60 min** (overbreak) |
| Offline breaks (v1) | **Out of scope** — online only |

## State machine

```
clocked_out  --Time In-->  on_shift
on_shift     --Break In--> on_break   (only if no completed break yet this shift)
on_break     --Break Out--> on_shift
on_shift     --Time Out--> clocked_out
```

While `on_break`, portal primary actions = **Break Out** only.

## Data model

Table `attendance`:

1. Widen `type` enum: `time_in | time_out | break_in | break_out`
2. Add `break_minutes` (unsignedInteger, nullable) on `break_out`
3. Add `is_overbreak` (boolean, default false) when `break_minutes > 60`
4. Add `break_notify_stage` enum/string: `none | warned | overbreak` for job idempotency (on `break_in` row)

GPS via existing `gps_locations`. No photos for breaks.

## API

| Method | Path | Body |
|--------|------|------|
| POST | `/api/attendance/break-in` | `{ latitude, longitude, accuracy_meters?, device_id? }` |
| POST | `/api/attendance/break-out` | same |

- GPS check; no selfie
- Conflicts → 409 `attendance_conflict`
- History filter accepts new types
- Admin shows break types + overbreak badge

## Business logic

**breakIn:** open time_in; no open break; no completed break since that time_in; GPS; create break_in + GPS.

**breakOut:** open break_in; GPS; create break_out with break_minutes + is_overbreak.

**timeOut:** reject if open break; work_minutes = elapsed − Σ break_minutes; if any actual breaks, do not also subtract shift scheduled break window; if none, keep scheduled subtraction for BC.

## Notifications

Command `dtr:check-open-breaks` every minute:

- ≥50 min open break, stage none → notify warning, stage=warned  
- ≥60 min, stage warned → notify overbreak, stage=overbreak  

## Portal

Home state machine; Break In/Out GPS-only; History tags; Admin badges.

## Testing

Feature tests for paths above + job notification once each; portal typecheck.

## Out of scope

Offline breaks, multi-break, selfie on break, auto-close break on Time Out.

## Success criteria

1. One Break In only when on shift and break not used.  
2. Break Out duration + overbreak >60.  
3. Work minutes exclude break.  
4. GPS only; no selfie.  
5. 50m + 60m notifications once each.  
6. Time Out hidden in UI and rejected if open break.  
