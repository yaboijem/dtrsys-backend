# Portal Offline Auth + Multi-User Design

**Date:** 2026-08-07  
**Status:** Approved  
**Approach:** A — Minimal fix + multi-account store  

## Goal

Employee `portal/` PWA: log in once online, keep working offline for punches on that device, support multiple saved employees on one device, and push queued punches to the server when connectivity returns so admins see them.

## Decisions

| Topic | Choice |
|-------|--------|
| Scope app | Portal only (`portal/`) |
| Offline capabilities | Punches only (time in/out + breaks) |
| Multi-user | Multi-account switcher on one device |
| Offline session lifetime | Until explicit logout |
| Online re-validate | Soft: network errors keep session; **401** removes that account |
| Queue ownership | Per `userId`; never mix users |
| Sign-out with pending queue | Warn; keep queue tied to account unless user confirms discard |
| Server sync API | Existing `POST /api/attendance/sync` + `client_uuid` idempotency |
| History / schedule offline | Out of scope |
| Admin `web/` / native `frontend/` | Out of scope for this change |
| Background Sync API | Not required; keep `online` event + manual Sync now |

## Current gaps

1. **Auth wipe on offline restore:** `AuthContext` always calls `GET /api/auth/me` on startup; any failure clears token/user — offline reopen fails.
2. **Single session only:** one `dtr_token` / `dtr_user` pair — no multi-employee device.
3. **Queue not user-scoped:** offline queue is global to the browser profile; switching users would mix or mis-attribute punches.

Punch queue, batch flush, PWA shell, and server `SyncService` already exist and stay the foundation.

## Architecture

```
Online login → upsert session in local account store → set active user
                         ↓
App start offline → restore active account (no /me) → authed
App start online  → /me refresh user; 401 → drop account; network err → keep
                         ↓
Punches offline → IndexedDB queue keyed by active userId (+ client_uuid)
                         ↓
online / Sync now → flush active user's queue with that user's token
                         ↓
SyncService idempotent on client_uuid → remove created/duplicate from local queue
```

| Component | Responsibility |
|-----------|----------------|
| `accountStore` | Multi-user sessions: token, user, employeeId, lastUsedAt; activeUserId; migrate legacy keys |
| `AuthContext` | Restore offline; soft online validate; login/MFA; switch account; logout |
| `offlineQueue` | Read/write/flush queue **for active userId only** |
| `SyncService` / attendance routes | Unchanged server behavior |
| Service worker | Unchanged app-shell precache; `/api/*` NetworkOnly |

## Data model

### Account store

Storage key: `dtr_accounts` (localStorage; sufficient for tokens + small user JSON).

```ts
type AccountRecord = {
  token: string;
  user: User;
  employeeId: string; // login identifier for picker UI
  lastUsedAt: string; // ISO
};

type AccountStore = {
  activeUserId: string | null; // User.id as string
  accounts: Record<string, AccountRecord>;
};
```

**Migration (one-time):** if legacy `dtr_token` + `dtr_user` exist and store empty, create one account, set active, remove legacy keys.

### Offline queue (per user)

IndexedDB (existing `idbQueue` helper):

- Prefer shape: `{ [userId: string]: OfflinePunch[] }` under key `offline_queue_by_user`.
- One-time migration from current flat `offline_queue` / legacy `localStorage` list: attach entries to **then-active** user if known; otherwise keep under a `_orphan` bucket only flushable after user claims (or drop orphans if no active user at migrate time — prefer attach to active user when present).

Each `OfflinePunch` keeps existing fields (`client_uuid`, type, timestamp, GPS, selfieUri, attempts, last_error). Do not require embedding `userId` on every row if the map key is authoritative; optional `userId` field is allowed for debugging.

## Auth flows

