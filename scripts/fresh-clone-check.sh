#!/usr/bin/env bash
# Fresh clone → docker compose up (no API key) → the 3 pages answer → one sample run replays to a memo.
# Usage: scripts/fresh-clone-check.sh [repo url]   (exits 0 when everything works)
set -euo pipefail
repo=${1:-https://github.com/shisukeUrahara/researchpilot.git}
dir=$(mktemp -d)
port=${RP_CHECK_PORT:-3131}
echo "clone → $dir"
git clone -q --depth 1 "$repo" "$dir/researchpilot"
cd "$dir/researchpilot"
export RP_PORT=$port COMPOSE_PROJECT_NAME="rpcheck$$"
cleanup() { docker compose down -v >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker compose up -d --build >/dev/null
base="http://127.0.0.1:$port"
for i in $(seq 1 90); do curl -fs "$base/" >/dev/null 2>&1 && break; sleep 2; done
for p in / /evals /memo; do
  code=$(curl -s -o /dev/null -w '%{http_code}' -L "$base$p")
  echo "GET $p → $code"
  [ "$code" = 200 ] || { echo "FAIL: $p"; exit 1; }
done
run=$(curl -fs -X POST "$base/api/research-runs" -H 'content-type: application/json' -d '{"scenario_id":"golden-01","arm":"bounded"}' | sed -E 's/.*"run_id":"([^"]+)".*/\1/')
echo "sample run $run"
for i in $(seq 1 60); do
  body=$(curl -fs "$base/api/research-runs/$run" || true)
  echo "$body" | grep -q '"has_memo":true' && break
  sleep 2
done
echo "$body" | grep -o '"stopReason":"[A-Z_]*"' || { echo "FAIL: run did not finish"; exit 1; }
curl -fs "$base/api/research-runs/$run/report" | head -3
echo "fresh clone OK"
