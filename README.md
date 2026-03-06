# Analytics Gundemhane - Handover README

Bu README, projeyi devralacak kisi/sohbet icin operasyonel durum + yapilan tum kritik degisiklikleri tek yerde toplar.

## 0) Urunun Amaci, Ne Ise Yarar, Kesin Kurallar

### 0.1 Amac

Bu urunun amaci, coklu haber sitesi/marka icin:

- tek noktadan event toplamak,
- gunluk ozet metrikleri cache'li ve hizli vermek,
- panelde canliya yakin gorunum sunmak,
- operasyonu DNS/TLS/deploy tarafinda stabil tutmaktir.

### 0.2 Ne ise yarar

Sistem su ihtiyaclari cozer:

- Ziyaretci ve pageview gibi temel metrikleri tek panelde izleme
- Site bazli tracker snippet uretme
- Gunluk metrikleri yeniden hesaplama (manual + loop)
- Caddy ile otomatik TLS + reverse proxy
- Coklu siteyi tek backend uzerinden yonetme

### 0.3 Kesin Kurallar (Non-Negotiable)

1. Primary domain `https://giris.elmasistatistik.com.tr` olmalidir.
2. Snippet'lerde `src` ve `data-host-url` ayni hostu gostermelidir (giris domaini).
3. Panel saatleri ve operasyonel tarih yorumu `Europe/Istanbul` bazli olmalidir.
4. `analytics_daily_simple.day` kaydi UTC tutuldugu icin Istanbul gunu DB'de onceki gun `21:00:00` olarak gorunebilir; bu beklenen davranistir.
5. Uretimde Caddy kaynagi `/opt/analytics/Caddyfile` kabul edilir; farkli path'teki Caddyfile prod'u etkilemez.
6. Uretimde aktif stack ile paralel ikinci stack'i 80/443'e bind etmeye calisma.
7. Deploy tek dogru akisi: GitHub Action + serverda `fetch/reset --hard origin/main`.
8. Serverda local drift birikmesine izin verme; drift deploy kirar.
9. Disk doluluk alarmidir; build hatasi goruldugunde once `df -h` ve `/var/lib` boyutu kontrol edilir.
10. Snippet eski domain veriyorsa once `.next` bundle icinde eski domain aranir; sorun buyuk ihtimalle stale build'dir.
11. Yeni domain aktif olsa bile gecis surecinde eski domain gecici olarak proxyde tutulabilir; planli cutover sonrasi kaldirilir.
12. Uretimde degisiklik sonrasi minimum dogrulama: `/api/health = 200` + panel snippet host kontrolu.

### 0.4 Metrik Kurallari (Koddan Gelen Net Degerler)

Bu kisim \"1 saniye kurali\" dahil hesaplama kurallarinin net ozetidir.

#### A) Collect API kabul ve guvenlik kurallari

1. Rate limit: IP basina dakikada `120` istek (`/api/collect`).
2. Allowed domain kontrolu: `Origin`/`Referer` hostu site `allowedDomains` listesinde degilse `403`.
3. Gecerli event type:
   - `pageview` -> `PAGEVIEW`
   - `event` -> `EVENT`
   - `bik_pageview` -> `PAGEVIEW` (strict)
   - `bik_ping` -> `EVENT` (strict)
4. BIK strict pageview dedupe: ayni `(websiteId, visitorId, normalizedUrl, referrer)` icin `1500ms` icinde tekrar gelirse drop edilir.
5. Country code kaynagi: header (`cf-ipcountry` vb.) oncelikli, sonra payload fallback.

#### B) Simple day metrik kurallari (`analytics-simple`)

1. Gun penceresi Istanbul gunune gore alinır.
2. Veri kaynagi onceligi:
   - once `mode=BIK_STRICT` + `countryCode=TR`
   - yoksa `mode=RAW` + `countryCode=TR`
3. Pageview dedupe penceresi: `1500ms`.
4. **1 saniye kurali**: ziyaretci icin toplam ping tabanli gorunur sure `< 1s` ise tekile dahil edilmez.
5. Session inactivity timeout: `35 dk`.
6. Session icinde iki hit arasi max sure katkisi: `1800s` (30 dk cap).
7. Last page estimate: session sonuna `30s` eklenir.
8. Direct unique sayimi:
   - ilk referrer bos olacak
   - URL/referrer/eventData icinde kampanya parametresi olmayacak (`utm_*`, `gclid`, `fbclid`, `pc_source`, vb.)

#### C) BIK strict day metrik kurallari (`bik-strict-metrics`)

