# Portal Local Profile Photo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let portal users set a local profile photo via a camera badge on More, and show that photo on Home + More avatars (device-only, no API).

**Architecture:** Extend shared `Avatar` with optional `src` and `editable` (camera badge + file input + change/remove menu). Persist JPEG data URLs in `localStorage` keyed by `employee_id`. A small `profilePhoto` module + `useProfilePhoto` hook feed Home (read-only) and More (edit). Reuse `compressDataUrl` from `lib/image.ts`.

**Tech Stack:** Portal React 19 + TypeScript + Vite PWA, lucide-react icons, existing theme tokens.

**Spec:** `docs/superpowers/specs/2026-09-16-portal-profile-photo-design.md`

## Global Constraints

- Portal only (`portal/`); no backend, no Expo `frontend`, no admin `web/` avatars.
- Storage: local device only; key `dtr_profile_photo_<employee_id>`; JPEG data URL after client compress (max edge 384, quality 0.8).
- Upload: file picker `accept="image/*"` only (no camera capture).
- Home: display photo, no camera badge. More: camera badge bottom-right; change + remove when photo exists.
- Photo survives logout; cleared only via Remove.
- Multi-user: different `employee_id` keys must not share photos.
- No new test runner (portal has none). Verify with `npm run typecheck` in `portal/` + manual checks listed per task.
- YAGNI: no server sync, no square crop UI, no IndexedDB.

## File map

| File | Responsibility |
|------|----------------|
| `portal/src/config.ts` | `STORAGE_KEYS.profilePhotoPrefix` |
| `portal/src/lib/profilePhoto.ts` | key/get/set/remove, file→dataURL, change event |
| `portal/src/lib/useProfilePhoto.ts` | React hook: src + setFromFile + remove + error |
| `portal/src/components/Feedback.tsx` | `Avatar` src + editable camera UI |
| `portal/src/pages/More.tsx` | Wire editable avatar + error banner |
| `portal/src/pages/Home.tsx` | Wire read-only `src` |
| `DESIGN.md` | One-line portal Avatar note if needed |

---

### Task 1: Profile photo storage module

**Files:**
- Modify: `portal/src/config.ts`
- Create: `portal/src/lib/profilePhoto.ts`

**Interfaces:**
- Consumes: `compressDataUrl` from `./image`
- Produces:
  - `STORAGE_KEYS.profilePhotoPrefix = 'dtr_profile_photo_'`
  - `PROFILE_PHOTO_EVENT = 'dtr:profile-photo'`
  - `profilePhotoKey(employeeId: string): string`
  - `getProfilePhoto(employeeId: string): string | null`
  - `setProfilePhoto(employeeId: string, dataUrl: string): void`
  - `removeProfilePhoto(employeeId: string): void`
  - `fileToProfilePhotoDataUrl(file: File): Promise<string>`
  - `subscribeProfilePhoto(listener: () => void): () => void`

- [ ] **Step 1: Add storage key prefix**

In `portal/src/config.ts`, add to `STORAGE_KEYS`:

```ts
export const STORAGE_KEYS = {
  token: 'dtr_token',
  user: 'dtr_user',
  serverUrl: 'dtr_server_url',
  deviceId: 'dtr_device_id',
  offlineQueue: 'dtr_offline_queue',
  theme: 'dtr_theme',
  profilePhotoPrefix: 'dtr_profile_photo_',
} as const;
```

- [ ] **Step 2: Create `profilePhoto.ts`**

```ts
import { STORAGE_KEYS } from '../config';
import { compressDataUrl } from './image';

export const PROFILE_PHOTO_EVENT = 'dtr:profile-photo';

const MAX_EDGE = 384;
const QUALITY = 0.8;

export function profilePhotoKey(employeeId: string): string {
  return `${STORAGE_KEYS.profilePhotoPrefix}${employeeId}`;
}

export function getProfilePhoto(employeeId: string): string | null {
  if (!employeeId) return null;
  try {
    const value = localStorage.getItem(profilePhotoKey(employeeId));
    if (!value || !value.startsWith('data:image/')) return null;
    return value;
  } catch {
    return null;
  }
}

function notify(employeeId: string): void {
  try {
    window.dispatchEvent(
      new CustomEvent(PROFILE_PHOTO_EVENT, { detail: { employeeId } }),
    );
  } catch {
    // ignore
  }
}

export function setProfilePhoto(employeeId: string, dataUrl: string): void {
  if (!employeeId) throw new Error('employee_id_required');
  if (!dataUrl.startsWith('data:image/')) throw new Error('invalid_image');
  localStorage.setItem(profilePhotoKey(employeeId), dataUrl);
  notify(employeeId);
}

export function removeProfilePhoto(employeeId: string): void {
  if (!employeeId) return;
  try {
    localStorage.removeItem(profilePhotoKey(employeeId));
  } catch {
    // ignore
  }
  notify(employeeId);
}

export async function fileToProfilePhotoDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('not_an_image');
  }
  const dataUrl = await readFileAsDataUrl(file);
  const compressed = await compressDataUrl(dataUrl, MAX_EDGE, QUALITY);
  if (!compressed.startsWith('data:image/')) {
    throw new Error('image_decode_failed');
  }
  return compressed;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') resolve(result);
      else reject(new Error('read_failed'));
    };
    reader.onerror = () => reject(new Error('read_failed'));
    reader.readAsDataURL(file);
  });
}

export function subscribeProfilePhoto(listener: () => void): () => void {
  const onCustom = () => listener();
  const onStorage = (e: StorageEvent) => {
    if (e.key && e.key.startsWith(STORAGE_KEYS.profilePhotoPrefix)) listener();
  };
  window.addEventListener(PROFILE_PHOTO_EVENT, onCustom);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(PROFILE_PHOTO_EVENT, onCustom);
    window.removeEventListener('storage', onStorage);
  };
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck` (workdir: `portal`)  
Expected: PASS (no errors from new module)

