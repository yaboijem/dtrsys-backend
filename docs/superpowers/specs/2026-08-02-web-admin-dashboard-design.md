# Web Admin Dashboard — Design

Date: 2026-08-02
Status: Approved by user (plan mode), this doc captures the approved design.

## Purpose

Provide an admin web UI for the DTR system. Today the backend has a complete,
role-gated admin API (`/api/admin/*`) and a mobile employee app, but no admin
interface — the Laravel `/` route renders the welcome page. This project adds
a standalone React SPA that consumes the existing API. No backend business
logic is duplicated; only two small backend additions are required.

## Architecture

- **App location**: `M:\dtrsys-backend\web\` — standalone Vite 7 + React 19 +
  TypeScript + Tailwind v4 app (mirrors the existing `frontend/` Expo app
  pattern: separate app, same repo).
- **Dev serving**: Vite dev server on port 5173 with `/api` proxy →
  `http://127.0.0.1:8000` (the running `php -S` Laravel server). Same-origin
  requests → no CORS needed in dev. `config/cors.php` is still published with
  `http://localhost:5173` allowed for future separate-origin deployments.
- **Auth**: `POST /api/auth/login` → if `mfa_required`, second screen
  `POST /api/auth/mfa/verify` (recovery-code option). Bearer token persisted
  in `localStorage`; `/auth/me` loaded on boot drives the role-gated sidebar.
  401 responses clear the token and redirect to `/login`.
- **Photos**: no public storage URL exists, and the streaming photo endpoints
  require the auth header, so a `PhotoViewer` component fetches with the
  Bearer token → blob → object URL → `<img>`, revoked on unmount.
- **Time display**: server returns ISO strings; format in **Asia/Manila**
  regardless of browser timezone (same convention as mobile `lib/format.ts`).
- **Design language**: Tailwind v4 CSS variables copied from
  `frontend/src/theme.ts` (`primary #2563eb`, `danger #dc2626`,
  `success #16a34a`, `warning #d97706`, `bg #f1f5f9`, etc.).

## Backend additions

1. `GET /api/admin/employees/{employee}/reference-photo` in `EmployeeController`
   — mirrors `AttendanceAdminController::photo` (auth'd stream via
   `Storage::disk(config('dtr.attendance.photo_disk'))->response(...)`,
   guards 403/404). Lives in the existing `role:Super Admin|HR` route group.
2. Publish `config/cors.php` with `http://localhost:5173` in `allowed_origins`.

## Pages and API surface

| Page | Route | API endpoints |
|---|---|---|
| Login / MFA | `/login`, `/mfa` | `POST /api/auth/login`, `POST /api/auth/mfa/verify` |
| Dashboard | `/` | `GET /api/admin/dashboard/summary` |
| Attendance | `/attendance` | `GET /api/admin/attendance` + `GET /api/admin/attendance/{id}/photo` |
| Fraud flags | `/fraud-flags` | `GET /api/admin/fraud-flags`, `PATCH /api/admin/fraud-flags/{id}/review` |
| Employees | `/employees` | `GET/POST /api/admin/employees`, `GET/PATCH/DELETE .../{id}`, `POST .../{id}/reference-photo`, `GET .../{id}/reference-photo` |
| Branches | `/branches` | `GET/POST /api/admin/branches`, `GET/PATCH/DELETE .../{id}` |
| Shifts | `/shifts` | `GET/POST /api/admin/shifts`, `GET/PATCH/DELETE .../{id}` |
| Schedules | `/schedules` | `GET/POST /api/admin/schedules`, `DELETE .../{id}` |

### Attendance review
Filters: date range (`date_from`/`date_to`), `date`, `branch_id`,
`department`, `employee_id`, `type`, `is_late`, `source`, `has_open_flags`.
Server-side pagination (`per_page` ≤ 100). Row detail drawer: selfie photo
(auth'd), GPS (distance from branch, within-radius), device, `work_minutes`,
source/offline badge, fraud-flag badges.

### Fraud flag review
Filters: `status`, `type`, `severity`, `branch_id`. Detail drawer shows
attendance + photo; verdict actions `reviewed`/`dismissed` with optional
notes.

### Employees CRUD
Table with `search`, `branch_id`, `department` filters. Create/edit modal:
`employee_id`, `name`, `email`, `password` (min 8, create required / edit
optional reset), `role` (6 roles from `StoreEmployeeRequest::ROLES`), `branch_id`,
first/middle/last name, `department`, `position`, `date_hired`, `is_active`.
Deactivate (DELETE) with confirmation. Reference photo upload (multipart) and
display via the new endpoint.

### Branches / Shifts / Schedules
- Branches: `name`, `code`, `address`, `latitude`, `longitude`,
  `radius_meters`, `is_active`. Delete blocked server-side when employees
  exist (surface 422 `branch_has_employees`).
- Shifts: `name`, `start_time`/`end_time` (`H:i:s`), `grace_minutes`,
  `break_start`/`break_end`, `is_active`. Delete blocked when scheduled
  (422 `shift_in_use`).
- Schedules: list with `date`/`date_from`/`date_to`, `employee_id`,
  `shift_id`, `branch_id` filters; create = employee + shift + date
  (server upserts per employee+date); delete with confirmation.

## Role-gated navigation

Sidebar items derived from `/auth/me` roles:

- **Super Admin / HR**: all v1 modules.
- **Branch Manager**: dashboard, attendance, fraud flags, schedules (server
  scopes data to their branch).
- **Department Head**: dashboard, attendance, fraud flags, schedules
  (department-scoped).
- **Payroll Officer**: no v1 nav items (exports deferred) — show no-access
  state.
- **Employee**: cannot reach admin UI (login allowed but nav empty / 403s).

Deferred (APIs exist, not in v1 nav): audit logs, device-change requests,
data requests, payroll exports, report exports.

## File layout

```
web/package.json, vite.config.ts, index.html
web/src/main.tsx, App.tsx (router + guards)
web/src/api/{client.ts,types.ts}
web/src/auth/AuthContext.tsx
web/src/lib/format.ts
web/src/components/{Layout,Sidebar,Topbar,DataTable,Pagination,Badge,Modal,Drawer,ConfirmDialog,Toast,StatCard,PhotoViewer,FormControls,EmptyState}
web/src/pages/{Login,Mfa,Dashboard,Attendance,FraudFlags,Employees,Branches,Shifts,Schedules,NotFound}
```

`ApiClient` and `ApiError` ported from `frontend/src/api/client.ts` (JSON /
FormData support, Bearer token, timeout, typed error with `code`/`errors`).

## Error handling and states

- Every data view: loading skeleton, empty state, error banner with retry.
- API validation errors (422 `errors` map) rendered inline in forms.
- Conflict errors (branch with employees, shift in use) surfaced as alerts.
- 401 anywhere → token cleared → redirect to login.

## Testing / verification

- `php -l` on changed backend files; curl smoke of the new reference-photo
  endpoint.
- `tsc --noEmit` and `npm run build` clean in `web/`.
- Manual pass: HR001/password + MFA code via `/dev/otp/HR001` (APP_DEBUG on)
  — dashboard, attendance + real selfie photo, fraud-flag review round-trip,
  employee create/edit/deactivate, reference photo upload+display,
  branch/shift/schedule CRUD.
- Manual pass: EMP001 (Employee role) — restricted nav + clean 403 handling.
