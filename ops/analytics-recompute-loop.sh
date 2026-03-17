#!/usr/bin/env bash
set -euo pipefail

INTERVAL_SECONDS="${ANALYTICS_RECOMPUTE_INTERVAL_SECONDS:-60}"
POSTGRES_CONTAINER="${ANALYTICS_POSTGRES_CONTAINER:-analytics-postgres-1}"
APP_CONTAINER="${ANALYTICS_APP_CONTAINER:-analytics-app-1}"
APP_URL="${ANALYTICS_RECOMPUTE_APP_URL:-http://127.0.0.1:3000/api/analytics/simple/recompute}"

exec 9>/run/analytics-recompute.lock
flock -n 9 || exit 0

while true; do
  started_at=$(date +%s)
  today=$(TZ=Europe/Istanbul date +%F)

  site_ids=$(
    docker exec -i "${POSTGRES_CONTAINER}" \
      psql -U analytics -d analytics -t -A -c 'SELECT id FROM "analytics_websites" ORDER BY id;' \
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
