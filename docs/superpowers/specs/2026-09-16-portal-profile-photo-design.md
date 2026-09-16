# Portal user profile photo (local)

**Date:** 2026-09-16  
**Status:** Approved  
**Surfaces:** Employee portal PWA (`portal`) — Home header + More → User profile

## Problem

Portal avatars are initials-only. Users cannot set a personal profile photo. The More page “User profile” card and Home greeting header both show the same initials `Avatar` with no upload control.

## Goal

- Show a circular **profile photo** on **Home** (header) and **More** (User profile) when the user has set one on this device.
- On **More** only, place a **camera badge** on the bottom-right of the avatar so the user can **upload** (file picker) or **remove** their photo.
- Persist the photo **locally per employee** (browser storage). No server API.

## Non-goals

- No backend column, upload API, or admin-web avatar changes
- No camera/selfie capture flow (file picker / gallery only)
- No cross-device sync
- No change to attendance punch selfies
- Expo `frontend` app out of scope unless later requested

## Decisions

| Topic | Choice |
|---|---|
| Surfaces | Home (display) + More (display + edit) |
| Storage | Local device only |
| Upload source | File picker (`accept="image/*"`) only |
| Component approach | Extend shared `Avatar`; small local photo module + hook |

## Design

### UI

**Avatar (shared)**

- Keep current initials + deterministic hue when no photo.
- New optional `src?: string | null`. When set, render the image full-bleed inside the circle (`object-fit: cover`), keep ring/shadow styling.
- New optional `editable?: boolean` (default false). When true:
  - Wrap avatar in a `position: relative` container sized to `size`.
  - Bottom-right circular **camera** button (~28–32% of avatar diameter, min ~22px): primary background, white `Camera` icon (lucide), thin light border, accessible `aria-label`.
  - Hidden `<input type="file" accept="image/*" />` triggered by the control.

**Edit interaction (More only)**

- No photo yet: camera tap → open file picker immediately.
- Photo exists: camera tap → compact action sheet / menu:
  - **Change photo** → file picker
  - **Remove photo** → clear local photo, revert to initials
- After a successful pick: compress, save, update UI immediately (no navigation).

**Home**

- `<Avatar name={displayName} size={48} src={photoSrc} />` — no camera badge.

**More**

- `<Avatar name={displayName} size={52} src={photoSrc} editable … />` with change/remove handlers wired through the profile-photo hook.

### Data & storage

**Key**

- Add `STORAGE_KEYS.profilePhotoPrefix = 'dtr_profile_photo_'` (or equivalent).
- Full key: `dtr_profile_photo_<employee_id>` where `employee_id` is the logged-in user’s employee code string (`user.employee_id`).
- Multi-user on one browser: each employee keeps their own photo; switching accounts loads the matching key.

**Value**

- JPEG data URL produced client-side.
- Target: square-ish display at avatar sizes; compress with existing `compressDataUrl` from `portal/src/lib/image.ts` using a smaller edge (e.g. max edge **384px**, quality **~0.8**) so localStorage stays reasonable.
- Reject / show error if file is not an image or result is unusable.

**Lifetime**

- Photo **survives logout** on the same device (same employee sees it again after re-login).
- Cleared only via **Remove photo**.
- Not cleared by auth logout or token expiry.

### Modules

1. **`portal/src/lib/profilePhoto.ts`**
   - `profilePhotoKey(employeeId: string): string`
   - `getProfilePhoto(employeeId: string): string | null`
   - `setProfilePhoto(employeeId: string, dataUrl: string): void`
   - `removeProfilePhoto(employeeId: string): void`
   - `fileToProfilePhotoDataUrl(file: File): Promise<string>` — FileReader → `compressDataUrl`
   - Notify listeners via `window` `CustomEvent` (e.g. `dtr:profile-photo`) and/or `storage` event so Home updates when More changes in the same tab.

2. **`portal/src/lib/useProfilePhoto.ts`** (or colocated hook)
   - `useProfilePhoto(employeeId: string | null | undefined)` → `{ src, setFromFile, remove, error, clearError }`
   - Subscribes to photo change events; re-reads on `employeeId` change.

3. **`portal/src/components/Feedback.tsx` — `Avatar`**
   - Props: existing `name`, `size`; add `src`, `editable`, `onPickFile?`, `onRemove?` (or internal file input when editable and callbacks for persistence from parent).
   - Prefer parent owning persistence (hook on page) so Avatar stays presentational + file UI only.

### Error handling

- Non-image or decode failure: inline banner or short message near profile on More (“Couldn’t use that image”). Home unaffected.
- Storage quota failure: same error path; do not leave a half-broken UI state (keep previous photo if set fails).

### Docs

- Update `DESIGN.md` portal Avatar / More notes only if they claim initials-only with no photo affordance.

## Testing

- More, no photo: camera opens file picker; valid image shows on avatar; survives refresh.
- Home shows the same photo without camera badge.
- Change photo replaces previous; Remove returns initials on More and Home.
- Second employee on same browser does not see the first employee’s photo.
- Logout + login same employee: photo still present.
- Invalid file: error message; previous photo (if any) kept.
- Avatar without `src`/`editable` still looks and behaves as today.

## Out of scope follow-ups (not this work)

- Server-backed profile photos
- Admin web display of employee profile photos
- Device camera capture for profile
