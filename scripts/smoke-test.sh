#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3004}"
EMAIL="teste-$(date +%s)@academia.local"
PASSWORD="SenhaTeste123"

CREATE_RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/register-gym" \
  -H "Content-Type: application/json" \
  -d "{\"gymName\":\"Academia Smoke\",\"ownerName\":\"Teste\",\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")

TOKEN=$(echo "$CREATE_RESPONSE" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).token))")

curl -s -X POST "$BASE_URL/api/members" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"name":"Aluno Smoke","email":"aluno@smoke.local"}' > /tmp/academia-member.json
MEMBER_ID=$(node -e "console.log(require('/tmp/academia-member.json').id)")

curl -s -X POST "$BASE_URL/api/plans" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"name":"Plano Smoke","price_cents":9900,"duration_days":30}' > /tmp/academia-plan.json
PLAN_ID=$(node -e "console.log(require('/tmp/academia-plan.json').id)")

curl -s -X POST "$BASE_URL/api/memberships" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"member_id\":\"$MEMBER_ID\",\"plan_id\":\"$PLAN_ID\"}" > /tmp/academia-membership.json

curl -s -X POST "$BASE_URL/api/checkins" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"member_id\":\"$MEMBER_ID\",\"source\":\"smoke\"}" > /tmp/academia-checkin.json

curl -s "$BASE_URL/api/dashboard/summary" -H "Authorization: Bearer $TOKEN"

echo
 echo "Smoke test finalizado com sucesso. Usuario: $EMAIL"
