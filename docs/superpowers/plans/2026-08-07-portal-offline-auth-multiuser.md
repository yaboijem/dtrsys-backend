# Portal Offline Auth + Multi-User Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Portal employees log in once online, reopen offline with multi-account switching, punch offline into per-user queues, and auto-sync to the server when online.

**Architecture:** Local multi-account store (localStorage) holds Sanctum tokens + cached users. Auth restore trusts cache offline; online soft-validates `/api/auth/me` (401 drops account, network errors keep session). Offline punch queue moves to a per-`userId` IndexedDB map; flush uses the active user's token only. Server `POST /api/attendance/sync` stays unchanged.

**Tech Stack:** portal React 19 + Vite, TypeScript, localStorage, IndexedDB (`idbQueue`), existing Sanctum + `SyncService`, Vitest for unit tests.

**Spec:** `docs/superpowers/specs/2026-08-07-portal-offline-auth-multiuser-design.md`

## Global Constraints

- Portal only (`portal/`) — do not change `frontend/` or `web/` for this feature.
- Punches only offline (time_in/out, break_in/out) — no offline history/schedule API cache.
- No passwords stored locally.
- Session until explicit logout; online **401** removes that account only.
- Queue isolation by `userId` is mandatory.
- Sign-out with pending queue: warn; default keep queue on account unless user confirms discard.
- Do not change server sync contract (`client_uuid` idempotency).
- Prefer small pure modules + thin React wiring; match existing portal UI patterns (theme tokens, `Button`, `Banner`, `ConfirmModal`).

## File map

| File | Responsibility |
|------|----------------|
| `portal/src/config.ts` | Add `accounts` storage key |
| `portal/src/lib/accountStore.ts` | Load/save/migrate multi-account store; list/upsert/remove/setActive |
| `portal/src/lib/offlineQueue.ts` | Per-user queue map; migrate flat queue; enqueue/get/set/flush require `userId` |
| `portal/src/auth/AuthContext.tsx` | Offline restore; soft /me; multi-account API; logout options |
| `portal/src/pages/Login.tsx` | Saved-account picker + offline empty state |
| `portal/src/pages/More.tsx` | Switch account + logout pending-queue warning |
| `portal/src/pages/Home.tsx` | Pass `user.id` into queue APIs; reload queue on user switch |
| `portal/vitest.config.ts` | Unit test runner |
| `portal/src/lib/accountStore.test.ts` | Account store tests |
| `portal/src/lib/offlineQueue.test.ts` | Per-user queue tests |
| `portal/package.json` | `test` script + vitest devDependency |

---

### Task 1: Account store module + Vitest

**Files:**
- Create: `portal/src/lib/accountStore.ts`
- Create: `portal/src/lib/accountStore.test.ts`
- Create: `portal/vitest.config.ts`
- Modify: `portal/src/config.ts`
- Modify: `portal/package.json`
- Test: `portal/src/lib/accountStore.test.ts`

**Interfaces:**
- Consumes: `User` from `portal/src/api/types.ts`; `STORAGE_KEYS` from config
- Produces:
  - `export type AccountRecord = { token: string; user: User; employeeId: string; lastUsedAt: string }`
  - `export type AccountStoreState = { activeUserId: string | null; accounts: Record<string, AccountRecord> }`
  - `export function emptyAccountStore(): AccountStoreState`
  - `export function parseAccountStore(raw: string | null): AccountStoreState`
  - `export function migrateLegacyKeys(getItem, removeItem): AccountStoreState | null` — if legacy `dtr_token`+`dtr_user` present and no accounts key, build one-account store
  - `export function upsertAccount(state, token, user): AccountStoreState` — key = `String(user.id)`, set `employeeId` from `user.employee_id`, `lastUsedAt` = now ISO, set `activeUserId` to that id
  - `export function removeAccount(state, userId: string): AccountStoreState` — delete account; if was active, set active to most recently used remaining or null
  - `export function setActiveUser(state, userId: string): AccountStoreState` — throws if missing; updates `lastUsedAt`
  - `export function listAccounts(state): AccountRecord[]` — sorted by `lastUsedAt` desc
  - `export function loadAccountStore(): AccountStoreState` — localStorage IO + migrate
  - `export function saveAccountStore(state: AccountStoreState): void`

