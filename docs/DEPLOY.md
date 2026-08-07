# Deploy DTR (free tier) — Render + Neon only

No Cloudflare / no credit card required.

```
Employee PWA  ─┐  same host
               ├──────────────────►  Render Web Service (free)
Admin React   ─┘  Static Site (free)         │
                                             └── Neon PostgreSQL (free)
                                                 • app data
                                                 • punch selfies (ATTENDANCE_PHOTO_DISK=database)
```

### Free-tier tradeoffs

| Item | Behavior |
|------|----------|
| Render free web | Sleeps after ~15 min idle; cold start 30–60s |
| No Redis / workers | `QUEUE_CONNECTION=sync`, face check inline |
| Photos in Neon | No R2; watch free storage (~0.5 GB) |
| Break scheduler | Runs while the web service is awake |

Full walkthrough is also guided in chat step-by-step. This file is the complete reference.

---

## 1. Neon PostgreSQL

1. [console.neon.tech](https://console.neon.tech) → create project  
2. Copy **connection URI** with `sslmode=require` → use as `DB_URL`

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
| `DB_CONNECTION` | `pgsql` |
| `DB_URL` | Neon URI |
| `QUEUE_CONNECTION` | `sync` |
| `CACHE_STORE` | `database` |
| `SESSION_DRIVER` | `database` |
| `ATTENDANCE_PHOTO_DISK` | **`database`** |
| `ATTENDANCE_ASYNC_FACE` | `false` |
| `TELESCOPE_ENABLED` | `false` |
| `ENABLE_SCHEDULER` | `true` |
| `RUN_SEEDERS` | `false` (then `true` once — see below) |
| `CORS_ALLOWED_ORIGINS` | admin URL after step 5 |
| `FACE_VERIFICATION_PROVIDER` | `mock` |
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
| Migrate errors | Neon URI + `sslmode=require` |
| Photos missing | `ATTENDANCE_PHOTO_DISK=database` (not `public` on Render) |
| Slow first load | Free cold start — wait and retry |
