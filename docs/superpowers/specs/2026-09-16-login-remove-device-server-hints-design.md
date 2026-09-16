# Remove device/server hints from employee login

**Date:** 2026-09-16  
**Status:** Approved  
**Surfaces:** Expo employee app (`frontend`), employee portal PWA (`portal`)

## Problem

Employee login shows a dev-only footer with the current Device ID, Server URL, and the sentence “Device ID and server URL can be changed after login, or via app config.” That clutter is unnecessary on the sign-in screen; those values are already editable after login (More) or via app config.

## Goal

Login shows only brand + Employee ID + Password (+ error banner). No device/server diagnostics or helper copy on the login page.

## Non-goals

- No change to device ID or server URL persistence, defaults, or More-screen editors
- No change to login API, MFA, or `DEV_OTP_ENABLED` EMP001 prefill
- No change to web admin login

## Design

### UI

Remove the entire `{DEV_OTP_ENABLED ? (…device/server footer…) : null}` block from:

- `frontend/src/screens/LoginScreen.tsx`
- `portal/src/pages/Login.tsx`

### Cleanup

On those screens only:

- Stop destructuring `deviceId` / `serverUrl` from `useAuth()` if unused
- Remove unused `styles.hint` (Expo) if nothing else uses it
- Keep `DEV_OTP_ENABLED` for EMP001 password-field prefill

### Docs

Update `DESIGN.md` login bullet so it no longer claims device/server hints appear on Login (prefill / Get code remain as documented).

## Testing

- Login (dev + non-dev): Employee ID, Password, Login only; no Device/Server footer
- More still saves device ID and server URL
- EMP001 still prefills when `DEV_OTP_ENABLED` is true