- [ ] **Step 1: Add storage key and Vitest**

In `portal/src/config.ts` add:

```ts
export const STORAGE_KEYS = {
  token: 'dtr_token',
  user: 'dtr_user',
  accounts: 'dtr_accounts',
  serverUrl: 'dtr_server_url',
  deviceId: 'dtr_device_id',
  offlineQueue: 'dtr_offline_queue',
  theme: 'dtr_theme',
} as const;
```

In `portal/package.json` add script `"test": "vitest run"` and devDependency `vitest` (install with `npm install -D vitest` from `portal/`).

Create `portal/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 2: Write failing account store tests**

Create `portal/src/lib/accountStore.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { User } from '../api/types';
import {
  emptyAccountStore,
  listAccounts,
  migrateLegacyKeys,
  parseAccountStore,
  removeAccount,
  setActiveUser,
  upsertAccount,
} from './accountStore';

function fakeUser(id: number, employeeId: string, name = 'User'): User {
  return {
    id,
    employee_id: employeeId,
    name,
    email: `${employeeId}@example.com`,
    is_active: true,
    roles: ['employee'],
    employee: null,
  };
}

describe('accountStore', () => {
  it('parses empty as empty store', () => {
    expect(parseAccountStore(null)).toEqual(emptyAccountStore());
  });

  it('migrates legacy token+user into one account', () => {
    const user = fakeUser(7, 'EMP007');
    const mem: Record<string, string> = {
      dtr_token: 'tok-7',
      dtr_user: JSON.stringify(user),
    };
    const migrated = migrateLegacyKeys(
      (k) => mem[k] ?? null,
      (k) => {
        delete mem[k];
      },
    );
    expect(migrated?.activeUserId).toBe('7');
    expect(migrated?.accounts['7']?.token).toBe('tok-7');
    expect(mem.dtr_token).toBeUndefined();
    expect(mem.dtr_user).toBeUndefined();
  });

  it('upsert sets active and updates lastUsedAt', () => {
    let state = emptyAccountStore();
    state = upsertAccount(state, 't1', fakeUser(1, 'EMP001'));
    state = upsertAccount(state, 't2', fakeUser(2, 'EMP002'));
    expect(state.activeUserId).toBe('2');
    expect(Object.keys(state.accounts)).toHaveLength(2);
  });

  it('removeAccount clears active when last account removed', () => {
    let state = upsertAccount(emptyAccountStore(), 't1', fakeUser(1, 'EMP001'));
    state = removeAccount(state, '1');
    expect(state.activeUserId).toBeNull();
    expect(state.accounts).toEqual({});
  });

  it('setActiveUser switches and listAccounts sorts by lastUsedAt', () => {
    let state = upsertAccount(emptyAccountStore(), 't1', fakeUser(1, 'EMP001'));
    state = upsertAccount(state, 't2', fakeUser(2, 'EMP002'));
    state = setActiveUser(state, '1');
    expect(state.activeUserId).toBe('1');
    const list = listAccounts(state);
    expect(list[0].user.id).toBe(1);
  });
});
```

- [ ] **Step 3: Run tests — expect FAIL**

Run: `npm test` from `portal/`  
Expected: FAIL (module missing or exports missing)

- [ ] **Step 4: Implement `accountStore.ts`**

Implement pure helpers + IO as specified in Interfaces. Migration rules:

- Only migrate when `localStorage.getItem(STORAGE_KEYS.accounts)` is null/empty **and** both legacy token and user parse successfully.
- After building state, `removeItem` legacy token and user keys.
- `userId` keys always `String(user.id)`.
- Invalid JSON → treat as empty store (do not throw from `loadAccountStore`).

- [ ] **Step 5: Run tests — expect PASS**

Run: `npm test` from `portal/`  
Expected: all accountStore tests PASS

- [ ] **Step 6: Commit**

```bash
git add portal/src/config.ts portal/src/lib/accountStore.ts portal/src/lib/accountStore.test.ts portal/vitest.config.ts portal/package.json portal/package-lock.json
git commit -m "feat(portal): multi-account local store with migration"
```

---

### Task 2: Per-user offline queue

**Files:**
- Modify: `portal/src/lib/offlineQueue.ts`
- Create: `portal/src/lib/offlineQueue.test.ts`
- Test: `portal/src/lib/offlineQueue.test.ts`

**Interfaces:**
- Consumes: existing `OfflinePunch`, `idbGet`/`idbSet`, `STORAGE_KEYS.offlineQueue`
- Produces (signatures change — update all call sites in later tasks):
  - `IDB_QUEUE_KEY = 'offline_queue_by_user'`
  - `export type QueueByUser = Record<string, OfflinePunch[]>`
  - `export async function getOfflineQueue(userId: string): Promise<OfflinePunch[]>`
  - `export async function setOfflineQueue(userId: string, items: OfflinePunch[]): Promise<void>`
  - `export async function enqueueOfflinePunch(userId: string, type, coords, selfieUri?, clientUuid?): Promise<OfflinePunch[]>`
  - `export async function flushOfflineQueue(api, token, deviceId, userId: string): Promise<FlushResult>`
  - `export async function clearOfflineQueue(userId: string): Promise<void>` — set that user's list to `[]`
  - `export async function getQueueCount(userId: string): Promise<number>`
  - Internal: migrate flat `offline_queue` array / localStorage list into `QueueByUser` under **provided active userId** when migrating on first read with a userId; if no userId available during orphan read, keep under key `"_orphan"` and never flush `_orphan` unless later claimed (do not auto-flush orphans)

- [ ] **Step 1: Write failing queue isolation tests**

Create `portal/src/lib/offlineQueue.test.ts` testing **pure** helpers extracted for map ops (export them):

```ts
import { describe, expect, it } from 'vitest';
import {
  queueForUser,
  setQueueForUser,
  type QueueByUser,
} from './offlineQueue';
import type { OfflinePunch } from '../api/types';

