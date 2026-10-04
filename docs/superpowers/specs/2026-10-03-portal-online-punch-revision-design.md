# Portal online punch revision

**Date:** 2026-10-03
**Status:** Approved
**Surfaces:** Employee portal (`portal`), attendance API (`app`)

## Problem

Home leads with a schedule card and a generic Time In / Break In / Time Out set. The portal also keeps an offline shell: service worker, punch queue, and cached sign-in. Employees need a simpler online-only punch control, named breaks with timers, and a record the web can track later.

## Goal

1. Home no longer shows a schedule.
2. The portal works only while online. Offline punch, offline sign-in, and the offline app shell are removed.
3. The home action follows one control:
   - Clocked out: **Time In**
   - Clocked in: a dropdown of named breaks, last item **Time Out**
   - On a break: **Done Break**, and **Time Out**
   - After Time Out: **Time In** again, including another shift the same day

Every punch is stored so the web can list it. An open break can be closed or edited later by HR. That screen is not in this pass.

## Non-goals

- Web admin UI for listing or overwriting breaks
- Deleting the server sync API or the `is_offline` column
- Removing schedules, shifts, or late calculation from the server or admin app
- Browser push, SMS, or email when a break is about to end
- Enforcing a maximum break length by auto-ending it
- A portal test runner

## Decisions

| Topic | Choice |
|---|---|
| Storage | Existing punch types, plus `break_kind` and `expected_end_at` on the attendance row |
| Timed breaks | `15_min` due 15 minutes after start. `lunch_60` due 60 minutes after start |
| Untimed breaks | `bio`, `phone`, `coaching`, `huddle`, `training`. No due time |
| Warning | In-app notice at 2 minutes before `expected_end_at`. No push |
| Past due | Button stays **Done Break** and shows past due. The app does not close it |
| Time Out during a break | One server transaction writes `break_out`, then `time_out` |
| Selfie | Time In and Time Out only |
| GPS | Every punch, including breaks and Done Break |
| Breaks disabled | Dropdown is only **Time Out**. Server still rejects `break_in` |
| Second shift | Allowed after the previous `time_in` has a `time_out` |
| Several breaks | Allowed in one shift, one open break at a time |
| Offline | Remove it from the portal. Do not queue a failed punch |

## Home action

The punch control is the first thing on Home. Today's punches stay below it. The schedule card is removed, and Home does not call `/api/schedule/today`.

| State | Control | On success |
|---|---|---|
| No open `time_in` | **Time In**. Selfie, then GPS | Dropdown |
| Open `time_in`, no open break | Dropdown: 15 mins break, 1hr Lunch Break, Bio break, Phone time, Coaching, Huddle, Training, **Time Out** | Break: GPS only, then **Done Break**. Time Out: selfie and GPS, then **Time In** |
| Open break | **Done Break**, and **Time Out** | Done Break: GPS only, then the dropdown. Time Out: close the break, selfie and GPS, then **Time In** |

A failed selfie, GPS check, or server response leaves the control in the same state and shows the error. Refresh rebuilds the state from today's punches.

If `breaks_enabled` is false, the clocked-in control is a **Time Out** button, not a break list.

## Records

`attendance.type` stays `time_in`, `time_out`, `break_in`, `break_out`.

Add nullable columns:

| Column | Set on | Value |
|---|---|---|
| `break_kind` | `break_in`, copied onto the matching `break_out` | One of the seven kinds above |
| `expected_end_at` | `break_in`, copied onto the matching `break_out` | Start plus 15 or 60 minutes, or null |

`POST /api/attendance/break-in` requires `break_kind`. Unknown or missing kind is 422. Timed kinds set `expected_end_at` on the server. The client does not send the due time.

`POST /api/attendance/break-out` closes the open break and copies `break_kind` and `expected_end_at` onto that `break_out`.

`POST /api/attendance/time-out` no longer rejects an open break. In the same transaction it writes the `break_out` from the time-out GPS, with no selfie, then writes `time_out` with the selfie and GPS. If either write fails, neither row is kept.

Remove the one-break-per-shift rejection (`hasCompletedBreakSince`). Keep the rejection for a second open break, a break with no open shift, and a break while breaks are disabled.

Another Time In is already allowed once `openTimeInAsOf` finds no open shift. Do not add a one-shift-per-day block.

Attendance JSON for the portal and admin includes `break_kind` and `expected_end_at`. Portal History shows the kind label. An open break is a `break_in` with no later `break_out` in that shift. That is the row HR will overwrite in the web revision. This pass does not add that endpoint or screen.

## Timers

Only `15_min` and `lunch_60` count down. Home reads `expected_end_at` from the server. The remaining time is shown on **Done Break**. At 2 minutes left, an in-app notice says "Your break is about to end." If the tab is closed, nothing is sent. On return after the due time, **Done Break** remains and is labeled "Past due". Untimed breaks show no countdown and no notice. A timed kind with a null `expected_end_at` is shown as untimed. The client does not invent a due time.

## Internet only

Remove from the portal:

- Service worker, offline precache, install prompt, and offline-ready toast
- Offline punch queue in `localStorage` and IndexedDB
- Queued-offline success copy
- Offline session restore on login
- Home and History offline tags and offline banners that offer local punches
- More-screen offline-pack status
- Schedule cache used to show Home while offline

On load, unregister any existing service worker and delete leftover offline-queue data. Do not sync those punches.

Login calls the server. If it cannot be reached, the user stays on the sign-in screen. A stored token is restored only when `/api/auth/me` succeeds. A dropped connection on Home blocks punching and does not save the tap. The copy is "Connect to the internet and try again."

The server sync route and `is_offline` column stay. The portal stops using them.

## Errors

| Case | Result |
|---|---|
| Selfie cancelled, GPS denied, out of radius, or 4xx | Same button state. Show the server or client message |
| Network failure | Same button state. "Connect to the internet and try again." Nothing queued |
| Time Out while on a break, server error | No `break_out` and no `time_out` |
| Break while breaks are disabled | Server 4xx. Portal does not offer the break list |
| Invalid `break_kind` | 422. Button unchanged |

## Testing

API feature tests:

- `15_min` and `lunch_60` store the kind and a due time 15 or 60 minutes after the punch
- An untimed kind stores the kind and a null due time
- A second break in the same shift is accepted after Done Break
- Time Out with an open break writes `break_out` then `time_out`, and copies the kind
- Time Out with no open shift still fails
- Breaks disabled still rejects `break_in`
- Time In after a completed shift succeeds
- Missing or unknown `break_kind` is 422

The portal has no test runner. In the browser, confirm Time In is the first control, the schedule card is gone, a break becomes **Done Break**, Time Out returns to **Time In**, and an offline browser cannot punch.

## Docs

Update `DESIGN.md` and `docs/FEATURES.md` so Home no longer claims a schedule card, offline punch queue, or generic Break In / Break Out as the employee control.
