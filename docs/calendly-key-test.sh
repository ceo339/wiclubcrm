#!/bin/bash
# Проверяет, совпадает ли ключ, который у вас есть, с CALENDLY_WEBHOOK_SIGNING_KEY в Vercel.
# Отправляет в CRM тестовый запрос, подписанный этим ключом (так же, как это делает Calendly).
# Запуск: bash docs/calendly-key-test.sh
URL="${CRM_URL:-https://wiclubcrm.vercel.app}/api/calendly/webhook"
echo "Вставьте ключ — то же значение, что вы вставили в Vercel (Cmd+V), и нажмите Enter:"
read -r -s -p "Ключ: " KEY; echo
KEY=$(echo "$KEY" | tr -d '[:space:]')
BODY='{"event":"test.ping","payload":{}}'
T=$(date +%s)
SIG=$(printf '%s' "$T.$BODY" | openssl dgst -sha256 -hmac "$KEY" | sed 's/^.*= //')
RES=$(curl -sS --max-time 20 -X POST "$URL" -H "Content-Type: application/json" \
  -H "Calendly-Webhook-Signature: t=$T,v1=$SIG" -d "$BODY" -w ' HTTP %{http_code}')
echo "Ответ CRM: $RES"
case "$RES" in
  *"HTTP 200"*) echo "✅ Ключ совпадает с Vercel.";;
  *"HTTP 401"*) echo "❌ Ключ НЕ совпадает с тем, что в Vercel (или после изменения не было Redeploy).";;
  *) echo "Неожиданный ответ — пришлите скриншот.";;
esac
