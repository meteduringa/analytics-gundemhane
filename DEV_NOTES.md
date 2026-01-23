# DEV_NOTES

Bu proje, GitHub -> Actions -> VPS deploy hattiyla calisir.

## Deploy akisi
- `main` branch'e push -> GitHub Actions `Deploy to VPS` tetiklenir.
- Sunucuda `git pull` + `docker compose up -d --build --force-recreate app caddy`.
- DB/Redis kapatilmaz, veri silinmez.

## Sunucu yollar
- Proje: `/var/www/analytics-gundemhane`
- Caddyfile: `/var/www/analytics-gundemhane/Caddyfile`

## Composedaki kritik ayar
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

## Panel akisi
- `/login`: DB tabanli giris (API: `src/app/api/panel/login/route.ts`).
- `/panel`: Site secimi + metrikler (API: `src/app/api/panel/metrics/route.ts`).
- `/panel/ayarlar`: Site ekleme + yetkili olusturma + snippet uretme.
  - Site ekleme API: `src/app/api/panel/sites/route.ts`
  - Ekli siteler listesi burada gorunur.

## Snippet
- Site ekleyince snippet DB uzerinden `websiteId` ile uretilir.
- CSP varsa inline snippet kullanilir.

## Sik sorunlar
1) Site acilmiyor:
   - `docker ps` ile containerlar calisiyor mu?
   - `docker logs analytics-gundemhane-app-1`
   - `docker logs analytics-gundemhane-caddy-1`

2) Deploy hata veriyor:
   - GitHub Actions -> Deploy to VPS loglarini kontrol et.

3) Veri kaybi:
   - `COMPOSE_PROJECT_NAME` set edilmeli.
   - `docker compose down -v` KULLANMA.
