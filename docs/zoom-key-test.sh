#!/bin/bash
# Проверяет, совпадает ли Secret Token Zoom с ZOOM_WEBHOOK_SECRET_TOKEN в Vercel.
# Запуск: bash docs/zoom-key-test.sh
URL="${CRM_URL:-https://wiclubcrm.vercel.app}/api/zoom/webhook"
echo "Вставьте Secret Token из приложения Zoom (Features → Access) (Cmd+V) и нажмите Enter:"
read -r -s -p "Token: " KEY; echo
KEY=$(echo "$KEY" | tr -d '[:space:]')
BODY='{"event":"test.ping","payload":{}}'
T=$(date +%s)
SIG=$(printf '%s' "v0:$T:$BODY" | openssl dgst -sha256 -hmac "$KEY" | sed 's/^.*= //')
RES=$(curl -sS --max-time 20 -X POST "$URL" -H "Content-Type: application/json" \
  -H "x-zm-request-timestamp: $T" -H "x-zm-signature: v0=$SIG" -d "$BODY" -w ' HTTP %{http_code}')
echo "Ответ CRM: $RES"
case "$RES" in
  *"HTTP 200"*) echo "✅ Токен совпадает с Vercel.";;
  *"HTTP 401"*) echo "❌ Токен НЕ совпадает с Vercel (или после изменения не было Redeploy).";;
  *"HTTP 500"*) echo "❌ В Vercel нет ZOOM_WEBHOOK_SECRET_TOKEN (или не было Redeploy).";;
  *) echo "Неожиданный ответ — пришлите скриншот.";;
esac
