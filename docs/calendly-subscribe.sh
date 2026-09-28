#!/bin/bash
# Подписывает CRM на события Calendly (invitee.created / invitee.canceled).
# Запуск:  bash docs/calendly-subscribe.sh
URL="${CRM_URL:-https://wiclubcrm.vercel.app}/api/calendly/webhook"
echo "Вставьте токен Calendly (Cmd+V) и нажмите Enter. Символы не отображаются."
read -r -s -p "Токен: " TOKEN; echo
TOKEN=$(echo "$TOKEN" | tr -d '[:space:]')
if [ -z "$TOKEN" ]; then echo "Токен пустой — запустите ещё раз."; exit 1; fi
echo "Токен получен (${#TOKEN} символов). Шаг 1/2: проверяю аккаунт Calendly..."
ME=$(curl -sS --max-time 20 -H "Authorization: Bearer $TOKEN" https://api.calendly.com/users/me) || { echo "Нет связи с api.calendly.com"; exit 1; }
USER_URI=$(echo "$ME" | python3 -c 'import sys,json;print(json.load(sys.stdin)["resource"]["uri"])' 2>/dev/null)
ORG_URI=$(echo "$ME" | python3 -c 'import sys,json;print(json.load(sys.stdin)["resource"]["current_organization"])' 2>/dev/null)
if [ -z "$USER_URI" ]; then echo "Calendly не принял токен. Ответ:"; echo "$ME"; exit 1; fi
echo "Аккаунт найден. Шаг 2/2: создаю подписку..."
KEY=$(openssl rand -hex 32)
RES=$(curl -sS --max-time 20 -X POST https://api.calendly.com/webhook_subscriptions \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"url\":\"$URL\",\"events\":[\"invitee.created\",\"invitee.canceled\"],\"organization\":\"$ORG_URI\",\"user\":\"$USER_URI\",\"scope\":\"user\",\"signing_key\":\"$KEY\"}")
if echo "$RES" | grep -q '"resource"'; then
  echo
  echo "Готово! Добавьте в Vercel переменную:"
  echo "  Key:   CALENDLY_WEBHOOK_SIGNING_KEY"
  echo "  Value: $KEY"
else
  echo "Calendly вернул ошибку:"; echo "$RES"
fi
