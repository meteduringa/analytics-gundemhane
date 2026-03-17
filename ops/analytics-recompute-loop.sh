#!/usr/bin/env bash
set -euo pipefail

INTERVAL_SECONDS="${ANALYTICS_RECOMPUTE_INTERVAL_SECONDS:-60}"
LOOKBACK_MINUTES="${ANALYTICS_RECOMPUTE_LOOKBACK_MINUTES:-10}"
STALE_AFTER_SECONDS="${ANALYTICS_RECOMPUTE_STALE_AFTER_SECONDS:-120}"
POSTGRES_CONTAINER="${ANALYTICS_POSTGRES_CONTAINER:-analytics-postgres-1}"
APP_CONTAINER="${ANALYTICS_APP_CONTAINER:-analytics-app-1}"
APP_URL="${ANALYTICS_RECOMPUTE_APP_URL:-http://127.0.0.1:3000/api/analytics/simple/recompute}"

exec 9>/run/analytics-recompute.lock
flock -n 9 || exit 0

resolve_container() {
  local requested="$1"
  shift

  if docker inspect "${requested}" >/dev/null 2>&1; then
    printf '%s\n' "${requested}"
    return 0
  fi

  for candidate in "$@"; do
    if docker inspect "${candidate}" >/dev/null 2>&1; then
      printf '%s\n' "${candidate}"
      return 0
    fi
  done

  docker ps --format '{{.Names}}' | grep -E 'analytics.*(app|postgres).*1' | head -n 1
}

POSTGRES_CONTAINER="$(resolve_container "${POSTGRES_CONTAINER}" analytics-gundemhane-postgres-1)"
APP_CONTAINER="$(resolve_container "${APP_CONTAINER}" analytics-gundemhane-app-1)"

while true; do
  started_at=$(date +%s)
  today=$(TZ=Europe/Istanbul date +%F)

  site_ids=$(
    docker exec -i "${POSTGRES_CONTAINER}" \
      psql -U analytics -d analytics -t -A -c "
WITH day_bounds AS (
  SELECT
    ((date_trunc('day', now() AT TIME ZONE 'Europe/Istanbul')) AT TIME ZONE 'Europe/Istanbul') AS day_start
),
active_sites AS (
  SELECT DISTINCT e.\"websiteId\" AS id
  FROM \"analytics_events\" e
  WHERE e.\"createdAt\" >= now() - interval '${LOOKBACK_MINUTES} minutes'
),
missing_today AS (
  SELECT w.id
  FROM \"analytics_websites\" w
  CROSS JOIN day_bounds b
  LEFT JOIN \"analytics_daily_simple\" d
    ON d.\"siteId\" = w.id
   AND d.day = b.day_start
  WHERE d.id IS NULL
),
stale_recent AS (
  SELECT DISTINCT e.\"websiteId\" AS id
  FROM \"analytics_events\" e
  CROSS JOIN day_bounds b
  LEFT JOIN \"analytics_daily_simple\" d
    ON d.\"siteId\" = e.\"websiteId\"
   AND d.day = b.day_start
  WHERE e.\"createdAt\" >= now() - interval '${LOOKBACK_MINUTES} minutes'
    AND (d.\"updatedAt\" IS NULL OR d.\"updatedAt\" < now() - interval '${STALE_AFTER_SECONDS} seconds')
)
SELECT id
FROM (
  SELECT id FROM active_sites
  UNION
  SELECT id FROM missing_today
  UNION
  SELECT id FROM stale_recent
) site_ids
ORDER BY id;
" \
      | tr -d '\r' || true
  )

  for site_id in ${site_ids}; do
    timeout 15 docker exec -i "${APP_CONTAINER}" wget -q -O /dev/null \
      --header="Content-Type: application/json" \
      --post-data="{\"siteId\":\"${site_id}\",\"date\":\"${today}\"}" \
      "${APP_URL}" || true
  done

  elapsed=$(( $(date +%s) - started_at ))
  sleep_for=$(( INTERVAL_SECONDS - elapsed ))
  if [ "${sleep_for}" -lt 1 ]; then
    sleep_for=1
  fi
  sleep "${sleep_for}"
done