const punch = (uuid: string): OfflinePunch => ({
  client_uuid: uuid,
  type: 'time_in',
  timestamp: '2026-08-07T01:00:00.000Z',
  latitude: 1,
  longitude: 2,
  accuracy_meters: 5,
  queued_at: '2026-08-07T01:00:00.000Z',
});

describe('queueByUser helpers', () => {
  it('isolates users', () => {
    let map: QueueByUser = {};
    map = setQueueForUser(map, '1', [punch('a')]);
    map = setQueueForUser(map, '2', [punch('b')]);
    expect(queueForUser(map, '1').map((p) => p.client_uuid)).toEqual(['a']);
    expect(queueForUser(map, '2').map((p) => p.client_uuid)).toEqual(['b']);
  });

  it('migrateFlatQueue attaches to active user', () => {
    // export migrateFlatToByUser(flat, activeUserId)
    const { migrateFlatToByUser } = require('./offlineQueue') as typeof import('./offlineQueue');
    const map = migrateFlatToByUser([punch('x')], '9');
    expect(queueForUser(map, '9')).toHaveLength(1);
    expect(queueForUser(map, '1')).toHaveLength(0);
  });
});
```

Prefer ESM named imports for `migrateFlatToByUser` instead of `require`.

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npm test` from `portal/`  
Expected: FAIL on missing exports

- [ ] **Step 3: Implement per-user queue**

Refactor `offlineQueue.ts`:

