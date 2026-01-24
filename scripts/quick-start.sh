#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="/Users/meteduringa/analytics-gundemhane"
SSH_HOST="root@188.245.176.56"

cd "$REPO_DIR"

echo "==> Pulling latest changes"
git pull origin main

echo "==> Pushing local commits (if any)"
git push origin main

echo "==> Connecting to server"
ssh "$SSH_HOST" <<'REMOTE'
set -euo pipefail
cd /var/www/analytics-gundemhane

echo "==> Pulling latest changes"
git pull origin main

echo "==> Applying migrations"
docker compose exec app npx prisma migrate deploy

echo "==> Services status"
docker compose ps
REMOTE
