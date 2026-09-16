# Admin Employees Org + Home Locations UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tighten the admin Employees Org column to branch + arrangement pills only, and show human addresses plus an embedded map on Home locations instead of raw coordinates.

**Architecture:** Frontend-only changes in `web/`. Extend the existing `HomeLocation` TypeScript type with address parts already returned by the API. Add a pure `formatHomeAddress` helper in `web/src/lib/format.ts`. Update `EmployeesPage` Org/Employee columns and `HomeLocationsPage` list + review drawer to use address text and the existing `LocationMap` component. No backend changes.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind v4 admin console (`web/`), existing `Badge` and `LocationMap` components.

## Global Constraints

- Scope is `web/` admin only — no portal, mobile, or API changes.
- Reuse `LocationMap` and `Badge`; do not redesign global Badge tokens.
- Address display: join non-empty `street`, `city`, `province` with `", "`; else `address_text`; else `"—"`.
- Org column pills: **branch** (teal) + **arrangement** only; role moves under employee ID as muted text; department pill removed.
- No new test runner in `web/` (no vitest/jest); verify with `npm run typecheck` and manual UI checks.
- Commit only files touched by this plan; leave unrelated dirty worktree files alone.

## File structure

| File | Responsibility |
|------|----------------|
| `web/src/api/types.ts` | Add `street`, `city`, `province` on `HomeLocation` |
| `web/src/lib/format.ts` | Add `formatHomeAddress` pure helper |
| `web/src/pages/EmployeesPage.tsx` | Org column + role under employee ID |
| `web/src/pages/HomeLocationsPage.tsx` | Address in list/drawer; embed `LocationMap` |

---

### Task 1: HomeLocation type + formatHomeAddress

**Files:**
- Modify: `web/src/api/types.ts` (`HomeLocation` interface ~176–195)
- Modify: `web/src/lib/format.ts` (append helper at end of file)

**Interfaces:**
- Consumes: none
- Produces:
  - `HomeLocation.street: string | null`
  - `HomeLocation.city: string | null`
  - `HomeLocation.province: string | null`
  - `formatHomeAddress(parts: { street?: string | null; city?: string | null; province?: string | null; address_text?: string | null }): string`

- [ ] **Step 1: Add address fields to `HomeLocation`**

In `web/src/api/types.ts`, update the interface to:

```ts
export interface HomeLocation {
  id: number;
  label: string | null;
  latitude: number;
  longitude: number;
  radius_meters: number;
  address_text: string | null;
  street: string | null;
  city: string | null;
  province: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'retired';
  created_by: number;
  reviewed_by: number | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string | null;
  employees?: Array<{
    id: number;
    full_name: string;
    employee_id: string | null;
    is_primary: boolean;
  }>;
}
```

- [ ] **Step 2: Add `formatHomeAddress` to `web/src/lib/format.ts`**

Append:

```ts
export function formatHomeAddress(parts: {
  street?: string | null;
  city?: string | null;
  province?: string | null;
  address_text?: string | null;
}): string {
  const joined = [parts.street, parts.city, parts.province]
    .map((p) => (typeof p === 'string' ? p.trim() : ''))
    .filter(Boolean)
    .join(', ');
  if (joined) return joined;
  const fallback = typeof parts.address_text === 'string' ? parts.address_text.trim() : '';
  return fallback || '—';
}
```

- [ ] **Step 3: Typecheck**

Run from `web/`:

```bash
npm run typecheck
```

Expected: exit 0 (no errors from these type additions).

- [ ] **Step 4: Commit**

```bash
git add web/src/api/types.ts web/src/lib/format.ts
git commit -m "feat(web): home location address fields and formatHomeAddress helper"
```

---

### Task 2: Employees Org column restructure

**Files:**
- Modify: `web/src/pages/EmployeesPage.tsx` (Employee + Org column renderers ~459–489)

**Interfaces:**
- Consumes: existing `Badge`, `branchName`, employee `roles`, `department` unused in Org after change
- Produces: Employee column shows role under ID; Org shows only branch + arrangement badges

- [ ] **Step 1: Update Employee column renderer**

Replace the Employee column `render` so role appears under the employee ID:

```tsx
{
  key: 'employee',
  header: 'Employee',
  render: (r) => (
    <div className="flex items-center gap-2.5">
      <Avatar name={r.full_name} />
      <div className="min-w-0">
        <div className="truncate font-medium text-text">{r.full_name}</div>
        <div className="truncate text-xs text-muted">{r.position || '—'}</div>
        <div className="font-mono text-[11px] tnum text-muted">{r.employee_id}</div>
        <div className="truncate text-xs text-muted">{r.roles?.[0] ?? '—'}</div>
      </div>
    </div>
  ),
},
```

