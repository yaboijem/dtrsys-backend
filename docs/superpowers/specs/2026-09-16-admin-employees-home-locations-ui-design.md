# Admin Employees Org + Home Locations UI

Date: 2026-09-16  
Surface: web admin (`web/`)  
Status: approved for planning

## Problem

1. **Employees → Org column** shows too many pills (branch, work arrangement, department, role). Long labels and four badges hurt row density and scanability.
2. **Home locations** list and review drawer show raw latitude/longitude. The API already returns `street`, `city`, `province`, and `address_text`, and the admin already has a reusable `LocationMap` embed used on Attendance and Branches.

## Goals

- Org column: only **branch** and **work arrangement** pills.
- Role visible without a pill: muted text under the employee ID in the Employee column.
- Department not shown as a pill (position already appears under the employee name).
- Home locations Location column and review drawer: human address (`street`, `city`, `province`), not coordinates.
- Review drawer: embedded map via existing `LocationMap`; no standalone coords + “Open map” block.

## Non-goals

- Backend/API changes (resource already exposes address parts).
- Changing home location approval workflow (radius, note, approve/reject/link).
- Redesigning the global `Badge` component.
- Portal or mobile employee home-location UI.

## Design

### 1. Employees page (`web/src/pages/EmployeesPage.tsx`)

**Employee column** (unchanged hierarchy + role line):

- Avatar
- Full name (medium)
- Position (muted xs)
- Employee ID (mono muted)
- **Role** (muted xs): first role name, or omit/`—` if none

**Org column** — only:

| Pill | Tone | Label |
|------|------|--------|
| Branch | teal | Branch name (existing `branchName` helper) |
| Arrangement | gray (onsite/default) or violet (wfh/hybrid) | `Onsite` / `WFH` / `Hybrid` |

Remove department and role badges from Org.

### 2. Home locations types (`web/src/api/types.ts`)

Extend `HomeLocation` with:

- `street: string | null`
- `city: string | null`
- `province: string | null`

(`address_text` already present.)

### 3. Address display helper

Small pure helper (page-local or `web/src/lib/`):

```
formatHomeAddress(h) →
  join non-empty [street, city, province] with ", "
  else address_text trimmed if present
  else "—"
```

Used by the table Location column and the review drawer Location field.

### 4. Home locations list (`web/src/pages/HomeLocationsPage.tsx`)

**Location column:**

- Display `formatHomeAddress(r)` as plain text (muted/primary text styles consistent with other address cells, e.g. Branches address).
- Do **not** show lat/lng.
- Optional: keep a non-link MapPin for affordance only; prefer no external OSM link in the cell (map lives in the drawer). If a link is useful for power users, link may open Google/OSM from coords without displaying numeric coords in the label — default is **no link**, open row → drawer.

**Other columns** unchanged (Employee, Status, Submitted).

### 5. Review drawer

Layout order:

1. Employee (existing)
2. **Location** — label + `formatHomeAddress(selected)` text (not “Coordinates”)
3. **Map** — `<LocationMap latitude={...} longitude={...} label="Home" radiusMeters={...} />`
   - For pending reviews, pass current radius input when valid number; otherwise `selected.radius_meters`
   - Footer already provides “Open in Google Maps”
4. Pending actions (radius, note, approve/reject, link) unchanged
5. Non-pending status/note unchanged

Remove:

- Coordinates mono block
- Standalone “Open map” anchor

### 6. Visual consistency

- Reuse `LocationMap` and `Badge` as-is (Modern SaaS admin tokens).
- No new map libraries.
- No design-token changes.

## Data flow

- List/review continue to use `listHomeLocations` / `reviewHomeLocation`.
- Address fields come from existing `HomeLocationResource` (`street`, `city`, `province`, `address_text`).
- Older pins without parts: helper falls back to `address_text` or `—`; backend may fill parts lazily elsewhere — admin UI does not reverse-geocode.

## Error / empty states

- Missing address parts → `—` (or `address_text` if present).
- Invalid lat/lng → `LocationMap` already shows its invalid-coords empty state.

## Testing

- Manual: Employees list shows two Org pills; role under ID; department not in Org.
- Manual: Home locations list shows address string; drawer shows address + map; approve flow still works.
- `npx tsc --noEmit` in `web/` after type field additions.

## Files touched (expected)

- `web/src/pages/EmployeesPage.tsx`
- `web/src/pages/HomeLocationsPage.tsx`
- `web/src/api/types.ts`
- Optional: `web/src/lib/format.ts` or small home-address helper module
