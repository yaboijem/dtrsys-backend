# Design: Pending Requests Page & Dashboard Recent Activities (Web)

Date: 2026-08-02

## Purpose

1. Give Super Admin / HR a single "Requests" page to review pending device change requests and data requests.
2. Fill the Dashboard's empty space with a "Recent Activities" feed so it does not look bare.

## Scope

Frontend-only (`web/`). All required backend endpoints, role guards, review logic, and audit trail already exist:

- `GET /api/admin/device-change-requests` — filterable by `status`; `PATCH /api/admin/device-change-requests/{id}` — status `approved|rejected`, `review_notes`.
- `GET /api/admin/data-requests` — filterable by `status` and `type`; `PATCH /api/admin/data-requests/{id}` — status `completed|rejected`, `notes`.
- `GET /api/admin/audit-logs` — paginated, role-scoped (Super Admin|HR).
- All three are behind `role:Super Admin|HR` middleware.

## Feature 1: Pending Requests page (`/requests`)

- Route `/requests`, nav item "Requests" (Inbox icon), roles `['Super Admin', 'HR']`.
- Single page, two tabs: **Device requests** and **Data requests** (state-driven, not separate routes).
- Follows the existing `FraudFlagsPage` pattern: filter card + `DataTable` + review `Drawer` + `Toast`.
- Both tabs default to `status=pending` (approval-first); history accessible via the status filter.

### Device requests tab

- Filters: status (All/Pending/Approved/Rejected).
- Columns: Employee (name + employee ID + branch), Current device, New device, Reason, Status badge, Requested at.
- Row click opens drawer: full details + `review_notes` textarea + **Approve** / **Reject** buttons → `PATCH /api/admin/device-change-requests/{id}`.

### Data requests tab

- Filters: status (All/Pending/Completed/Rejected) + type (All/Access/Deletion).
- Columns: Employee, Type badge, Status badge, Notes, Requested at.
- Row click opens drawer: type, requester, notes + **Complete** / **Reject** buttons → `PATCH /api/admin/data-requests/{id}`.

## Feature 2: Recent Activities on Dashboard

- Full-width `Card` below the 5 stat cards on `DashboardPage`.
- Data: `GET /api/admin/audit-logs?per_page=10`.
- Each row: action-tone icon, human-readable action label, actor name, timestamp.
- `lib/activities.ts` maps raw audit action strings (`attendance.created`, `employee.updated`, `fraud_flag.reviewed`, …) to `{ label, icon, tone }`; unknown actions fall back to a generic label/icon.
- Loading: skeleton rows. Failure: muted non-blocking note (stats still render).

## Types & wiring

- `types.ts`: add `DeviceChangeRequest`, `DataRequest`, `AuditLog` interfaces mirroring the existing Laravel Resources.
- `endpoints.ts`: add `listDeviceChangeRequests`, `reviewDeviceChangeRequest`, `listDataRequests`, `reviewDataRequest`, `listAuditLogs`.

## Verification

- `npm run typecheck` in `web/`.
- Live test as ADMIN001: seed a pending device-change request + data request via tinker, review both from the page, confirm dashboard shows recent activities.