- [ ] **Step 2: Update Org column renderer**

Keep only branch + arrangement pills:

```tsx
{
  key: 'tags',
  header: 'Org',
  render: (r) => (
    <div className="flex flex-wrap gap-1">
      <Badge tone="teal">{branchName(r.branch?.id)}</Badge>
      <Badge tone={r.work_arrangement === 'onsite' || !r.work_arrangement ? 'gray' : 'violet'}>
        {r.work_arrangement === 'wfh'
          ? 'WFH'
          : r.work_arrangement === 'hybrid'
            ? 'Hybrid'
            : 'Onsite'}
      </Badge>
    </div>
  ),
},
```

Do **not** render department or role `Badge`s in this column.

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: exit 0. Working directory: `web/`.

- [ ] **Step 4: Manual check (if admin is running)**

- Open Employees list.
- Org column shows exactly two pills per row (branch + Onsite/WFH/Hybrid).
- Role appears as muted text under employee ID.
- Department is not a pill (position still under name).

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/EmployeesPage.tsx
git commit -m "fix(web): employees Org column branch+arrangement only, role under name"
```

---

### Task 3: Home locations list address + review map

**Files:**
- Modify: `web/src/pages/HomeLocationsPage.tsx`

**Interfaces:**
- Consumes: `formatHomeAddress` from `../lib/format`; `LocationMap` from `../components/LocationMap`; `HomeLocation` with street/city/province
- Produces: Location column address text; drawer Location label + embedded map; no coords/Open map block

- [ ] **Step 1: Update imports**

At top of `HomeLocationsPage.tsx`:

- Remove `MapPin` import from `lucide-react` if unused after Step 2.
- Add:

```ts
import { LocationMap } from '../components/LocationMap';
import { formatDateTime, formatHomeAddress } from '../lib/format';
```

(Replace the existing `formatDateTime`-only import from `../lib/format`.)

- [ ] **Step 2: Replace Location column**

Replace the `coords` column with:

```tsx
{
  key: 'location',
  header: 'Location',
  render: (r) => (
    <span className="text-sm text-text">{formatHomeAddress(r)}</span>
  ),
},
```

No lat/lng, no external map link in the cell.

- [ ] **Step 3: Replace review drawer location section**

Inside the drawer (when `selected` is set), replace the Coordinates block with:

```tsx
<div>
  <div className="text-xs font-semibold text-muted">Location</div>
  <div className="text-sm text-text">{formatHomeAddress(selected)}</div>
</div>
<LocationMap
  latitude={Number(selected.latitude)}
  longitude={Number(selected.longitude)}
  label="Home"
  radiusMeters={
    selected.status === 'pending'
      ? (radius.trim() === '' || Number.isNaN(Number(radius)) ? selected.radius_meters : Number(radius))
      : selected.radius_meters
  }
  className="h-56"
/>
```

Remove:

- The “Coordinates” label and mono lat/lng text
- The “Open map” anchor

Keep Employee block, pending actions (radius/note/approve/reject/link), and non-pending status block unchanged.

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

Expected: exit 0. Working directory: `web/`.

- [ ] **Step 5: Manual check (if admin is running)**

- Home locations table Location column shows `street, city, province` (or fallback / `—`), not coordinates.
- Open a row: drawer shows Location address text and an embedded map with “Open in Google Maps” in the map footer.
- Pending approve/reject still works.

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/HomeLocationsPage.tsx
git commit -m "fix(web): home locations show address and embed review map"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Org: branch + arrangement pills only | Task 2 |
| Role under employee ID (muted) | Task 2 |
| No department pill | Task 2 |
| `street`/`city`/`province` on TS type | Task 1 |
| `formatHomeAddress` helper | Task 1 |
| List Location = address not coords | Task 3 |
| Drawer Location = address | Task 3 |
| Drawer embeds `LocationMap` | Task 3 |
| Remove coords + Open map block | Task 3 |
| No backend changes | All tasks (web only) |
| Typecheck verification | Tasks 1–3 |

## Self-review notes

- No placeholders; concrete code in each step.
- Helper signature matches list/drawer usage (`formatHomeAddress(r)` / `formatHomeAddress(selected)`).
- `LocationMap` props match existing component (`latitude`, `longitude`, `label`, `radiusMeters`, `className`).
- Web has no unit test runner; typecheck + manual UI steps substitute for TDD runner steps.