| Event | Behavior |
|-------|----------|
| First / password login (online) | Existing Sanctum login (+ MFA) → upsert account by `user.id` → set active → authed |
| App start, online, has active | `GET /api/auth/me` with stored token → update cached user on success; **401** → remove that account, clear active if needed, status guest or next account; **network/5xx** → keep stored session, authed |
| App start, offline, has active | Authed from cache; do not call /me; do not wipe |
| App start, no accounts | Guest |
| Login screen, offline, has accounts | Show account picker; tap sets active and enters app (no password) |
| Login screen, offline, no accounts | Message: connect once to sign in on this device |
| Login screen, online | Password form + optional “Saved accounts” list to switch without retyping if token still valid |
| Logout | If pending queue for user → warn; default keep queue on account record until they return; confirm discard clears that user’s queue. Remove account from store; clear active |
| Switch account | Set `activeUserId` + token/user state; load that user’s queue; do not require network |

**Security**

- No passwords stored locally.
- Tokens remain on device until logout (product choice).
- Revocation detected on next successful online validation or 401 during sync/API.
- 401 during sync: stop flush, invalidate that account, prompt re-login when online.

## UI

### Login

- If saved accounts exist: list (display name, employee ID, last used) → tap to activate.
- Primary path for new/other user: employee ID + password (requires network).
- Offline + no accounts: blocking explanation, no fake login.

### Home

- Existing offline banner, gate lamp, queue card, Sync now.
- Queue count and list = **active user only**.

### More / Account

- Show signed-in identity.
- **Switch account** → account picker (same as login list).
- **Sign out** → warning if pending punches; keep-vs-discard as above.

## Sync behavior

Unchanged protocol:

- Batches: ≤50 without photos, ≤5 with photos.
- `client_uuid` required; server returns created/duplicate/failed per row.
- Drop local rows only for created/duplicate.
- On 429/5xx/network: retain queue (existing).
- Flush mutex (`flushing`) remains; switching user waits until flush completes or is safe to abandon mid-flight without deleting unacked rows.

Auto-flush on `window` `online` and existing manual Sync now, always with **active** token + **active** queue.

## Error / edge cases

| Case | Handling |
|------|----------|
| New user offline | Cannot authenticate |
| Flush offline | No-op; keep queue |
| Partial batch | Keep failed rows with attempts/last_error |
| Switch during flush | Wait for in-flight flush; do not apply results to the wrong user’s queue |
| Two browser tabs | Per-tab mutex; last IDB write wins — acceptable v1 |
| Token 401 on sync | Invalidate account; leave unacked queue on that account for after re-login |

## Testing

- Account store: migrate legacy single token; upsert; remove; set active.
- Auth restore: offline keeps session; online 401 drops; online network error keeps.
- Queue isolation: user A enqueue not visible/flushed as B.
- Existing `SyncServiceTest` / attendance sync API tests remain green (no server contract change).
- Manual: airplane after login → punch → online → admin sees row; second employee saved → offline switch → punch → sync under correct employee.

## Success criteria

1. After one online login, app reopens offline as that user without network.
2. At least two saved users can switch offline and punch with isolated queues.
3. Reconnect auto-syncs the active user’s queue; admins see attendance.
4. Brand-new user on device still requires online login.
5. Offline history/schedule not required.

## Implementation touchpoints (expected)

- `portal/src/lib/accountStore.ts` (new)
- `portal/src/auth/AuthContext.tsx`
- `portal/src/lib/offlineQueue.ts` (+ `idbQueue` keys as needed)
- `portal/src/pages/Login.tsx` (account picker)
- `portal/src/pages/Home.tsx` (ensure flush/enqueue use active user)
- `portal/src/config.ts` (storage keys)
- More/Account UI if a dedicated account section exists; else minimal control on Login + logout path

## Out of scope

- Caching GET `/api` for history/schedule
- Push notifications / Background Sync API dependency
- Admin web PWA
- Native app parity (`frontend/`)
- Server-side multi-device session UX changes beyond existing Sanctum tokens