1. `mode=BIK_STRICT` pageviewler baz alinir.
2. Istanbul \"bugun\" icin toplamada ek dedupe simule edilir (`1500ms`) (gecmisi mutate etmeden).
3. Session timeout: `strictSessionInactivityMinutes` (default `35`).
4. Max gap: `strictMaxGapSeconds` (default `1800`).
5. Last page estimate: `strictLastPageEstimateSeconds` (default `30`).
6. **Short read filtresi aciksa**: session observed sure `< 1s` ise sayim disi.
7. Direct unique: `isDirectLanding` kuralina gore.

#### D) BIK config default degerleri

- `sessionInactivityMinutes = 30`
- `botPvRate10s = 30`
- `botPv5Min = 200`
- `botPeriodicStddevMs = 200`
- `botNoInteractionMs = 2000`
- `engagementMinVisibleMs = 1000`
- `engagementFullMs = 5000`
- `suspiciousSoftMode = true`
- `strictSessionInactivityMinutes = 35`
- `strictMaxGapSeconds = 1800`
- `strictLastPageEstimateSeconds = 30`
- `strictDirectReferrerEmptyOnly = true`
- `avgTimeMode = SESSION`
- `cookieLessAggressiveness = 1.0`
- `category = GENEL`

## 1) Kisa Ozet (As of 2026-03-06)

- Uretim domain: `https://giris.elmasistatistik.com.tr`
- Health endpoint calisiyor: `GET /api/health -> 200`
- Caddy TLS sertifikasi `giris.elmasistatistik.com.tr` icin alindi.
- Eski domain (`giris.elmasistatistik.com.tr`) gecis surecinde hala reverse proxyde tutuluyor.
- Uretimde aktif legacy container isimleri:
  - `analytics-app-1`
  - `analytics-caddy-1`
  - `analytics-postgres-1`
  - `analytics-redis-1`

## 2) En Kritik Mimari Not (Karismayi engeller)

Sunucuda iki klasor/akisim goruldu:

1. `/opt/analytics`  **(aktif legacy prod akisi buradan okuyor)**
2. `/var/www/analytics-gundemhane` **(yeni compose denemeleri burada yapildi, ama port cakismasi yaratti)**

Calisan `analytics-caddy-1` mount bilgisi:

- `/opt/analytics/Caddyfile -> /etc/caddy/Caddyfile`

Yani domain/proxy degisikligi yaparken `Caddyfile` kaynagi `/opt/analytics/Caddyfile` olmalidir.

## 3) Bu Surecte Gorulen Ana Sorunlar

1. DNS nameserver gecisi gecikti (Cloudflare -> Turhost).
2. TLS hatasi (`tlsv1 alert internal error`) DNS/TLS gecisinde goruldu.
3. Coklu deployment yolu nedeniyle port cakismasi (`0.0.0.0:80 already allocated`).
4. Disk dolulugu (`no space left on device`) build'i kesti.
5. GitHub deploy action `git pull` adiminda local degisiklikler nedeniyle fail oldu.
6. Admin panel snippet'te eski domain gorunmesi (eski build bundle).

## 4) Cozulmus Olanlar

### 4.1 DNS + TLS

- `elmasistatistik.com.tr` NS gecisi Turhost'a yapildi.
- `giris.elmasistatistik.com.tr A -> 188.245.176.56` aktif.
- Caddy logunda sertifika alma basarili:
  - `certificate obtained successfully`
  - `identifier: giris.elmasistatistik.com.tr`

### 4.2 Disk Sorunu

- Root disk `%100` idi.
- Koku dolduran klasor:
  - `/var/lib/docker.bak.2026-02-25-1645` (~43G)
- Silinerek yer acildi, root tekrar saglikli hale geldi.

### 4.3 GitHub Deploy Akisi

- Onceki hata: serverda local degisiklik oldugu icin `git pull` merge fail.
- Kalici fix yapildi: deploy workflow'da hard sync modeline gecildi.

## 5) Yapilan Kod/Git Degisiklikleri (Onemli Commitler)

### Domain migration ve snippet tarafi

- `f362e07` - Primary domain migration (`giris.elmasistatistik.com.tr`)
  - `.github/workflows/deploy.yml`
  - `Caddyfile`
  - `docker-compose.yml`
  - `public/tracker-loader.js`
  - `src/app/panel/ayarlar/page.tsx`
  - `src/components/analytics/AdminWebsites.tsx`
  - `README.md`

- `ac9d4d8` - Deploy tetiklemek icin bos commit.

- `18cafa4` - Deploy workflow kalici duzeltme:
  - `git pull` yerine:
    - `git fetch origin main`
    - `git reset --hard origin/main`

### Daha once yapilan (performans/caching/zaman)

