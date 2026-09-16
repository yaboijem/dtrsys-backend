# WFH home location tracking (Approach A)

## Goal

Support **WFH employees** with the same presence + identity bar as onsite:

1. **Presence** — punch GPS must fall inside an **approved fixed home** geofence (not the company branch).
2. **Identity** — existing selfie capture and fraud rules stay required.
3. **Scale** — HR does **not** manually pin 500+ homes. Employee **self-registers**; HR **approves/rejects**. One approved pin may be **shared** by multiple employees (household).

## Decisions (locked)

| Topic | Choice |
|--------|--------|
| Goal | Both presence proof and verified identity |
| Where WFH may work | Fixed home only (one primary pin) |
| Who sets the pin | Employee self-register → HR approve |
| Approach | Home pin entity + assignment; extend GPS verify path |
| Out of radius | **Block** punch (same policy as onsite branch geofence) |

## Out of scope (phase 1)

- Address geocoding and CSV bulk import
- Multiple concurrent homes per employee (only one primary)
- Continuous / background location tracking (punch-time GPS only)
- IP or corporate Wi‑Fi checks
- Hybrid multi-site same day (WFH morning + office afternoon) as first-class mode
- Sites-model refactor of branches
- Soft baseline / learn-home-over-N-days flow

## Current system (baseline)

- Onsite punches verify GPS against assigned **branch** (`latitude`, `longitude`, `radius_meters`) via `GPSService::verify`.
- Attendance stores coords; `gps_locations` records distance / `is_within_radius`.
- Fraud flags (`out_of_radius`, impossible jump, GPS spoof, etc.) already run on punch/sync.
- No `work_arrangement` / home pin model exists today.

## Work arrangement

- Add `work_arrangement` on the employee record: `onsite` | `wfh` (default `onsite`).
- Set/changed by HR / Super Admin only.
- **Onsite:** GPS vs assigned branch (unchanged).
- **WFH:** GPS vs approved **primary** home location; branch geofence is not used for the radius check.

## Data model

### `home_locations`

Shared-capable pin (one row can serve many employees).

| Column | Type / notes |
|--------|----------------|
| `id` | PK |
| `label` | string, e.g. display name for HR map list |
| `latitude`, `longitude` | decimal, required |
| `radius_meters` | unsigned int; default from config (e.g. 150); HR may override on approve |
| `address_text` | nullable string |
| `created_by` | FK users (submitter) |
| `status` | `pending` \| `approved` \| `rejected` \| `retired` |
| `reviewed_by`, `reviewed_at` | nullable |
| `review_note` | nullable text |
| timestamps | |

### `employee_home_location`

| Column | Type / notes |
|--------|----------------|
| `employee_id` | FK |
| `home_location_id` | FK |
| `is_primary` | bool; at most one primary per employee for punch verification |
| `assigned_at` | timestamp |
| unique constraints | enforce one primary per employee; allow many employees → one `home_location_id` |

### Employee profile

- `work_arrangement`: `onsite` \| `wfh`

### Attendance / GPS audit (punch path)

- Keep existing `gps_locations` fields.
- Add clear “verified against” context for admin:
  - `verified_against_type`: `branch` \| `home_location` (or equivalent on attendance / gps row)
  - `verified_against_id`: branch id or home_location id
- Distance / `is_within_radius` computed against that target.

## Registration and approval flow

### Employee (portal/app)

1. WFH employees see **Set home location** (settings or gated onboarding).
2. Capture **current device GPS** (preferred) and optional map adjust + `address_text` / `label`.
3. Submit creates `home_locations` with `status = pending` and links the employee (intended primary).
4. UI shows **Waiting for HR approval**. WFH **Time In/Out/Break is blocked** until there is an **approved** primary home.
5. Change request: new pending `home_locations` (or new assignment). Until approved, punches still use the **current approved primary**. On approve, primary switches; previous pin unlinked or marked `retired` as appropriate.
6. Notify employee on approve / reject (reuse existing notification patterns if present).

### HR / Super Admin (web)

1. **Pending home locations** queue: employee, map preview, coords, accuracy if supplied, submit time.
2. Optional sanity: warn if pin falls inside a known branch radius (“looks like office”).
3. Actions:
   - **Approve** (optional radius override)
   - **Reject** (+ note)
   - **Approve by linking to existing approved pin** (shared household — avoid duplicate pins)
