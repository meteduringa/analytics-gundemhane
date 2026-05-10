#!/usr/bin/env bash
set -euo pipefail

INTERVAL_SECONDS="${ANALYTICS_ALERT_INTERVAL_SECONDS:-60}"
APP_CONTAINER="${ANALYTICS_APP_CONTAINER:-analytics-app-1}"
APP_URL="${ANALYTICS_ALERT_APP_URL:-http://127.0.0.1:3000/api/panel/alert-runner}"
LOCK_FILE="${ANALYTICS_ALERT_LOCK_FILE:-/run/analytics-alert.lock}"

exec 9>"${LOCK_FILE}"
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

  docker ps --format '{{.Names}}' | grep -E 'analytics.*app.*1' | head -n 1
}

APP_CONTAINER="$(resolve_container "${APP_CONTAINER}" analytics-gundemhane-app-1)"

while true; do
  started_at=$(date +%s)
  today=$(TZ=Europe/Istanbul date +%F)

  timeout 20 docker exec -i "${APP_CONTAINER}" wget -q -O /dev/null \
    --header="Content-Type: application/json" \
    --post-data="{\"date\":\"${today}\"}" \
    "${APP_URL}" || true

  elapsed=$(( $(date +%s) - started_at ))
  sleep_for=$(( INTERVAL_SECONDS - elapsed ))
  if [ "${sleep_for}" -lt 1 ]; then
    sleep_for=1
  fi
  sleep "${sleep_for}"
done
