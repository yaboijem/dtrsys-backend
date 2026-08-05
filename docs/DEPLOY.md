# Deploy DTR (free tier) — Render + Neon + R2

This guide deploys **Deploy-v1.0** with **$0 cost** using free tiers only.

```
Employee PWA  ─┐  same host
               ├──────────────────►  Render Web Service (free)
Admin React   ─┘  Static Site (free)         │
                                             ├── Neon PostgreSQL (free)
                                             └── Cloudflare R2 photos (free)
```

### Free-tier tradeoffs (read this)

| Item | Free behavior |
|------|----------------|
| Render Web Service | **Sleeps after ~15 min idle.** First request can take 30–60s. |
| Redis | **Not free on Render.** We use `QUEUE_CONNECTION=sync` + `CACHE_STORE=database` instead. |
| Background workers | **Not free.** Face verify runs **inline** (`ATTENDANCE_ASYNC_FACE=false`). |
| Break scheduler | Runs inside the web container when awake (`ENABLE_SCHEDULER=true`). While asleep, break warnings pause. |
| Neon | Free project; may sleep when idle (wakes on first query). |
| R2 | Free allowance is enough for demos; **required** because Render disk is wiped on redeploy. |
| Custom domain | Optional later; use `*.onrender.com` for free. |

When you outgrow free: add paid Render Redis + worker, set `QUEUE_CONNECTION=redis`, `ATTENDANCE_ASYNC_FACE=true`.

---

## Prerequisites

