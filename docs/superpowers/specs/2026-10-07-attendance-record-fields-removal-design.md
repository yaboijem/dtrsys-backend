# Attendance Page — Remove Device and Early Timeouts — Design

Date: 2026-10-07
Status: Approved by user in chat.

## Purpose

The Attendance page shows a Device row and an Early timeout row in the attendance record drawer, an Early out dropdown in the filters, and an Early out badge in the Status column. Remove all of them.

## Scope

In (`web/src/pages/AttendancePage.tsx`):

- Attendance record drawer: remove the `Device` and `Early timeout` rows.
- Status column: remove the `Early out` badge.
- Filters: remove the `Early out` select.

Out:

- Backend endpoints, queries, and `DashboardController` summary. The API keeps returning `device` and `is_early_timeout`.
- `AttendanceAdmin` TypeScript type in `web/src/api/types.ts`; fields stay because the API still returns them.
- The portal History page, which renders its own "Early out" tag.
- Any other admin page or column.

## Attendance record drawer

In `AttendanceDetail`, delete these two `DetailRow` blocks:

- `Device` — the row renders the device icon, device name and id, or an em dash.
- `Early timeout` — the row renders an amber "Early out" badge or a gray "On time" badge for time-outs, and an em dash otherwise.

The drawer keeps Timestamp, Branch, Work minutes, and Source rows, plus the selfie, GPS, red flags, and notes cards.

`Monitor` is imported only for the Device row, so it is removed from the `lucide-react` import list. No other icon changes.

## Status column

The Status cell currently renders badges in this order: Late, Early out, Overbreak, Offline, Selfie. Remove the `Early out` badge line.

The "no badges" fallback condition currently checks `!r.is_late`, not early, not overbreak, not offline, and no photo. Drop the early-timeout clause from that condition; the remaining four checks are unchanged.

## Filters

- Remove the `Early out` field from the filters card (label "Early out", options All / Early out only / Not early).
- Remove `is_early_timeout` from the `Filters` interface and from `EMPTY_FILTERS`.
- Remove the `is_early_timeout` line from `filtersFromParams`, so `?is_early_timeout=1` or `=0` deep links are ignored.
- Remove the `is_early_timeout` line from the request params builder in `load`, so the filter is never sent.

Removing the key from both `Filters` and `EMPTY_FILTERS` keeps the `hasApplied` and `dirty` JSON comparisons correct.

## Addendum 2026-10-07 — Late and Source removal

Requested by the user during implementation. In addition to the sections above:

- Filters: remove the `Late` and `Source` select fields.
- State: remove `is_late` and `source` from the `Filters` interface and `EMPTY_FILTERS`; remove the `is_late` line from `filtersFromParams`; remove the `is_late` and `source` lines from the `load` params builder.
- Status column: remove the `Late` and `Offline` badges. The "no badges" fallback now checks only Overbreak and Selfie.
- Drawer: remove the `Source` row, leaving Timestamp, Branch, and Work minutes.
- URL deep links with `?is_late=` or `?source=` are ignored.
- Out of scope is unchanged: backend, `AttendanceAdmin` type, portal History.

## Verification

- `npm run typecheck` and `npm run build` in `web/`.
- Browser check on the running admin app:
  1. The filters card has no Early out field; the other filters still apply and reset.
  2. The table Status column shows no Early out badge; Late, Overbreak, Offline, and Selfie badges still render.
  3. Opening an attendance record shows no Device and no Early timeout row; the remaining rows and cards render.
  4. A URL with `?is_early_timeout=1` loads the page without an Early out filter and without sending the parameter.
