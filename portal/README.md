# DTR Portal (PWA)

React + Vite employee portal for Daily Time Record. Installable progressive web app with offline app shell and local offline punch queue.

## Getting started

```bash
npm install
npm run dev
```

Dev uses **HTTPS** (self-signed via `@vitejs/plugin-basic-ssl`) so mobile browsers treat the page as a secure context (GPS + camera).

| Where | URL |
|--------|-----|
| Desktop | `https://localhost:5173` |
| Phone (same Wi‑Fi) | `https://YOUR_PC_IP:5173` |

```bash
# LAN / mobile
npm run dev:mobile
```

On the phone, accept the certificate warning (**Advanced → Proceed**). That is normal for a local self-signed cert.

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
