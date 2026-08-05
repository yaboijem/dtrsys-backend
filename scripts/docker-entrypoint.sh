#!/usr/bin/env sh
set -e

cd /var/www/html

# Render injects PORT and external URL
export PORT="${PORT:-10000}"

if [ -n "$RENDER_EXTERNAL_URL" ]; then
  export APP_URL="$RENDER_EXTERNAL_URL"
fi

if [ -z "$DB_URL" ] && [ -n "$DATABASE_URL" ]; then
  export DB_URL="$DATABASE_URL"
fi

if [ -z "$APP_KEY" ]; then
  echo "WARNING: APP_KEY is empty. Set APP_KEY in the host environment."
fi

php artisan config:clear || true
php artisan migrate --force --no-interaction

# Seed only when explicitly requested (first deploy)
if [ "$RUN_SEEDERS" = "true" ]; then
  php artisan db:seed --force --no-interaction || true
fi

php artisan config:cache || true
php artisan route:cache || true
php artisan view:cache || true

# Free tier: no separate worker. Use QUEUE_CONNECTION=sync or database + inline.
# Optional lightweight loop for scheduled break checks (every 60s) in background.
if [ "$ENABLE_SCHEDULER" = "true" ]; then
  php artisan schedule:work &
fi

exec php artisan serve --host=0.0.0.0 --port="$PORT"
