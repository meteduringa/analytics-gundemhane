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

## BIK-like Analytics (MVP)

Bu modül, BIK raporlarına yakın metrikleri aynı gün dakika bazında üretmek için tasarlandi.
Deploy tetikleme notu: bu satır otomatik yayına alınacaktır.

### BIK Tracker Snippet

```html
<script async src="https://analytics.gundemhane.com/bik-tracker.js"
  data-site-id="UUID"
  data-host-url="https://analytics.gundemhane.com">
</script>
```

### BIK_STRICT Tracker Snippet

```html
<script async src="https://analytics.gundemhane.com/bik-strict-tracker.js"
  data-site-id="UUID"
  data-host-url="https://analytics.gundemhane.com">
</script>
```

### BIK_STRICT Notlar (tracker davranisini yansitir)

- Tekil ziyaretci FingerprintJS visitorId ile hesaplanir.
- Pageview tetikleri:
  - `document.readyState === "complete"`
  - `history.pushState/replaceState` URL degisimi
- `url` = `pathname + search` (hash yok)
- `referrer` = `document.referrer` (ham deger)
- Heartbeat yok; sure/sessiyon sayisi server tarafinda pageview farklarindan turetilir.
- FingerprintJS dosyasi CDN yerine sunucudan yuklenir:
  - Beklenen yol: `/fingerprintjs/v3.4.1/fp.min.js`
  - Gerekirse `data-fingerprint-url` ile farkli bir yol verilebilir.

### BIK API Endpoints

- `GET /analytics/realtime?site_id=...`
- `GET /analytics/day?date=YYYY-MM-DD&site_id=...`
- `GET /analytics/health?site_id=...`
- `POST /api/bik/calibration`

### BIK Kurallar (ozet)

- Tekil ziyaretci gunluk hesaplanir; gun icinde birden fazla giris tekildir.
- `engagement_time_ms < 1000` olan oturumlar gecersiz sayilir.
- Bot/suspicious trafik esikleri `BIKConfig` ile ayarlanir.
- Direct trafik: referrer yok + UTM/ref yoksa, veya arama motoru referrer + "/" landing.
- Yurtdisi trafikte `category == GENEL` ise %10 sayim uygulanir.

### Kalibrasyon

Admin panelinde D-1 degerlerini girip kalibrasyon tetikleyebilirsin.
`/api/bik/calibration` endpoint'i mevcut config'i gunceller ve run kaydeder.

## Alarms (v1)

- `EVENT_THRESHOLD`: belirli zaman penceresinde event sayisi esigi.
- `ONLINE_BELOW`: online kullanici sayisi esigin altinda.