4. Audit: submitter, reviewer, before/after coords, link/unlink events.
5. Manage `work_arrangement` on employee edit.
6. Optional later: Branch Manager view/approve for their team — **not required phase 1**.

### Shared pins

- Multiple employees may reference the same `home_locations.id` when HR links them.
- Retiring or rejecting a shared pin must not leave WFH employees punchable without a primary: either block those employees until reassigned, or require HR to re-link before retire.

## Punch verification (WFH)

Order for time-in / time-out / break (and offline sync re-validation):

1. Auth + existing schedule / business rules.
2. **Arrangement gate**
   - `onsite` → branch GPS (current).
   - `wfh` → require approved primary home; else error `home_location_required` (or `home_location_pending` when only pending exists).
3. **GPS** via extended `GPSService` (same haversine + `radius + accuracy` buffer as branch).
   - Outside radius → **block** punch; record/flag `out_of_radius` consistent with onsite.
4. **Selfie capture** (existing path; breaks remain GPS-only if that is current product behavior).
5. **Fraud rules** (existing): impossible jump, rapid clock, GPS spoof, etc.

### Offline sync

- Client sends lat/lng as today; server re-validates.
- Phase 1: validate against the home location that is **approved at sync time** (document edge case if home changed between offline punch and sync). Optional later: effective-dated home history.

### API error codes (employee-facing)

- `home_location_required` — WFH, no approved primary
- `home_location_pending` — only pending request, none approved
- `out_of_radius` — outside home (or branch) fence
- Existing fraud codes unchanged

### GPS required

- No fix / permission denied still blocks punch (existing product rule).

## Admin visibility

- Attendance detail: map + label **Home: {label}** or **Branch: {name}**, distance, within radius.
- Fraud flags queue: WFH out-of-radius uses same review/notify flow.
- Employee admin: work arrangement + current home status (none / pending / approved + map).

## Roles

| Actor | Capabilities |
|--------|----------------|
| Employee (WFH) | Submit/change home pin; punch only with approved primary inside radius |
| HR, Super Admin | Approve/reject/link shared; set work_arrangement; full queue |
| Branch Manager | Phase 1: no approve duty (optional later) |

## Edge cases

| Case | Behavior |
|------|----------|
| WFH, no approved home | Block punch |
| Pending change, old approved | Punch against current approved primary |
| Shared pin retired | Linked WFH employees need new approved primary before punch |
| Very poor GPS accuracy | Phase 1: allow if within effective radius (`radius + accuracy`); optional soft flag later |
| Switch onsite ↔ wfh | Next punch uses new rule immediately |
| Hybrid same calendar day | Not supported phase 1 — single arrangement at a time |
| GPS spoof at home coords | Face + existing spoof/jump detection |

## Implementation sketch (phase 1 order)

1. Migrations: `work_arrangement`, `home_locations`, `employee_home_location`, verified-against fields on attendance/gps as needed.
2. Models, policies, API: employee submit/status; admin list/approve/reject/link; employee work_arrangement admin update.
3. `GPSService`: verify against a generic lat/lng/radius target (branch or home).
4. `AttendanceService` / sync path: branch vs home selection by `work_arrangement`.
5. Portal/app: set-home UI + punch gating messages.
6. Web admin: pending queue, map, shared link, attendance “verified against”.
7. Notifications for approve/reject.
8. Tests (below).

## Tests

- Unit: home geofence distance inside/outside radius and accuracy buffer.
- Feature: submit → pending → cannot WFH punch → approve → punch inside OK.
- Feature: punch outside home radius blocked + `out_of_radius`.
- Feature: WFH without approved home → `home_location_required`.
- Feature: two employees share one approved pin; both punch OK.
- Feature: onsite employee still verified against branch only.
- Feature: change request keeps old pin until new approved.
- Feature: HR reject leaves employee blocked with clear code.
- Sync: offline WFH record re-validated against home.

## Acceptance

- HR can mark employees WFH without placing 500 map pins by hand.
- Employee registers home; until HR approves, WFH punch is impossible.
- After approve, WFH punch succeeds only inside home radius and with existing identity checks.
- Household can share one approved pin via HR link.
- Admin can see whether a punch was checked against branch or home and review out-of-radius the same way as onsite.
- Onsite behavior unchanged for `work_arrangement = onsite`.
