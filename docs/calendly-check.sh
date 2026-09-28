#!/bin/bash
# Диагностика интеграции Calendly → CRM.  Запуск: bash docs/calendly-check.sh
URL="${CRM_URL:-https://wiclubcrm.vercel.app}/api/calendly/webhook"
echo "1) Проверяю адрес CRM: $URL"
curl -sS --max-time 20 -X POST "$URL" -H "Content-Type: application/json" -d '{}' -w '   -> HTTP %{http_code}\n'
echo
echo "2) Проверяю подписки в Calendly."
echo "Вставьте токен Calendly (Cmd+V) и нажмите Enter. Символы не отображаются."
read -r -s -p "Токен: " TOKEN; echo
TOKEN=$(echo "$TOKEN" | tr -d '[:space:]')
ME=$(curl -sS --max-time 20 -H "Authorization: Bearer $TOKEN" https://api.calendly.com/users/me)
USER_URI=$(echo "$ME" | python3 -c 'import sys,json;print(json.load(sys.stdin)["resource"]["uri"])' 2>/dev/null)
ORG_URI=$(echo "$ME" | python3 -c 'import sys,json;print(json.load(sys.stdin)["resource"]["current_organization"])' 2>/dev/null)
if [ -z "$USER_URI" ]; then echo "Calendly не принял токен: $ME"; exit 1; fi
curl -sS --max-time 20 -G https://api.calendly.com/webhook_subscriptions \
  -H "Authorization: Bearer $TOKEN" \
  --data-urlencode "organization=$ORG_URI" --data-urlencode "user=$USER_URI" --data-urlencode "scope=user" \
| python3 -c '
import sys,json
d=json.load(sys.stdin)
subs=d.get("collection",[])
if not subs: print("   Подписок НЕТ — подписка не создалась."); print(d)
for s in subs: print("   ", s.get("state"), "|", s.get("callback_url"), "|", ",".join(s.get("events",[])))
'
