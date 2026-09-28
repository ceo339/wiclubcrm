#!/bin/bash
# Подписывает CRM на события Calendly (invitee.created / invitee.canceled).
# Запуск из Terminal:  bash docs/calendly-subscribe.sh
# Токен вводится скрыто и никуда не сохраняется.
set -e
URL="${CRM_URL:-https://wiclubcrm.vercel.app}/api/calendly/webhook"
read -s -p "Calendly Personal Access Token: " TOKEN; echo
KEY=$(openssl rand -hex 32)
ME=$(curl -s -H "Authorization: Bearer $TOKEN" https://api.calendly.com/users/me)
USER_URI=$(echo "$ME" | python3 -c 'import sys,json;print(json.load(sys.stdin)["resource"]["uri"])')
ORG_URI=$(echo "$ME" | python3 -c 'import sys,json;print(json.load(sys.stdin)["resource"]["current_organization"])')
RES=$(curl -s -X POST https://api.calendly.com/webhook_subscriptions \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"url\":\"$URL\",\"events\":[\"invitee.created\",\"invitee.canceled\"],\"organization\":\"$ORG_URI\",\"user\":\"$USER_URI\",\"scope\":\"user\",\"signing_key\":\"$KEY\"}")
echo "$RES" | python3 -m json.tool
echo
echo "Если выше нет ошибки — добавьте в Vercel переменную:"
echo "CALENDLY_WEBHOOK_SIGNING_KEY=$KEY"
