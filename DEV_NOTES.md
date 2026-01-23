# DEV_NOTES

Bu proje GitHub -> Actions -> VPS deploy hatti ile calisir. Asagidaki notlar
dev ve prod devam etmek icindir.

## Temel hedef
- Site ekleme -> snippet uretme -> log toplama -> panel metrikleri
- Admin tum siteleri gorur, yetkili sadece kendi sitesini gorur.

## Lokal gelistirme
- Proje: `/Users/meteduringa/Desktop/projeler/tur-projesi/analytics-gundemhane`
- Calistir:
  ```
  npm install
  npm run dev
  ```
- Login: `/login`
- Panel: `/panel`
- Ayarlar: `/panel/ayarlar`

## Sunucu (prod) yollar
- Proje: `/var/www/analytics-gundemhane`
- Caddyfile: `/var/www/analytics-gundemhane/Caddyfile`

## Deploy akisi (Actions)
- `main` branch'e push -> GitHub Actions `Deploy to VPS`.
- Sunucuda:
  ```
  git pull origin main
  docker compose up -d --build --force-recreate app caddy
  ```
- DB/Redis kapatilmaz, veri silinmez.

## Actions secrets
- `SSH_HOST` = sunucu IP
- `SSH_USER` = root veya kullanici
- `SSH_KEY` = private key (OpenSSH format)
- `SSH_PORT` = 22 (opsiyonel)

## Docker compose kritik ayar
- Sunucuda bir kez:
  ```
  echo 'COMPOSE_PROJECT_NAME=analytics-gundemhane' > /var/www/analytics-gundemhane/.env
  ```
  Bu, volume isimlerini sabitler (veri kaybini onler).

## Giris bilgileri (seed)
- Email: `admin@analytics.local`
- Sifre: `admin123`
- Seed:
  ```
  cd /var/www/analytics-gundemhane
  npx prisma db seed
  ```

## Auth akisi
- Frontend login -> `/api/panel/login` (DB kontrolu)
- Basarili login:
  - `localStorage.auth = "1"`
  - `localStorage.user = { id, email, role }`

## Ayarlar sayfasi (site ekle)
- Path: `/panel/ayarlar`
- Form:
  - Site Adi
  - Site URL
  - CSP checkbox
  - Yetkili email + sifre
- Kayit API: `src/app/api/panel/sites/route.ts`
  - Admin site olusturur.
  - Yetkili email verilirse user olusturur ve siteye baglar.
- Ekli siteler listesi:
  - Script/Inline snippet kopyala
  - Website ID gosterimi

## Panel (metrikler)
- Path: `/panel`
- Site secimi dropdown (Admin tum siteler, Customer sadece bagli site)
- Metrikler API: `src/app/api/panel/metrics/route.ts`
  - `totalPageviews`
  - `totalDuration`
  - `avgDuration` (kisi basi)
  - `dailyUniqueVisitors`
  - `liveVisitors`
- "1 sn alti okumalari gizle" aktifken:
  - Hem metrikler hem tekil sayimlar filter edilir.

## Snippet
- Site ekleyince snippet DB uzerinden `websiteId` ile uretilir.
- Standart:
  - `<script async src=".../tracker.js" data-website-id="..." ...>`
- CSP varsa inline snippet kullanilir.

## SIK sorunlar
1) Site acilmiyor:
   - `docker ps` ile containerlar calisiyor mu?
   - `docker logs analytics-gundemhane-app-1`
   - `docker logs analytics-gundemhane-caddy-1`

2) Deploy hata veriyor:
   - GitHub Actions -> Deploy to VPS loglarini kontrol et.
   - SSH secrets dogru mu?

3) Veri kaybi:
   - `COMPOSE_PROJECT_NAME` set edilmeli.
   - `docker compose down -v` KULLANMA.

4) 502 hatasi:
   - Caddy `reverse_proxy app:3000` olmali.
   - `docker compose restart caddy`.
