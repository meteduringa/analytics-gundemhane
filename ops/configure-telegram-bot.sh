#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${TELEGRAM_WEBHOOK_BASE_URL:-${NEXT_PUBLIC_HOST_URL:-}}"
TOKEN="${TELEGRAM_BOT_TOKEN:-}"
SECRET="${TELEGRAM_WEBHOOK_SECRET:-}"

if [ -z "${BASE_URL}" ]; then
  echo "TELEGRAM_WEBHOOK_BASE_URL veya NEXT_PUBLIC_HOST_URL gerekli." >&2
  exit 1
fi

if [ -z "${TOKEN}" ]; then
  echo "TELEGRAM_BOT_TOKEN gerekli." >&2
  exit 1
fi

WEBHOOK_URL="${BASE_URL%/}/api/telegram/webhook"

curl -fsS "https://api.telegram.org/bot${TOKEN}/setMyCommands" \
  -H "Content-Type: application/json" \
  -d '{
    "commands": [
      { "command": "rakam", "description": "Bugünkü rakamları göster" },
      { "command": "hedef", "description": "Bugünkü hedef durumunu göster" },
      { "command": "siteler", "description": "Yetkili siteleri listele" },
      { "command": "baglan", "description": "Panel hesabını Telegram'a bağla" },
      { "command": "baglantikes", "description": "Telegram bağlantısını kaldır" },
      { "command": "yardim", "description": "Komut yardımını göster" }
    ]
  }'

if [ -n "${SECRET}" ]; then
  curl -fsS "https://api.telegram.org/bot${TOKEN}/setWebhook" \
    -H "Content-Type: application/json" \
    -d "{
      \"url\": \"${WEBHOOK_URL}\",
      \"secret_token\": \"${SECRET}\"
    }"
else
  curl -fsS "https://api.telegram.org/bot${TOKEN}/setWebhook" \
    -H "Content-Type: application/json" \
    -d "{
      \"url\": \"${WEBHOOK_URL}\"
    }"
fi

echo
echo "Webhook ayarlandi: ${WEBHOOK_URL}"
