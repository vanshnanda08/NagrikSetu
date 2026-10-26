#!/usr/bin/env bash
set -euo pipefail

: "${EVALUATION_ALLOW_RESET:?Set EVALUATION_ALLOW_RESET=yes for a disposable database}"
if [[ "$EVALUATION_ALLOW_RESET" != "yes" ]]; then
  echo "EVALUATION_ALLOW_RESET must equal yes; this benchmark truncates application data." >&2
  exit 2
fi
: "${DATABASE_URL:?Point DATABASE_URL at the disposable database used by the running API}"
: "${ADMIN_EMAIL:?Set the benchmark administrator email}"
: "${ADMIN_PASSWORD:?Set the benchmark administrator password}"

API="${API:-http://localhost:8080/api/v1}"
mkdir -p artifacts/evaluation
printf 'scale,requests,p50_ms,p95_ms,p99_ms,average_ms,failure_rate\n' \
  > artifacts/evaluation/ingest-latency.csv

for scale in 1000 10000 50000; do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v scale="$scale" -f evaluation/prefill.sql
  SCALE="$scale" API="$API" k6 run --quiet evaluation/latency.js
  tail -n 1 "artifacts/evaluation/latency-${scale}.csv" \
    >> artifacts/evaluation/ingest-latency.csv

  token=$(curl -fsS -H 'Content-Type: application/json' \
    -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" \
    "$API/auth/login" | jq -r .accessToken)
  curl -fsS -H "Authorization: Bearer $token" \
    "${API%/api/v1}/actuator/prometheus" \
    | grep '^civictrack_ingest_seconds' \
    > "artifacts/evaluation/server-latency-${scale}.prom"
done

python3 evaluation/plot_latency.py