1. Export pure helpers:
   - `queueForUser(map, userId)` → `map[userId] ?? []`
   - `setQueueForUser(map, userId, items)` → `{ ...map, [userId]: items }`
   - `migrateFlatToByUser(flat, activeUserId: string | null): QueueByUser` — if `activeUserId` use it; else `{ _orphan: flat }`
2. `loadMap()`: idb get `offline_queue_by_user`; if missing, try old idb key `offline_queue` array then localStorage; migrate with **caller-provided userId** on first `getOfflineQueue(userId)` (pass userId into migration).
3. All public APIs take `userId: string` (non-empty). Throw `Error('userId required')` if empty.
4. `flushOfflineQueue` loads only that user's array; writes back only that user's slot; never touches other keys.
5. Keep batch sizes, photo form path, flushing mutex, retry behavior identical.

- [ ] **Step 4: Run tests — expect PASS**

Run: `npm test` from `portal/`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add portal/src/lib/offlineQueue.ts portal/src/lib/offlineQueue.test.ts
git commit -m "feat(portal): scope offline punch queue per user"
```

---

### Task 3: AuthContext offline restore + multi-account API

**Files:**
- Modify: `portal/src/auth/AuthContext.tsx`
- Test: manual + rely on accountStore unit tests; optional light test not required if React testing lib absent

**Interfaces:**
- Consumes: `loadAccountStore`, `saveAccountStore`, `upsertAccount`, `removeAccount`, `setActiveUser`, `listAccounts` from accountStore; `ApiError`
- Produces on context:
  - Existing fields unchanged in meaning
  - `accounts: AccountRecord[]` — from `listAccounts`
  - `switchAccount(userId: string): Promise<void>` — set active offline; no network required
  - `logout(options?: { discardQueue?: boolean }): Promise<void>` — remove active account; if `discardQueue` and userId known, `clearOfflineQueue(userId)`
  - `login` / `verifyMfa` → `upsertAccount` + `saveAccountStore` instead of single token keys

- [ ] **Step 1: Replace restore effect**

Replace startup logic in `AuthContext` with:

```ts
useEffect(() => {
  (async () => {
    try {
      const storedUrl = localStorage.getItem(STORAGE_KEYS.serverUrl);
      const storedDevice = localStorage.getItem(STORAGE_KEYS.deviceId);
      const url = storedUrl || DEFAULT_API_URL;
      apiRef.current.setBaseUrl(url);
      setServerUrlState(url);
      const dev = storedDevice || DEFAULT_DEVICE_ID;
      setDeviceIdState(dev);
      deviceIdRef.current = dev;

      let store = loadAccountStore();
      // ensure migration persisted
      saveAccountStore(store);

      const activeId = store.activeUserId;
      const active = activeId ? store.accounts[activeId] : null;
      if (!active) {
        setStatus('guest');
        return;
      }

      // Optimistic offline-capable restore
      setToken(active.token);
      setUser(active.user);
      setAccountsList(listAccounts(store));

      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setStatus('authed');
        return;
      }

      try {
        const me = await apiRef.current.get<{ data: User }>('/api/auth/me', undefined, active.token);
        store = upsertAccount(store, active.token, me.data);
        saveAccountStore(store);
        setToken(active.token);
        setUser(me.data);
        setAccountsList(listAccounts(store));
        setStatus('authed');
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          store = removeAccount(store, String(active.user.id));
          saveAccountStore(store);
          setToken(null);
          setUser(null);
          setAccountsList(listAccounts(store));
          setStatus('guest');
          return;
        }
        // network / 5xx / status 0 → keep cached session
        setStatus('authed');
      }
    } catch {
      setStatus('guest');
    }
  })();
}, []);
```

Do **not** remove token on generic catch from `/me`.

- [ ] **Step 2: Wire login / MFA / logout / switch**

- `completeLogin`: `store = upsertAccount(loadAccountStore(), token, user); saveAccountStore(store);` set React state; refresh `accounts` list. Stop writing `STORAGE_KEYS.token` / `user` (migration already handled).
- `switchAccount(userId)`: `store = setActiveUser(loadAccountStore(), userId); save; set token/user/status authed`.
- `logout({ discardQueue }?)`:
  1. Try server logout if token (ignore errors).
  2. If `discardQueue` and user id: `await clearOfflineQueue(String(user.id))`.
  3. `removeAccount` + save; clear React auth state to guest (or if other accounts remain, stay guest until they pick one on Login — **stay guest** after logout of active).
- Expose `accounts` via state updated on every store write.
- Fix `useMemo` deps to include `token` and `accounts`.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck` from `portal/`  
Expected: errors only at call sites still using old queue signatures (Home) — fix those in Task 5 if blocked; otherwise AuthContext clean. If typecheck fails only on Home/More, proceed after noting; prefer fixing compile by temporary stubs only if needed — better complete Task 5 next in same session if blocked.