- GitHub repo with branch **`Deploy-v1.0`** pushed
- Accounts (all free): [Render](https://render.com), [Neon](https://neon.tech), [Cloudflare](https://dash.cloudflare.com) (R2)
- ~30–45 minutes

---

## Step 1 — Neon PostgreSQL (free)

1. Sign in at [console.neon.tech](https://console.neon.tech).
2. **Create project** → name `dtr` → region close to you → PostgreSQL.
3. Open **Dashboard → Connection details**.
4. Copy the **connection string** (URI), e.g.  
   `postgresql://user:pass@ep-xxx.region.aws.neon.tech/neondb?sslmode=require`
5. Keep it for Render as `DB_URL`.

---

## Step 2 — Cloudflare R2 (free photos)

1. Cloudflare Dashboard → **R2 Object Storage** → enable R2 if asked.
2. **Create bucket** → name e.g. `dtr-photos` → create.
3. **Manage R2 API Tokens** → **Create API token**  
   - Permission: Object Read & Write  
   - Apply to your bucket (or all buckets)
4. Copy **Access Key ID** and **Secret Access Key**.
5. Note **Account ID** (R2 overview sidebar).
6. Endpoint will be:  
   `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`

No public bucket needed — Laravel streams photos through the API.

---

## Step 3 — Push code

```bash
git checkout Deploy-v1.0
git pull origin Deploy-v1.0
# ensure latest deploy files are pushed
git push -u origin Deploy-v1.0
```

---

## Step 4 — Render: API + Employee PWA (Docker free)

### Option A — Blueprint (recommended)

1. Render Dashboard → **New** → **Blueprint**.
2. Connect the GitHub repo → branch **`Deploy-v1.0`**.
3. Render reads `render.yaml` and proposes:
   - `dtr-api` (Docker web)
   - `dtr-admin` (static)
4. Before apply, fill **sync: false** secrets (see Step 5).
5. Apply.

### Option B — Manual Web Service

1. **New → Web Service** → connect repo → branch `Deploy-v1.0`.
2. Runtime: **Docker**.
3. Plan: **Free**.
4. Health check path: `/up`.
5. Add env vars from Step 5.

First Docker build can take **10–15 minutes**.

---

## Step 5 — Environment variables (`dtr-api`)

Set these on the **dtr-api** service:

| Key | Value |
|-----|--------|
| `APP_ENV` | `production` |
| `APP_DEBUG` | `false` |
| `APP_KEY` | Generate: `php artisan key:generate --show` locally, paste `base64:…` (or let Render generate if using blueprint) |
| `APP_URL` | Leave empty first deploy; entrypoint sets from `RENDER_EXTERNAL_URL`. Or set `https://dtr-api-xxxx.onrender.com` after you know the URL |
| `APP_TIMEZONE` | `Asia/Manila` |
| `DB_CONNECTION` | `pgsql` |
| `DB_URL` | Neon URI from Step 1 |
| `QUEUE_CONNECTION` | `sync` |
| `CACHE_STORE` | `database` |
| `SESSION_DRIVER` | `database` |
| `ATTENDANCE_ASYNC_FACE` | `false` |
| `ATTENDANCE_PHOTO_DISK` | `s3` |
| `AWS_ACCESS_KEY_ID` | R2 token key |
| `AWS_SECRET_ACCESS_KEY` | R2 token secret |
| `AWS_DEFAULT_REGION` | `auto` |
| `AWS_BUCKET` | `dtr-photos` |
| `AWS_ENDPOINT` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| `AWS_USE_PATH_STYLE_ENDPOINT` | `true` |
| `TELESCOPE_ENABLED` | `false` |
| `FACE_VERIFICATION_PROVIDER` | `mock` |
| `ENABLE_SCHEDULER` | `true` |
| `RUN_SEEDERS` | `false` first; see Step 6 |
| `CORS_ALLOWED_ORIGINS` | Admin URL after Step 7, e.g. `https://dtr-admin-xxxx.onrender.com` |
| `LOG_CHANNEL` | `stderr` |

Deploy / wait until **Live**. Open:

`https://<your-api>.onrender.com/up` → should return OK.

Employee portal:

`https://<your-api>.onrender.com/` → DTR login PWA.

---

## Step 6 — Seed demo users (once)

1. On `dtr-api` → Environment → set `RUN_SEEDERS=true`.
2. **Manual Deploy** → clear build cache optional → Deploy.
3. After success, set `RUN_SEEDERS=false` and deploy again (or just change env; next restart won’t re-seed if you leave false).

Demo logins (password `password`):

| ID | Role |
|----|------|
| `ADMIN001` | Super Admin |
| `HR001` | HR |
| `EMP001` | Employee |

---

## Step 7 — Render Static Site (Admin)

If Blueprint already created `dtr-admin`, set:

| Key | Value |
|-----|--------|
| `VITE_API_URL` | `https://<your-api>.onrender.com` (no trailing slash) |

**Important:** `VITE_*` is baked in at **build** time. After changing it, **redeploy** admin.

Manual setup:

1. **New → Static Site** → same repo, branch `Deploy-v1.0`.
2. Root directory: `web`
3. Build: `npm ci && npm run build`
4. Publish: `dist`
5. Env: `VITE_API_URL=https://<your-api>.onrender.com`
6. Rewrite: `/*` → `/index.html` (SPA)

Then set API `CORS_ALLOWED_ORIGINS` to the admin URL and **restart/redeploy API**.

---

## Step 8 — Smoke test

1. Open **API URL** on phone (HTTPS) → install PWA optional → login `EMP001` / `password`.
2. Allow camera + location → Time In (may be slow on cold start).
3. Open **admin URL** → login `HR001` / `password`.
4. Dashboard + Attendance → open punch → selfie loads (from R2 via API).
5. Fraud flags / schedules pages load.

Cold start: wait up to a minute after sleep; Neon + Render both may wake.

---

## Step 9 — Optional local checks before deploy

```bash
# Admin typecheck
cd web && npx tsc --noEmit

# API tests
cd .. && php artisan test
```

---

## Upgrading later (still optional)

When you can pay a little:

1. Render **Redis** → `CACHE_STORE=redis`, `QUEUE_CONNECTION=redis`, `REDIS_URL=…`
2. Render **Background Worker** → `php artisan queue:work redis --queue=attendance,default`
3. Set `ATTENDANCE_ASYNC_FACE=true`
4. Move web service off free (no sleep) for production punches

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Admin network errors / CORS | `CORS_ALLOWED_ORIGINS` must match admin origin exactly; redeploy API |
| Admin calls wrong host | Rebuild admin with correct `VITE_API_URL` |
| Migrate fails on Neon | Confirm `DB_URL` has `sslmode=require`; check Neon project not deleted |
| Photos 404 after redeploy | Must use R2 (`ATTENDANCE_PHOTO_DISK=s3`), not local disk |
| 502 / spin-up forever | Free tier cold start; check Render logs for migrate errors |
| `APP_KEY` invalid | Set a real key from `php artisan key:generate --show` |
| Build OOM on Docker | Retry; free builders are tight — clear cache and redeploy |

---

## Architecture files in repo

| File | Purpose |
|------|---------|
| `Dockerfile` | PHP 8.3 + portal build + SPA into `public/` |
| `scripts/docker-entrypoint.sh` | migrate, optional seed/scheduler, `artisan serve` |
| `render.yaml` | Free web + free static admin |
| `web/.env.example` | `VITE_API_URL` |
| `.env.example` | Full env reference |
