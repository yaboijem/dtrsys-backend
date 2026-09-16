# Department & position master data

## Goal

Replace free-text **Department** and **Position** on employees with selectable master data:

1. HR/admin maintain departments and positions on one **Org structure** page.
2. Employee create/edit modals use **searchable dropdowns** (select only — no free-text keep).
3. Values are stored as **foreign keys** so names stay consistent and renames propagate.

## Decisions (locked)

| Topic | Choice |
|--------|--------|
| UI control | Searchable dropdown / predict-search; **select only** (no invent-on-type) |
| Master data home | One settings page: Departments + Positions |
| Storage | `department_id` / `position_id` FKs (not free-text strings) |
| Create + edit | Both employee modals use the same dropdowns |
| Who manages lists | All admin roles: Super Admin, HR, Branch Manager, Department Head |
| Delete while in use | **Block** until no employees reference the row |
| Approach | Full master tables + FK migration (Approach 1) |

## Out of scope

- Position hierarchy nested under department
- Department/position codes, colors, sort order, or multi-branch variants
- Soft-delete / deactivate of departments or positions
- Auto-creating master rows from typed free text
- Changing who can open the Employees page (remains existing roles)

## Current system (baseline)

- `employees.department` and `employees.position` are nullable strings.
- Admin create/edit modal (`web/src/pages/EmployeesPage.tsx`) uses plain `<Input>` fields.
- List filter and attendance filter accept free-text `department`.
- Department Head role scopes queries by string match on `employee.department` (`ScopesByRole`, dashboard).
- API resources expose `department` / `position` as strings on employee payloads.
- No Combobox component yet; closest pattern is `EmployeePicker` (Radix Popover + type-to-filter).

## Data model

### `departments`

| Column | Type / notes |
|--------|----------------|
| `id` | PK |
| `name` | string, **unique** (case-insensitive uniqueness enforced in validation) |
| `timestamps` | created_at, updated_at |

### `positions`

Same shape as `departments`.

### `employees` changes

| Change | Notes |
|--------|--------|
| Add `department_id` | nullable FK → `departments`; DB `restrictOnDelete` + API pre-check |
| Add `position_id` | nullable FK → `positions`; same delete policy |
| Drop `department`, `position` string columns | After backfill |

**Relations**

- `Employee belongsTo Department`
- `Employee belongsTo Position`
- `Department hasMany Employee`
- `Position hasMany Employee`

### Migration plan

1. Create `departments` and `positions`.
2. Insert distinct non-empty trimmed values from existing `employees.department` / `employees.position`.
3. Backfill `department_id` / `position_id` by case-insensitive name match.
4. Drop string columns and old `department` string index; add indexes on the FK columns as needed.
5. Update seeders/factories to create or reuse master rows and set FKs.

Empty/null legacy values remain null FKs until an admin assigns them in the employee modal.

## Backend API

### Master data CRUD

| Method | Path | Behavior |
|--------|------|----------|
| GET | `/api/admin/departments` | Paginated list; `search`, `page`, `per_page` |
| POST | `/api/admin/departments` | Create `{ name }`; unique name |
| PATCH | `/api/admin/departments/{id}` | Update name; unique |
| DELETE | `/api/admin/departments/{id}` | **422** if any employee still references it |
| (same) | `/api/admin/positions` | Mirror of departments |

**Auth:** mount department/position routes on the existing admin group  
`role:Super Admin|HR|Branch Manager|Department Head` (same band as schedules/attendance-style admin routes in `routes/api.php`).  
Employee create/update stays on the existing Super Admin|HR employee routes.

**Delete error:** clear message, e.g. “Cannot delete: N employees still use this department.”

### Employee create/update

- Accept `department_id` and `position_id` (required integers that exist).
- Stop accepting free-text `department` / `position` on write.
- Validation: `exists:departments,id` / `exists:positions,id`.

### Employee read (compatibility)

Resources must expose both ids (for form binding) and display names (for existing UI):

- `department_id` / `position_id`: number or null
- `department` / `position`: string name from relation, or null
- Nested `department_ref` / `position_ref` as `{ id, name }` is optional; ids + name strings are enough

List/filter:

- Prefer `department_id` query param for employee (and attendance if updated) filters.
- Department Head scoping uses the head’s `employee.department_id`, not string equality.

### Other touch points

- `EmployeeResource`, `UserResource` employee snippet, attendance/schedule/fraud resources that embed department/position names.
- `ScopesByRole`, dashboard employee filters.
- Feature tests for CRUD, delete-in-use block, employee assign, and Department Head scope.
- Seeders (`EmployeeSeeder`, etc.) create master rows then assign FKs.

## Web admin UI

### Org structure page

- Route: `/org-structure`
- Sidebar: **Org structure** (icon e.g. `Network` / `Layers`), roles: Super Admin, HR, Branch Manager, Department Head
- Layout: one page, two sections — **Departments** | **Positions** (side-by-side on desktop, stacked on mobile)
- Each section mirrors Branches patterns: table, Add, Edit modal (name only), Delete with confirm
- Toast on success; field errors from API validation; delete-in-use shows API message

### Employee create/edit modal

- Replace Department/Position `<Input>` with a reusable **searchable select** (EmployeePicker-like: Popover, type-to-filter list, pick one option, no free-text commit).
- Load full option lists when modal opens (`per_page` high enough or dedicated unpaginated list if added).
- Form state: `department_id`, `position_id` as string ids for controls.
- On open edit: preselect current employee’s ids.
- Required fields; empty selection blocked on submit same as other required fields.

### Employee list filter

- Department filter becomes a select/searchable dropdown of departments (not free text), applying `department_id` to the list API.

### Shared component

- Prefer a small reusable `SearchableSelect` (options: `{ value, label }[]`) used by employee modal (and optionally org filter), rather than forking EmployeePicker.

## Error handling

| Case | Behavior |
|------|----------|
| Duplicate name | 422 validation on name |
| Delete in use | 422 with count message; UI toast/confirm stays open or closes with error |
| Missing FK on employee save | 422 field errors on `department_id` / `position_id` |
| Empty master list | Dropdown empty + helper text pointing admins to Org structure |

## Testing

- Migration backfill: distinct strings become rows; employees mapped correctly.
- Department/position CRUD + unique name.
- Delete blocked when referenced; succeeds when unused.
- Employee store/update requires valid ids; resources return names.
- Department Head only sees employees in their department_id.
- Web: modal cannot save without selection when lists are non-empty (manual or existing front-end test approach if any).

## Success criteria

- Admins manage departments and positions on `/org-structure`.
- Employee create and edit only assign department/position via searchable dropdowns.
- No free-text department/position columns remain on employees.
- Deleting an in-use department or position is refused.
- Existing name displays (badges, attendance detail, portal profile) still show the correct names via relations.
