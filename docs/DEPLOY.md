# Deploy DTR — Hostinger + MySQL 8

The API and employee portal are served from `public/` by the PHP app behind nginx or Apache + PHP-FPM (not the development server). The admin SPA is a separate static build. Photos default to the private local disk, not MySQL.

```
Employee PWA  ── same host as the API (public/)
Admin React   ── static site, same registrable domain if possible
                         │
                         └── MySQL 8
```

## 1. MySQL 8

Create a database and user. Set `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, and `DB_PASSWORD`. Do not use PostgreSQL.

## 2. Shared hosting (PHP)

1. PHP 8.2+ with `pdo_mysql`, `gd`, `zip`, `bcmath`, `intl`.
2. Document root must be `public/`, not the repo root.
3. Build the portal on a machine with Node, then copy `portal/dist` into `public/` without replacing `index.php` or `.htaccess` (`node scripts/deploy-portal.mjs`).
4. Build the admin with `cd web && npm ci && npm run build`. Publish `web/dist` and set `VITE_API_URL` to the API origin.
5. Cron, every minute: `php artisan schedule:run` and, if the queue is `database`, `php artisan queue:work --stop-when-empty --max-time=55`.

On first boot, run `php artisan migrate --force` and cache the app: `php artisan config:cache && php artisan route:cache && php artisan view:cache`.

## 3. Configuration

| Key | Value |
|-----|--------|
| `APP_ENV` | `production` |
| `APP_DEBUG` | `false` |
| `APP_KEY` | `php artisan key:generate --show` |
| `APP_URL` | public https origin |
| `DB_CONNECTION` | `mysql` |
| `QUEUE_CONNECTION` | `database` (or `sync` on a single small box) |
| `CACHE_STORE` | `database` |
| `ATTENDANCE_PHOTO_DISK` | `local` |
| `SESSION_SECURE_COOKIE` | `true` |
| `SESSION_SAME_SITE` | `lax` (use `none` only if admin is a different site, and then Secure must be true) |
| `SANCTUM_EXPIRATION` | `720` |
| `TRUSTED_PROXIES` | Hostinger proxy IPs, or `*` if the app is not exposed directly |
| `CORS_ALLOWED_ORIGINS` | admin origin, no trailing slash |
| `TELESCOPE_ENABLED` | `false` |

Do not set a seeder flag. After the first boot, run `php artisan db:seed` once if you need demo data, then change the seeded password `password`.

## 4. Admin

`VITE_API_URL` is the API origin with no trailing slash. Rebuild after changing it. `CORS_ALLOWED_ORIGINS` must match the admin origin exactly. Browsers authenticate with an httpOnly cookie (`credentials`), not a token in `localStorage`.

Prefer `admin.example.com` and `app.example.com` so `SameSite=Lax` still sends the cookie. A completely different admin domain needs `SESSION_SAME_SITE=none` and `SESSION_SECURE_COOKIE=true`.

## 5. Smoke test

- Employee time in (camera, GPS, and both consents granted)
- Admin attendance selfie opens
- Login response has no `token` field; `dtr_token` is httpOnly
