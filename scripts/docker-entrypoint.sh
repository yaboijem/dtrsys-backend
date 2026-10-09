#!/bin/sh
set -e

cd /var/www/html

mkdir -p \
  /tmp/nginx/client_body \
  /tmp/nginx/proxy \
  /tmp/nginx/fastcgi \
  /tmp/nginx/uwsgi \
  /tmp/nginx/scgi \
  storage/framework/cache/data \
  storage/framework/sessions \
  storage/framework/views \
  storage/logs \
  bootstrap/cache

if [ -z "$APP_KEY" ]; then
  echo "WARNING: APP_KEY is empty. Set APP_KEY before serving traffic."
fi

php artisan migrate --force --no-interaction
php artisan config:cache
php artisan route:cache
php artisan view:cache

php-fpm --nodaemonize &
PHP_PID=$!

if [ "${ENABLE_SCHEDULER:-true}" = "true" ]; then
  (
    while true; do
      php artisan schedule:run --no-interaction || true
      sleep 60
    done
  ) &
fi

if [ "${QUEUE_CONNECTION:-sync}" != "sync" ]; then
  (
    while true; do
      php artisan queue:work --stop-when-empty --max-time=55 || true
      sleep 5
    done
  ) &
fi

cleanup() {
  kill "$PHP_PID" 2>/dev/null || true
}
trap cleanup TERM INT

nginx -g 'daemon off;' &
NGINX_PID=$!
wait "$NGINX_PID"
