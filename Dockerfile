FROM composer:2 AS vendor
WORKDIR /app
COPY composer.json composer.lock ./
RUN composer install --no-dev --no-scripts --no-autoloader --prefer-dist --no-interaction

FROM node:22-bookworm-slim AS portal
WORKDIR /app
COPY portal/package.json portal/package-lock.json portal/
RUN cd portal && npm ci
COPY . .
RUN cd portal && npm run build

FROM php:8.4-fpm-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
        nginx \
        curl \
        ca-certificates \
        libpng-dev \
        libjpeg62-turbo-dev \
        libfreetype6-dev \
        libzip-dev \
    && docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install -j"$(nproc)" pdo_mysql gd zip bcmath opcache pcntl \
    && rm -rf /var/lib/apt/lists/* \
    && rm -f /etc/nginx/sites-enabled/default

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer
COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY docker/php-fpm.conf /usr/local/etc/php-fpm.conf
COPY docker/uploads.ini /usr/local/etc/php/conf.d/uploads.ini
RUN rm -f /usr/local/etc/php-fpm.d/www.conf /usr/local/etc/php-fpm.d/docker.conf /usr/local/etc/php-fpm.d/zz-docker.conf

WORKDIR /var/www/html

COPY --from=vendor /app/vendor ./vendor
COPY . .
COPY --from=portal /app/portal/dist /tmp/portal-dist
RUN cp -a /tmp/portal-dist/. public/ \
    && rm -rf /tmp/portal-dist \
    && rm -f bootstrap/cache/*.php \
    && composer dump-autoload --optimize --classmap-authoritative --no-scripts --no-interaction \
    && php artisan package:discover --ansi \
    && mkdir -p \
        /tmp/nginx/client_body \
        /tmp/nginx/proxy \
        /tmp/nginx/fastcgi \
        /tmp/nginx/uwsgi \
        /tmp/nginx/scgi \
        storage/framework/cache/data \
        storage/framework/sessions \
        storage/framework/views \
        storage/logs \
        bootstrap/cache \
        /var/lib/nginx \
        /var/log/nginx \
    && chown -R www-data:www-data /var/www/html /tmp/nginx /var/lib/nginx /var/log/nginx \
    && chmod -R ug+rwx storage bootstrap/cache /tmp/nginx

COPY scripts/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

USER www-data
ENV PORT=8080
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8080/up || exit 1

ENTRYPOINT ["docker-entrypoint.sh"]
