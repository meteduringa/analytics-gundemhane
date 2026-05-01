#!/usr/bin/env bash
set -euo pipefail

POSTGRES_CONTAINER="${ANALYTICS_POSTGRES_CONTAINER:-analytics-postgres-1}"
LOCK_TIMEOUT_MS="${ANALYTICS_INDEX_LOCK_TIMEOUT_MS:-2000}"
STATEMENT_TIMEOUT_MS="${ANALYTICS_INDEX_STATEMENT_TIMEOUT_MS:-1800000}"

if ! docker inspect "${POSTGRES_CONTAINER}" >/dev/null 2>&1; then
  for candidate in analytics-gundemhane-postgres-1; do
    if docker inspect "${candidate}" >/dev/null 2>&1; then
      POSTGRES_CONTAINER="${candidate}"
      break
    fi
  done
fi

run_sql() {
  local sql="$1"

  if ! docker exec -i \
    -e PGOPTIONS="-c lock_timeout=${LOCK_TIMEOUT_MS} -c statement_timeout=${STATEMENT_TIMEOUT_MS}" \
    "${POSTGRES_CONTAINER}" \
    psql -v ON_ERROR_STOP=1 -U analytics -d analytics -c "${sql}"; then
    echo "Skipped due to lock/timeout: ${sql}" >&2
  fi
}

run_sql 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ae_site_type_mode_country_created
ON "analytics_events" ("websiteId","type","mode","countryCode","createdAt" DESC);'

run_sql 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ae_site_type_mode_country_clientts
ON "analytics_events" ("websiteId","type","mode","countryCode","clientTimestamp" DESC);'

run_sql 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ae_site_type_mode_event_country_created
ON "analytics_events" ("websiteId","type","mode","eventName","countryCode","createdAt" DESC);'

run_sql 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ae_site_type_mode_event_country_clientts
ON "analytics_events" ("websiteId","type","mode","eventName","countryCode","clientTimestamp" DESC);'

run_sql 'ANALYZE "analytics_events";'
run_sql 'ANALYZE "analytics_daily_simple";'
