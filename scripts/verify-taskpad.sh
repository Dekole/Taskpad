#!/usr/bin/env bash
# verify-taskpad.sh - deterministic snapshot of Taskpad's externally-visible state.
#
# Run on the VPS. Capture a baseline BEFORE the merge (Phase 2), re-run AFTER
# the cutover (Phase 5.7), and diff. Empty diff == "exactly the same as before".
#
#   ./verify-taskpad.sh > ~/taskpad-baseline.txt      # Phase 2
#   ./verify-taskpad.sh > ~/taskpad-after.txt         # Phase 5.7
#   diff ~/taskpad-baseline.txt ~/taskpad-after.txt && echo "IDENTICAL"
#
# Deliberately prints no timestamps, durations or ids - anything that changes
# run to run would drown the signal. Needs MCP_AUTH_TOKEN in the environment.

set -uo pipefail
BASE="${TASKPAD_BASE_URL:-https://taskpad.duckdns.org}"
DB="${TASKPAD_DB_CONTAINER:-taskpad-db-1}"

code() { curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$@"; }

echo "=== 1. public endpoint contract ==="
echo "GET  /                            $(code "$BASE/")"
echo "GET  /api/tasks                   $(code "$BASE/api/tasks")"
echo "GET  /api/pad                     $(code "$BASE/api/pad")"
echo "GET  /.well-known/oauth-authorization-server  $(code "$BASE/.well-known/oauth-authorization-server")"
echo "POST /mcp (no auth)               $(code -X POST -H 'Content-Type: application/json' -d '{}' "$BASE/mcp")"
echo "POST /mcp (bearer)                $(code -X POST -H "Authorization: Bearer ${MCP_AUTH_TOKEN:-unset}" \
     -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
     -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' "$BASE/mcp")"

echo
echo "=== 2. oauth metadata (endpoint URLs must not move) ==="
curl -s --max-time 15 "$BASE/.well-known/oauth-authorization-server" \
  | tr ',' '\n' | grep -E 'endpoint|issuer' | sed 's/^[[:space:]]*//' | sort

echo
echo "=== 3. data (row counts must match exactly) ==="
docker exec "$DB" psql -U taskapp -d taskapp -tAc \
  "SELECT 'pad:'||type||'='||count(*) FROM pad GROUP BY type ORDER BY type;" 2>&1
docker exec "$DB" psql -U taskapp -d taskapp -tAc \
  "SELECT 'tasks='||count(*) FROM tasks;" 2>&1
docker exec "$DB" psql -U taskapp -d taskapp -tAc \
  "SELECT 'users='||count(*) FROM users;" 2>&1

echo
echo "=== 4. containers (names are part of the contract: Caddy resolves them) ==="
docker ps --format '{{.Names}}\t{{.Ports}}' | sort

echo
echo "=== 5. volumes (taskpad_postgres_data MUST survive) ==="
docker volume ls --format '{{.Name}}' | grep -i task | sort

echo
echo "=== 6. live Caddy routes ==="
docker exec taskpad-caddy-1 cat /etc/caddy/Caddyfile 2>&1 | grep -E 'reverse_proxy|well-known|^[a-z].*\{' | sed 's/^[[:space:]]*//'

echo
echo "=== 7. mcp oauth client registrations (count must not drop to 0) ==="
docker exec taskpad-mcp sh -c 'cat /data/oauth/clients.json 2>/dev/null | grep -o "client_id" | wc -l' 2>&1