- [ ] **Step 4: Commit**

```bash
git add portal/src/config.ts portal/src/lib/profilePhoto.ts
git commit -m "feat(portal): local profile photo storage helpers"
```

---

### Task 2: `useProfilePhoto` hook

**Files:**
- Create: `portal/src/lib/useProfilePhoto.ts`

**Interfaces:**
- Consumes: `getProfilePhoto`, `setProfilePhoto`, `removeProfilePhoto`, `fileToProfilePhotoDataUrl`, `subscribeProfilePhoto`
- Produces: `useProfilePhoto(employeeId: string | null | undefined): { src: string | null; error: string | null; clearError: () => void; setFromFile: (file: File) => Promise<void>; remove: () => void }`

- [ ] **Step 1: Create hook**

```ts
import { useCallback, useEffect, useState } from 'react';

import {
  fileToProfilePhotoDataUrl,
  getProfilePhoto,
  removeProfilePhoto,
  setProfilePhoto,
  subscribeProfilePhoto,
} from './profilePhoto';

export function useProfilePhoto(employeeId: string | null | undefined) {
  const id = employeeId ?? '';
  const [src, setSrc] = useState<string | null>(() => (id ? getProfilePhoto(id) : null));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSrc(id ? getProfilePhoto(id) : null);
    setError(null);
    if (!id) return;
    return subscribeProfilePhoto(() => {
      setSrc(getProfilePhoto(id));
    });
  }, [id]);

  const clearError = useCallback(() => setError(null), []);

  const setFromFile = useCallback(
    async (file: File) => {
      if (!id) return;
      setError(null);
      try {
        const dataUrl = await fileToProfilePhotoDataUrl(file);
        setProfilePhoto(id, dataUrl);
        setSrc(dataUrl);
      } catch {
        setError("Couldn't use that image");
      }
    },
    [id],
  );

  const remove = useCallback(() => {
    if (!id) return;
    setError(null);
    removeProfilePhoto(id);
    setSrc(null);
  }, [id]);

  return { src, error, clearError, setFromFile, remove };
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck` (workdir: `portal`)  
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add portal/src/lib/useProfilePhoto.ts
git commit -m "feat(portal): useProfilePhoto hook for local avatar src"
```

---

### Task 3: Editable `Avatar` with camera badge

**Files:**
- Modify: `portal/src/components/Feedback.tsx` (replace `Avatar` export ~lines 136–168)

**Interfaces:**
- Consumes: `Camera` from `lucide-react`; theme via CSS vars / inline styles matching existing Avatar
- Produces: `Avatar` props:

```ts
{
  name?: string | null;
  size?: number;
  src?: string | null;
  editable?: boolean;
  onPickFile?: (file: File) => void;
  onRemove?: () => void;
}
```

- [ ] **Step 1: Replace `Avatar` implementation**

Keep initials/hue logic. Structure:

1. Outer wrapper: `position: 'relative'`, `width/height: size`, `flexShrink: 0`, `display: 'inline-block'`.
2. Face circle: same as today when no `src`; when `src`, use `<img src={src} alt="" … objectFit: 'cover' />` inside the same circular styles (or background-image). Keep ring `boxShadow`.
3. If `editable`:
   - Hidden `<input ref type="file" accept="image/*" capture undefined />` — onChange call `onPickFile?.(file)` then clear input value.
   - Camera button absolute bottom-right: diameter `Math.max(22, Math.round(size * 0.3))`, `borderRadius: 999`, background `var(--primary)` or theme primary, white border `2px solid #fff`, `Camera` icon size ~55% of badge, `aria-label="Profile photo"`, `type="button"`.
   - Click camera:
     - If no `src`: trigger file input.
     - If `src`: toggle a small menu anchored under/near badge with two buttons: **Change photo** (opens file input), **Remove photo** (calls `onRemove?.()`, closes menu).
   - Menu: absolute, z-index high, card background, border, radius 10, padding 4; buttons full-width, minHeight 44, text left. Click-outside or Escape closes menu (`useEffect` listeners).
