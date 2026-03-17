#!/usr/bin/env bash
set -euo pipefail

POSTGRES_CONTAINER="${ANALYTICS_POSTGRES_CONTAINER:-analytics-postgres-1}"

if ! docker inspect "${POSTGRES_CONTAINER}" >/dev/null 2>&1; then
  for candidate in analytics-gundemhane-postgres-1; do
    if docker inspect "${candidate}" >/dev/null 2>&1; then
      POSTGRES_CONTAINER="${candidate}"
      break
    fi
  done
fi

docker exec -i "${POSTGRES_CONTAINER}" psql -U analytics -d analytics -c '
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ae_site_type_mode_country_created
ON "analytics_events" ("websiteId","type","mode","countryCode","createdAt" DESC);'

docker exec -i "${POSTGRES_CONTAINER}" psql -U analytics -d analytics -c '
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ae_site_type_mode_country_clientts
ON "analytics_events" ("websiteId","type","mode","countryCode","clientTimestamp" DESC);'

docker exec -i "${POSTGRES_CONTAINER}" psql -U analytics -d analytics -c '
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ae_site_type_mode_event_country_created
ON "analytics_events" ("websiteId","type","mode","eventName","countryCode","createdAt" DESC);'

docker exec -i "${POSTGRES_CONTAINER}" psql -U analytics -d analytics -c '
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ae_site_type_mode_event_country_clientts
ON "analytics_events" ("websiteId","type","mode","eventName","countryCode","clientTimestamp" DESC);'

docker exec -i "${POSTGRES_CONTAINER}" psql -U analytics -d analytics -c '
ANALYZE "analytics_events";
ANALYZE "analytics_daily_simple";
'
