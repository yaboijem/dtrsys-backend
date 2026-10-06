# Open Sessions Pagination — Design

Date: 2026-10-06
Status: Approved by user in chat.

## Purpose

`OpenSessionsPage` loads every open session in one response and renders the full table. Other admin lists paginate on the server and show `PaginationBar`. This change paginates open sessions the same way, and adds a shared page-size control to every `PaginationBar`.

## Scope

In:

- `GET /api/admin/open-sessions` accepts `page` and `per_page` and returns the same `{ data, links, meta }` envelope as other admin lists.
- `OpenSessionsPage` requests page 1 at the shared default page size and renders `PaginationBar`.
- `PaginationBar` offers Show 10, 30, 50, 100, or 500 on every admin list that uses it.
- List endpoints accept `per_page` up to 500.
- One feature test for page 2 and the `per_page` cap.

Out:

- Search, filters, or a new sort.
- SQL `LIMIT`/`OFFSET` inside the open-session CTE. The live set stays small; slice it in PHP after employee enrichment.
- Portal changes. The portal does not call this endpoint.
- Changing close-session behavior, auth, or row fields.

## API

`GET /api/admin/open-sessions`

Query:

- `page`: integer, default 1. Values below 1 are treated as 1.
- `per_page`: integer, default 20 when omitted. Clamped to 1–500. The admin UI only sends 10, 30, 50, 100, or 500. Other callers (portal history at 20, dashboard audit at 12, dropdown lookups at 50 or 100) keep working.

Auth is unchanged: Super Admin and HR only. Branch Manager still gets 403.

`AttendanceService::openSessions()` stays as it is: the CTE, employee lookup, null-employee filter, and `ORDER BY time_in` ascending. Pagination happens after that filter so `total` counts only rows the client can see.

The controller wraps the filtered array in a `LengthAwarePaginator` (path and query set from the request) and returns `JsonResource::collection($paginator)`. That produces the envelope `toPaginated` already parses:

- `data`: the page slice, same object shape as today.
- `links.first`, `links.last`, `links.prev`, `links.next` (null when there is no previous or next page).
- `meta.current_page`, `meta.per_page`, `meta.total`, `meta.last_page`, `meta.from`, `meta.to`.

A page past the last page returns `data: []` and a `meta` block whose `last_page` reflects the real total. Omitting `page` returns page 1. Existing fixtures have fewer than 20 rows, so current `assertJsonCount` and `assertJsonPath('data.0…')` assertions still pass.

## Page size

`PaginationBar` is the shared pagination tool. It gains a Show select with 10, 30, 50, 100, and 500. Choosing a size calls `onPerPageChange` and the page resets to page 1. Default size in the admin UI is 10, the first option. The bar stays hidden when `total` is 0.

Every admin page that already renders `PaginationBar` wires `perPage` into its list request: Attendance, Employees, Branches, Home Locations, Fraud Flags, and Departments/Positions. Dropdown lookups that are not table pagination stay at their current `per_page`. Portal history stays load-more; it does not use `PaginationBar`.

All `paginate(...)` caps move from 100 to 500 through one `Controller::perPage()` helper so 500 is not silently truncated.

## Web

`listOpenSessions(params, token)` takes `PaginationParams` and returns `Paginated<OpenSession>` via `toPaginated`. It is only called from `OpenSessionsPage`.

The page keeps `page` (starting at 1) and `perPage` (starting at 10). Load depends on `token`, `page`, and `perPage`, and stores `result.data` plus the paginated meta. `PaginationBar` sits under the table inside the card, same placement as Branches.

Loading and errors stay as they are: `ErrorState` with retry, and the table shows its loading state only before the first successful load.

After a successful close, reload the current page. If that response has `total > 0` and `page > last_page`, set `page` to `last_page` so the effect loads the previous page instead of leaving an empty table. If `total` is 0, set `page` to 1 and show the existing empty state.

## Testing

Add one feature test in `OpenSessionAdminTest`:

- 21 open time-ins.
- `GET /api/admin/open-sessions?page=2&per_page=20` returns one row, `meta.current_page` 2, `meta.per_page` 20, `meta.total` 21, `meta.last_page` 2, and a non-null `links.prev`.
- `GET /api/admin/open-sessions?per_page=1000` returns `meta.per_page` 500.

There is no frontend test runner for this page. After the UI change, run `npm run typecheck` in `web/`. Run `php artisan test --filter=OpenSessionAdminTest` for the API.

## Error handling

Invalid query values are clamped, not rejected. Close failures still toast and leave the list on the current page. A failed reload after a successful close uses the existing error state.
