# DTR Portal (PWA)

React + Vite employee portal for Daily Time Record. Installable progressive web app with offline app shell and local offline punch queue.

## Getting started

```bash
npm install
npm run dev
```

**Default is HTTP** so the offline service worker can register on `localhost`.

| Where | URL |
|--------|-----|
| Desktop (offline pack works) | `http://localhost:5173` (dev) or `http://localhost:4174` (preview) |
| Phone LAN | `http://YOUR_PC_IP:5173` — app loads; GPS/camera need a **trusted** HTTPS origin |

Self-signed HTTPS (`VITE_HTTPS=1`) unlocks GPS on phones after the cert warning, but **blocks** the service worker (`SSL certificate error` on `sw.js`). Use real HTTPS (production) or [mkcert](https://github.com/FiloSottile/mkcert) for both GPS + offline on a phone.

```bash
# LAN / mobile (HTTP)
npm run dev:mobile

# Optional self-signed HTTPS (GPS only; offline pack will fail)
# PowerShell: $env:VITE_HTTPS=1; npm run dev:mobile
```

Also run the API:

```bash
php artisan serve --host=0.0.0.0 --port=8000
```

`/api` is proxied to `http://127.0.0.1:8000`. Override with env `VITE_API_PROXY` if needed.

## Production build & Laravel deploy

```bash
# from repo root
npm run build:portal

# or from portal/
npm run deploy
```

Serve Laravel with real HTTPS in production (reverse proxy / hosting). Portal is at `/`; API at `/api`.

### PWA notes

- **HTTPS** (or `localhost`) is required for service worker / install / GPS on phones.
- Service worker precaches the app shell; `/api/*` is **NetworkOnly**.
- Offline punches use `localStorage` and sync when back online.

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Vite HTTPS dev server |
| `npm run dev:mobile` | Same, bound to `0.0.0.0` for LAN |
| `npm run build` | Typecheck + production build → `dist/` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run preview` | Preview `dist/` |
| `npm run icons` | Regenerate PWA icons |
| `npm run deploy` | Build + copy into `../public/` |

## Stack

React 19, Vite 7, Tailwind CSS 4, React Router 7, `vite-plugin-pwa` (Workbox).