4. Do not use `aria-hidden` on the whole control when `editable` — only hide decorative initials/img from AT if needed; camera button must be accessible.

Sketch (adapt to existing imports in file — add `useRef`, `useState`, `useEffect` from react and `Camera` from lucide-react):

```tsx
export function Avatar({
  name,
  size = 44,
  src = null,
  editable = false,
  onPickFile,
  onRemove,
}: {
  name?: string | null;
  size?: number;
  src?: string | null;
  editable?: boolean;
  onPickFile?: (file: File) => void;
  onRemove?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  // ... initials + hue same as current ...

  const badge = Math.max(22, Math.round(size * 0.3));

  const openPicker = () => {
    setMenuOpen(false);
    inputRef.current?.click();
  };

  const onCameraClick = () => {
    if (src) setMenuOpen((v) => !v);
    else openPicker();
  };

  // face + optional img, camera button, menu, hidden input
}
```

Match existing visual language: circular face, primary ring. Camera badge sits on bottom-right overlapping the ring (`right: 0`, `bottom: 0`, `transform` optional slight outward).

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck` (workdir: `portal`)  
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add portal/src/components/Feedback.tsx
git commit -m "feat(portal): Avatar photo src and editable camera badge"
```

---

### Task 4: Wire More (edit) + Home (display)

**Files:**
- Modify: `portal/src/pages/More.tsx`
- Modify: `portal/src/pages/Home.tsx` (header Avatar ~line 653)

**Interfaces:**
- Consumes: `useProfilePhoto`, extended `Avatar`, optional `Banner` for errors on More

- [ ] **Step 1: Wire More**

```tsx
import { useProfilePhoto } from '../lib/useProfilePhoto';
import { Avatar, Banner, SectionCard } from '../components/Feedback';

// inside More():
const employeeId = user?.employee_id ?? null;
const { src: photoSrc, error: photoError, clearError, setFromFile, remove } =
  useProfilePhoto(employeeId);

// in User profile SectionCard, above or below the row:
{photoError ? (
  <Banner kind="warning" title={photoError} detail="Try a different JPG or PNG." />
) : null}

<Avatar
  name={displayName}
  size={52}
  src={photoSrc}
  editable
  onPickFile={(file) => {
    clearError();
    void setFromFile(file);
  }}
  onRemove={remove}
/>
```

Use existing `Banner` API as already used on Home/Consent (check `kind` prop values in `Feedback.tsx` — use a valid kind such as `warning` or `danger`).

- [ ] **Step 2: Wire Home**

Near other hooks in `Home`:

```tsx
const { src: photoSrc } = useProfilePhoto(user?.employee_id);
```

Header:

```tsx
<Avatar name={displayName} size={48} src={photoSrc} />
```

No `editable`.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck` (workdir: `portal`)  
Expected: PASS

- [ ] **Step 4: Manual smoke (dev server)**

Run: `npm run dev` (workdir: `portal`)

Checks:
1. More, no photo → camera → pick image → avatar updates.
2. Home shows same photo, no camera.
3. More → camera → Change photo works; Remove → initials on More and Home.
4. Refresh keeps photo.
5. Invalid file (if easy) → error banner; prior photo kept.

- [ ] **Step 5: Commit**

```bash
git add portal/src/pages/More.tsx portal/src/pages/Home.tsx
git commit -m "feat(portal): profile photo on More and Home avatars"
```

---

### Task 5: DESIGN note + final verify

**Files:**
- Modify: `DESIGN.md` only if portal Avatar is documented as initials-only; otherwise skip or add under portal components if a portal section exists. Prefer a short bullet under mobile/portal components if present; if DESIGN is Expo-only for Avatar, add one line near portal PWA mentions or leave unchanged.

- [ ] **Step 1: Docs**

If updating, state: portal `Avatar` may show a local profile photo; More has a camera badge to upload/remove (device-only).

- [ ] **Step 2: Final typecheck**

Run: `npm run typecheck` (workdir: `portal`)  
Expected: PASS

- [ ] **Step 3: Commit docs if changed**

```bash
git add DESIGN.md
git commit -m "docs: note portal local profile photo on Avatar"
```

(Skip commit if no doc change.)

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Home + More show photo | 4 |
| Camera badge bottom-right on More only | 3, 4 |
| File picker only | 3 |
| Change + remove when photo exists | 3 |
| localStorage per employee_id | 1 |
| compress via image.ts (384 / 0.8) | 1 |
| Survives logout | 1 (no clear on logout) |
| Error message on bad image | 2, 4 |
| No backend | all |
| Cross-tab/same-tab update Home | 1 event + 2 subscribe |

## Self-review notes

- No placeholders; signatures consistent across tasks.
- Portal has no unit test runner — verification is typecheck + manual list.
- `Avatar` remains usable without new props (defaults preserve current behavior).