If AuthContext alone typechecks when Home still broken, implement Task 5 immediately after Task 3 in the same agent run order as planned.

- [ ] **Step 4: Commit**

```bash
git add portal/src/auth/AuthContext.tsx
git commit -m "feat(portal): offline session restore and multi-account auth API"
```

---

### Task 4: Login account picker UI

**Files:**
- Modify: `portal/src/pages/Login.tsx`

**Interfaces:**
- Consumes: `accounts`, `switchAccount`, `login` from `useAuth()`
- Produces: UI only

- [ ] **Step 1: Add picker + offline empty state**

Behavior:

1. `const online = navigator.onLine` state with `online`/`offline` listeners.
2. If `accounts.length > 0`, show a “Saved on this device” list above or instead of the form:
   - Each row: `user.name` or employee full_name, `employeeId`, optional last used (format with existing `formatDateTime` if suitable).
   - Tap → `await switchAccount(String(record.user.id)); navigate('/home')`.
3. Button/link “Use another account” toggles password form visible (`showPasswordForm` state; default `true` if no accounts, `false` if accounts exist and offline).
4. Password `Login` button: if `!online`, set error “Connect to the internet to sign in with a password.” and do not call API.
5. If `!online && accounts.length === 0`: show `Banner` kind info/warning: title “You're offline”, detail “Connect once to sign in on this device.” Hide password submit or disable it.
6. Keep MFA navigate behavior.

