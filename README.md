# Gundemhane Analytics

Gercek zamanli, cok kiracili web analytics sistemi.

## Stack

- Next.js (App Router)
- Prisma + PostgreSQL
- Redis (realtime metrikler)
- Caddy (TLS + reverse proxy)

## VPS (bu kurulum)

Bu sunucuda Node.js + PostgreSQL + Redis kurulu ve uygulama systemd ile calisiyor.

- Uygulama: `http://localhost:3000`
- Domain: `https://analytics.gundemhane.com`

Servis durumu:

```
systemctl status analytics
```

## Docker ile kurulum (alternatif)

```
docker-compose up -d --build
```

## Ortam Degiskenleri

- `DATABASE_URL`
- `REDIS_URL`
- `AUTH_SECRET`
- `NEXTAUTH_URL`
- `NEXT_PUBLIC_HOST_URL`
- `TZ=Europe/Istanbul`

## Default Admin

- Email: `admin@analytics.local`
- Password: `admin123`

## Tracking Snippet

```html
<script async src="https://analytics.gundemhane.com/tracker.js"
  data-website-id="UUID"
  data-host-url="https://analytics.gundemhane.com">
</script>
```

## Events

- Pageview otomatik izlenir.
- Custom event: `trackEvent("name", { any: "json" })`
- Click auto event: `tracker--click--event_name` class ekle.

## Alarms (v1)

- `EVENT_THRESHOLD`: belirli zaman penceresinde event sayisi esigi.
- `ONLINE_BELOW`: online kullanici sayisi esigin altinda.
