#!/usr/bin/env bash
set -euo pipefail

API_URL=${API_URL:-http://localhost:3004}
TOKEN=${TOKEN:-}
PLAN_ID=${PLAN_ID:-}
MEMBER_ID=${MEMBER_ID:-}

printf 'Health...\n'
curl -fsS "$API_URL/health"
printf '\n'

if [ -z "$TOKEN" ]; then
  echo "TOKEN nao informado. Exporte TOKEN para validar rotas autenticadas."
  exit 0
fi

printf 'Dashboard...\n'
curl -fsS -H "Authorization: Bearer $TOKEN" "$API_URL/api/dashboard/summary"
printf '\n'

printf 'Alertas...\n'
curl -fsS -H "Authorization: Bearer $TOKEN" "$API_URL/api/alerts"
printf '\n'

printf 'Avaliacoes...\n'
curl -fsS -H "Authorization: Bearer $TOKEN" "$API_URL/api/assessments"
printf '\n'

printf 'Metas...\n'
curl -fsS -H "Authorization: Bearer $TOKEN" "$API_URL/api/goals"
printf '\n'

printf 'Treinos...\n'
curl -fsS -H "Authorization: Bearer $TOKEN" "$API_URL/api/training/plans"
printf '\n'

if [ -n "$PLAN_ID" ]; then
  printf 'Treino avancado detalhe...\n'
  curl -fsS -H "Authorization: Bearer $TOKEN" "$API_URL/api/training/advanced/detail?plan_id=$PLAN_ID"
  printf '\n'
  printf 'Treino avancado review...\n'
  curl -fsS -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"plan_id\":\"$PLAN_ID\"}" "$API_URL/api/training/advanced/review"
  printf '\n'
fi

if [ -n "$MEMBER_ID" ]; then
  printf 'Resumo avaliacao aluno...\n'
  curl -fsS -H "Authorization: Bearer $TOKEN" "$API_URL/api/assessments/summary?member_id=$MEMBER_ID"
  printf '\n'
fi

echo "Validacao completa executada."