Match existing card styling (colors, spacing, radius).

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck` from `portal/`  
Expected: Login-related errors gone

- [ ] **Step 3: Commit**

```bash
git add portal/src/pages/Login.tsx
git commit -m "feat(portal): saved-account picker for offline multi-user login"
```

---

### Task 5: Home + More wire-up (user-scoped queue, switch, logout)

**Files:**
- Modify: `portal/src/pages/Home.tsx`
- Modify: `portal/src/pages/More.tsx`

**Interfaces:**
- Consumes: `user`, `token`, queue APIs with `userId`, `switchAccount`, `accounts`, `logout({ discardQueue })`, `getOfflineQueue(userId)`, `getQueueCount` optional

- [ ] **Step 1: Update Home queue calls**

- `const userId = user ? String(user.id) : ''`
- Every `getOfflineQueue()` → `getOfflineQueue(userId)` (guard: if no userId, skip).
- `enqueueOfflinePunch(...)` → first arg `userId`.
- `flushOfflineQueue(api, token, deviceId, userId)`.
- On `user?.id` change: reset `queue`, `syncedLocal`, reload queue, `runFlush` (dependency array includes `userId`).
- Keep online listener behavior.

- [ ] **Step 2: Update More logout + switch**

1. Import `getOfflineQueue` (or `getQueueCount`).
2. Before confirm logout, async load pending count for `String(user.id)`.
3. If pending > 0, `ConfirmModal` message:

   `You have N punch(es) waiting to sync. Sign out keeps them on this device for when you return. Discard removes them permanently.`

   Use two-step or single modal with:
   - Confirm label default: `Sign out` → `logout({ discardQueue: false })`
   - Secondary destructive optional: add second button only if easy; else follow-up: after first confirm with keep, done. Spec: keep by default. Implement **one** modal: confirm = keep queue + logout; add checkbox or second `ConfirmModal` flow:
     - Modal 1: “Log out?” with message including pending warning; confirm → `logout({ discardQueue: false })`.
     - If pending > 0, show extra button “Sign out and discard queue” calling `logout({ discardQueue: true })`.

4. Add **Switch account** button when `accounts.length > 1`:
   - `logout` is wrong here — use `navigate('/login')` after setting status... Actually switch should not remove account. Prefer: `navigate('/login')` and set guest without removing? Spec: switch via picker. Implement `switchAccount` from list on More **or** navigate to login while staying able to pick accounts.
   - Clean approach: navigate to `/login` and call a new auth method `returnToAccountPicker()` that sets status to `guest` **without** removing accounts (token cleared from React state only).

Add to AuthContext:

```ts
parkSession(): void {
  setToken(null);
  setUser(null);
  setStatus('guest');
  // do NOT remove from account store; clear activeUserId optional:
  // store.activeUserId = null; save — so restore won't auto-enter until pick
}
```

On park: set `activeUserId` to `null` in store (accounts remain). Login picker shows all accounts.  
On app start with `activeUserId null` → guest even if accounts exist (shows picker). **Adjust Task 3 restore:** if accounts exist but `activeUserId` null → guest (already).

Switch account on More: `parkSession(); navigate('/login')`.

- [ ] **Step 3: Typecheck + unit tests**

Run from `portal/`:

```
npm test
npm run typecheck
```

Expected: all PASS / no errors

- [ ] **Step 4: Commit**

```bash
git add portal/src/pages/Home.tsx portal/src/pages/More.tsx portal/src/auth/AuthContext.tsx
git commit -m "feat(portal): per-user queue on Home and multi-account More actions"
```

---

### Task 6: Verification checklist (manual) + docs touch

**Files:**
- Modify: `docs/superpowers/specs/2026-08-05-portal-pwa-design.md` — one-line note that offline auth multi-user is specified in 2026-08-07 spec (optional cross-link only)
- No server changes

- [ ] **Step 1: Automated verification**

```
cd portal
npm test
npm run typecheck
```

Expected: PASS

- [ ] **Step 2: Manual checklist (document results in commit message or leave for QA)**

1. Online login EMP A → airplane mode → refresh → still on Home as A.
2. Offline punch time_in → queue shows 1 → go online → auto-sync → admin/history shows punch for A.
3. Online login EMP B on same browser → airplane → switch to A via Login picker → punch → online → punch attributed to A not B.
4. B's queue never appears while A active.
5. New browser profile offline → cannot password login; message shown.
6. Logout with pending: keep queue → log back as same user offline → queue still present.
7. 401 path: only testable if token revoked server-side — optional.

- [ ] **Step 3: Commit** (if any doc cross-link)

```bash
git add docs/superpowers/specs/2026-08-05-portal-pwa-design.md
git commit -m "docs: link portal PWA design to offline multi-user auth spec"
```

Or skip if no doc edit.

---

## Self-review (plan vs spec)

| Spec requirement | Task |
|------------------|------|
| Multi-account store + migrate legacy | Task 1 |
| Offline restore without wipe | Task 3 |
| Soft /me; 401 drops; network keeps | Task 3 |
| Per-user queue + migrate flat | Task 2 |
| Flush with active token only | Task 2 + 5 |
| Login picker + offline empty | Task 4 |
| Switch account | Task 3 `parkSession` + Task 5 More |
| Logout warn; keep vs discard queue | Task 5 |
| SyncService unchanged | No server task |
| Punches only / portal only | Global constraints |
| Until logout session | Task 3 |

No TBD placeholders. Signatures consistent: `userId: string` on all queue APIs; account keys `String(user.id)`.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-07-portal-offline-auth-multiuser.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — this session with executing-plans checkpoints  

Which approach?
