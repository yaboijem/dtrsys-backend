# Portal PWA Design

**Date:** 2026-08-05  
**Status:** Approved

## Goal

Turn the employee `portal/` React app into an installable Progressive Web App served at the Laravel application root (`/`), with an offline app shell and the existing offline punch queue preserved.

## Decisions

| Topic | Choice |
|-------|--------|
| Scope | Installable shell + offline punch (not full offline-first) |
| Hosting | Same origin via Laravel |
| URL | Root `/` |
| Approach | `vite-plugin-pwa` (Workbox) |
| Offline punches | Keep `localStorage` queue in `offlineQueue.ts` |
| API caching | NetworkOnly for `/api/*` |
| UI redesign | Out of scope — keep ID Badge components |

## Architecture

- **Online:** Unchanged — Sanctum bearer token, GPS + selfie punch, history/alerts/more.
- **Offline shell:** Service worker precaches JS/CSS/HTML/icons so the app opens without network.
- **Offline punch:** Existing queue + `navigator.onLine` / `online` events. SW does not intercept attendance POSTs.
- **Deploy:** Vite builds to `portal/dist/`. A deploy script copies SPA assets into `public/` without deleting `index.php` or `.htaccess`.
- **SPA routing:** Laravel serves built `public/index.html` for non-API browser routes.

## PWA features

1. Web App Manifest — name `DTR Portal`, `display: standalone`, theme `#0c1b2a`, background `#eef4f7`, icons 192/512 (any + maskable).
2. Service worker — precache build assets; navigate fallback to shell; `/api` NetworkOnly.
3. Install prompt — optional in-app banner on `beforeinstallprompt`.
4. Update UX — non-blocking “Update available” when a new SW is waiting.

## Out of scope

- Push notifications
- Caching GET `/api` for offline history/schedule
- IndexedDB / Background Sync migration
- Admin `web/` as PWA
- Visual redesign of punch UI

## Success criteria

- App is installable (manifest + SW + icons) on HTTPS/localhost
- Offline: shell loads; punch can queue; reconnect syncs
- `/api/*` continues to hit Laravel normally
- `public/index.php` and `.htaccess` survive deploy
