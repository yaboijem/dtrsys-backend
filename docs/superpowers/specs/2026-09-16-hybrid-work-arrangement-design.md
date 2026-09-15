# Hybrid work arrangement design

## Goal

Add **`hybrid`** so employees may punch from **either** the assigned **branch** or an **approved home** geofence on the same day, with identity checks unchanged.

## Decisions (locked)

| Topic | Choice |
|--------|--------|
| Hybrid meaning | Same day, either site (branch **or** home anytime) |
| Home pin before any punch | **Hard gate** — no approved primary home → block all punches |
| GPS allow rule | Inside branch radius **or** home radius |
| Audit when both valid | **Nearest wins** (smallest distance among in-range targets) |
| Home approval process | **Same as WFH** (employee submit → HR approve/reject/link shared) |
| Approach | Extend `work_arrangement` + dual-target GPS in `resolveGpsVerification` |

## Out of scope

- Per-day schedule hybrid (Mon office / Fri WFH calendar)
- Employee “declare site” toggle before punch
- Retuning impossible-jump / fraud thresholds for office↔home travel (document that flags may still fire)
- Multi-home list, continuous tracking, IP/Wi‑Fi checks

## Baseline (current)

- `work_arrangement`: `onsite` | `wfh`
- Onsite → GPS vs branch; WFH → GPS vs approved primary home
- WFH/hybrid-to-be home: employee self-register → HR approve; shared pin via HR link
- Live out-of-radius blocks; sync soft-stores out-of-radius; missing home hard-fails on WFH

## Work arrangements

| Value | GPS | Home pin required to punch? |
|--------|-----|------------------------------|
| `onsite` | Branch only | No |
| `wfh` | Approved home only | Yes |
| **`hybrid`** | Branch **or** home; nearest in-range logged | **Yes** (hard gate) |

HR / Super Admin set `work_arrangement` on employee create/update.

## Home location process (hybrid = same as WFH)

1. HR sets employee to `hybrid`.
2. Employee (portal): More → Home location → submit current GPS → `pending`.
3. While no **approved** primary home: **all punches blocked** (`home_location_required` or `home_location_pending`).
4. HR: Home locations queue → Approve / Reject / Link shared approved pin.
5. After approve: hybrid may punch at office or home per GPS rules below.

Hybrid employees may use the existing home-location submit API (allow submit when `wfh` **or** `hybrid`).

## GPS resolution (hybrid)

Extend `AttendanceService::resolveGpsVerification` (used by live punch and sync):

```
onsite → branch only (unchanged)
wfh    → require approved home; home only (unchanged)

hybrid:
  home = primary approved home
  if missing:
    if any pending home linked → HomeLocationRequiredException(code: home_location_pending)
    else → HomeLocationRequiredException(code: home_location_required)
  branchResult = GPSService.verifyCoordinates(branch lat/lng/radius, punch, accuracy)
  homeResult   = GPSService.verifyCoordinates(home lat/lng/radius, punch, accuracy)
  inRange = results where is_within_radius
  if inRange empty:
    return composite failure:
      is_within_radius = false
      distance_meters = min(branch, home distances) when both known
      details may include branch_distance_meters, home_distance_meters
      verified_against_type/id optional null or omitted
  else:
    pick result with smallest distance_meters
    set verified_against_type/id from that target (branch | home_location)
    return that result
```

### Live punch

- Hybrid + failure `is_within_radius` → `GpsOutOfRangeException`  
  Message: e.g. “You are outside both your office and home allowed areas.”
- Details should help UI (distances when available).

### Sync

- Missing home: still hard-fail (same exception path).
- Out of both radii: keep **soft** behavior consistent with current onsite/WFH sync (store `is_within_radius` false; do not throw solely for radius).

### Effective radius

Unchanged: `radius_meters + (accuracy_meters ?? 0)`.

## Data model

No new tables. Changes:

- `employees.work_arrangement` allows `hybrid` (string already; validation + UI).
- `gps_locations.verified_against_*` already present — hybrid sets branch or home_location as today.

## API / validation

- `StoreEmployeeRequest` / `UpdateEmployeeRequest`: `work_arrangement` ∈ `onsite|wfh|hybrid`
- `HomeLocationService::submit`: allow if `isWfh() || isHybrid()` (or equivalent)
- Employee/User resources: expose `hybrid`; portal `home_location_status` for hybrid like WFH
- Error codes: reuse `home_location_required`, `home_location_pending`, `gps_out_of_range`

## UI

### Web admin

- Employees form: Work arrangement options Onsite / WFH / **Hybrid**
- List badge for Hybrid
- Home locations queue: unchanged (works for hybrid submitters)

### Portal

- Home location page: available when `wfh` **or** `hybrid`
- Punch errors: same home_* and gps_out_of_range handling; hybrid out-of-range copy can mention office and home

## Fraud / edge cases

| Case | Behavior |
|------|----------|
| Hybrid, no approved home | Block punch |
| Pending change, old approved | Punch uses current approved primary (existing WFH rule) |
| Inside both radii | Nearest wins for `verified_against` |
| Inside neither | Live block; sync soft flag |
| Office→home same day fast travel | Existing impossible-jump may flag — out of scope to retune |
| Switch hybrid → onsite | Next punch branch-only; home pin retained but unused until WFH/hybrid again |

## Tests

- Hybrid without home → `home_location_required`
- Hybrid pending only → `home_location_pending`
- Hybrid + home, coords inside branch only → 201, `verified_against_type=branch`
- Hybrid + home, coords inside home only → 201, `verified_against_type=home_location`
- Hybrid + home, outside both → `gps_out_of_range`
- Hybrid + both in range → nearer target’s type/id
- Onsite/WFH regression unchanged
- Hybrid can submit home location; onsite cannot

## Acceptance

- HR can set Hybrid on an employee.
- Hybrid cannot punch until home pin is approved (even at the office).
- After approval, punches succeed at office or home; attendance shows which site was nearer when valid.
- Home approval UX matches WFH (submit → HR queue → approve/link).
- Onsite and pure WFH behavior unchanged.

## Implementation order (sketch)

1. Validation + `Employee::isHybrid()` + allow home submit for hybrid  
2. Dual-target nearest logic in `resolveGpsVerification` + exception messages  
3. Admin + portal UI labels  
4. Feature tests  
5. Docs (FEATURES / README)