- `ecca3b0` - current day icin cache davranisi hotfix.
- `d7add96` - panelde Istanbul saat gosterimi.
- `af0c321` - live panel refresh 20s + live cache TTL azaltma.

## 6) Uretim Deploy Runbook (Guncel)

> Not: aktif prod containerlari legacy isimlerle calisiyor (`analytics-*`).

### 6.1 Health kontrol

```bash
curl -i https://giris.elmasistatistik.com.tr/api/health
```

### 6.2 Aktif port/container kontrol

```bash
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

### 6.3 Caddy config kaynagi dogrulama

```bash
docker inspect analytics-caddy-1 --format '{{range .Mounts}}{{println .Source "->" .Destination}}{{end}}'
```

## 7) Admin Snippet Eski Domain Sorunu - Koku

Belirti:

- Admin panel snippet'i hala su sekilde gelebilir:
  - `https://giris.elmasistatistik.com.tr/simple-tracker.js`

Neden:

- App'in `.next` bundle'i eski build'den geliyor.
- Client-side kodda domain sabiti build-time bundle'a gomuluyor.

Dogrulama komutu (container ici):

```bash
docker exec -i analytics-app-1 sh -lc "grep -R -n 'giris.elmasistatistik.com.tr' .next | head -n 20 || true"
```

Eger cikti varsa bundle eski.

## 8) Snippet Eski Domain Sorunu - Definitive Fix

Sunucuda:

```bash
cd /opt/analytics
git fetch origin main
git reset --hard origin/main
git clean -fd
```

Kaynak dosya kontrol:

```bash
grep -n "NEXT_PUBLIC_HOST_URL" src/components/analytics/AdminWebsites.tsx src/app/panel/ayarlar/page.tsx
```

`giris.elmasistatistik.com.tr` gormelisin.

Cache'siz image rebuild + recreate:

```bash
DOCKER_BUILDKIT=1 docker build --no-cache -t analytics-app:latest .
docker rm -f analytics-app-1
docker run -d \
  --name analytics-app-1 \
  --restart unless-stopped \
  --network analytics_default \
  --network-alias app \
  -e NODE_ENV=production \
  -e DATABASE_URL='postgresql://analytics:Analytics2025Pass@analytics-postgres-1:5432/analytics?connection_limit=20&pool_timeout=60' \
  -e AUTH_SECRET='change-me' \
  -e NEXTAUTH_URL='https://giris.elmasistatistik.com.tr' \
  -e NEXT_PUBLIC_HOST_URL='https://giris.elmasistatistik.com.tr' \
  -e REDIS_URL='redis://analytics-redis-1:6379' \
  -e TZ='Europe/Istanbul' \
  analytics-app:latest

docker restart analytics-caddy-1
```

Bundle tekrar kontrol:

```bash
docker exec -i analytics-app-1 sh -lc "grep -R -n 'giris.elmasistatistik.com.tr' .next | head -n 20 || true"
```

Bos donmesi gerekir.

Son adim:

- Admin paneli gizli sekmede ac (`https://giris.elmasistatistik.com.tr/login`)
- Hard refresh yap (`Ctrl/Cmd + Shift + R`)
- Snippet'i tekrar kopyala.

## 9) DNS Gecisinde Ogrenilenler

- DNS zone kaydi nereye girildiginden cok, **authoritative NS** onemlidir.
- NS Cloudflare'da ise Turhost panelindeki A kaydi public'e yansimaz.
- NS Turhost'a gecince Turhost A kayitlari aktif olur.

Faydali komutlar:

```bash
dig +short elmasistatistik.com.tr NS
dig +short giris.elmasistatistik.com.tr A
```

## 10) Guvenli Isletim Notlari

- `/var/www/analytics-gundemhane` ile `/opt/analytics` karistirilmamali.
- Prod caddy dosyasi: `/opt/analytics/Caddyfile`.
- Port 80/443 cakismasi varsa yeni stack'i zorlamadan once `docker ps` ile port sahibi kontrol edilmeli.
- Disk dolunca ilk bakilacaklar:
  - `df -h`
  - `sudo du -xhd1 /var | sort -h`
  - eski docker backup klasorleri (`/var/lib/docker.bak.*`)

## 11) Bu README'nin amaci

Bu dokuman, yeni devralan kisinin/sesyonun:

- Neden ayni anda birden fazla deployment yolu gorundugunu,
- Hangi dosyanin gercekten prod'u etkiledigini,
- DNS/TLS/build sorunlarinin nasil ciktigini,
- Ve hangi komutlarla temiz bir final duruma gidilecegini

tek seferde anlamasi icindir.
