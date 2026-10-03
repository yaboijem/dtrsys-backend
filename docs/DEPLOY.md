# Deploy DTR — Render + MySQL 8

MySQL is not included on the Render free tier. Provision MySQL 8 yourself and pass the connection vars below.

```
Employee PWA  ─┐  same host
               ├──────────────────►  Render Web Service
Admin React   ─┘  Static Site                │
                                             └── MySQL 8
                                                 • app data
                                                 • punch selfies (ATTENDANCE_PHOTO_DISK=database)
```

### Tradeoffs

| Item | Behavior |
|------|----------|
| Render free web | Sleeps after ~15 min idle; cold start 30–60s |
| No Redis / workers | `QUEUE_CONNECTION=sync` |
| Photos in MySQL | Stored as LONGTEXT. Watch `max_allowed_packet` and disk |
| Break scheduler | Runs while the web service is awake |

Full walkthrough is also guided in chat step-by-step. This file is the complete reference.

---

## 1. MySQL 8

1. Create a database and user on your MySQL 8 server.
2. Set `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, and `DB_PASSWORD`. Do not use a PostgreSQL URL.

## 2. Push branch

```bash
git checkout Deploy-v1.0
git push -u origin Deploy-v1.0
```

## 3. Render Web Service (API + Employee PWA)

1. Render → **New → Web Service** (or Blueprint `render.yaml`)  
2. Repo + branch **`Deploy-v1.0`**, runtime **Docker**, plan **Free**  
3. Health check: `/up`  
4. Env:

| Key | Value |
|-----|--------|
| `APP_ENV` | `production` |
| `APP_DEBUG` | `false` |
| `APP_KEY` | `php artisan key:generate --show` output |
| `DB_CONNECTION` | `mysql` |
| `DB_HOST` | MySQL host |
| `DB_PORT` | `3306` |
| `DB_DATABASE` | database name |
| `DB_USERNAME` | database user |
| `DB_PASSWORD` | database password |
| `QUEUE_CONNECTION` | `sync` |
| `CACHE_STORE` | `database` |
| `SESSION_DRIVER` | `database` |
| `ATTENDANCE_PHOTO_DISK` | **`database`** |
| `TELESCOPE_ENABLED` | `false` |
| `ENABLE_SCHEDULER` | `true` |
| `RUN_SEEDERS` | `false` (then `true` once — see below) |
| `CORS_ALLOWED_ORIGINS` | admin URL after step 5 |
| `LOG_CHANNEL` | `stderr` |

5. Deploy → open `https://<api>.onrender.com/up`  
6. Portal: `https://<api>.onrender.com/`

### Seed once

Set `RUN_SEEDERS=true` → redeploy → set back to `false`.  
Logins: `EMP001` / `HR001` / `ADMIN001`, password `password`.

## 4. Admin Static Site

1. **New → Static Site** (repo root — leave **Root Directory empty**)  
2. **Build Command:** `cd web && npm ci && npm run build`  
3. **Publish Directory:** `web/dist` (not `dist`)  
4. `VITE_API_URL=https://<api>.onrender.com` (no trailing slash)  
5. Rewrite `/*` → `/index.html` if available  
6. Set API `CORS_ALLOWED_ORIGINS` to admin origin → redeploy API  


## 5. Smoke test

- Employee Time In (camera + GPS)  
- Admin Attendance → selfie opens  

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| CORS / admin fails | Match `CORS_ALLOWED_ORIGINS` to admin URL; rebuild admin if `VITE_API_URL` wrong |
| Admin refresh → 404 | SPA rewrite `/*` → `/index.html` (200). Build ships `web/public/_redirects`; enable rewrite on the static host if missing |
| Migrate errors | MySQL host, port, database, user, and password |
| Photos missing | `ATTENDANCE_PHOTO_DISK=database` (not `public` on Render) |
| Slow first load | Free cold start — wait and retry |
