#!/usr/bin/env bash
# End-to-end HTTP smoke test for a running surge-controller instance.
# Works against either:
#   (a) the local test rig  (docker-compose.test.yml, LAN bypass, mock Surge), or
#   (b) the deployed instance on the Surge Mac (real Surge, LAN bypass or Bearer token).
#
# Usage:
#   BASE=http://localhost:3000                ./scripts/smoke-test.sh
#   BASE=http://192.168.1.50:3000             ./scripts/smoke-test.sh    # LAN via LAN_TRUSTED_HOSTS
#   BASE=https://surge.onenew.site TOKEN=xxx  ./scripts/smoke-test.sh    # public via Bearer
#
# Exit codes:
#   0 — all pass
#   >0 — first failing check number

set -uo pipefail
BASE="${BASE:-http://localhost:3000}"
TOKEN="${TOKEN:-}"
GROUP="${GROUP:-Proxy}"

TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
PASS=0
FAIL=0

_curl_args=(-sS -o "$TMP/body" -w '%{http_code}' --max-time 30)
[[ -n "$TOKEN" ]] && _curl_args+=(-H "Authorization: Bearer $TOKEN")

check() {
  local name="$1" method="$2" path="$3" body="${4:-}" want_json_key="${5:-}" accept="${6:-2}"
  : > "$TMP/body"
  local args=("${_curl_args[@]}" -X "$method" "$BASE$path")
  if [[ -n "$body" ]]; then
    args+=(-H 'Content-Type: application/json' -d "$body")
  fi
  local code
  code=$(curl "${args[@]}" 2>"$TMP/err") || code="ERR"

  local ok=1
  # $accept is a regex fragment (default "2" = 2xx). Allow "23" for 2xx or 3xx.
  [[ "$code" =~ ^[$accept] ]] || ok=0
  if [[ $ok -eq 1 && -n "$want_json_key" ]]; then
    # Cheap JSON key presence check without jq dependency.
    grep -q "\"$want_json_key\"" "$TMP/body" || ok=0
  fi

  if [[ $ok -eq 1 ]]; then
    printf '  ✅  %-40s  HTTP %s\n' "$name" "$code"
    PASS=$((PASS+1))
  else
    printf '  ❌  %-40s  HTTP %s\n' "$name" "$code"
    echo   "      body:  $(head -c 300 "$TMP/body")"
    [[ -s "$TMP/err" ]] && echo "      err:   $(cat "$TMP/err")"
    FAIL=$((FAIL+1))
  fi
}

echo
echo "Smoke test: $BASE   (token=${TOKEN:+[set]}${TOKEN:-[none — assumes LAN bypass]})"
echo "----------------------------------------------------------------------"

# --- Reachability & UI ---
# /login redirects (307) to / in LAN mode, so accept 2xx or 3xx.
check "GET /login (UI reachable)"          GET  "/login" "" "" "23"
check "GET / (dashboard html)"              GET  "/"

# --- Surge read APIs ---
check "GET /api/surge/policy-groups"        GET  "/api/surge/policy-groups"      "" "groups"
check "GET /api/surge/outbound-mode"        GET  "/api/surge/outbound-mode"      "" "mode"
check "GET /api/settings"                   GET  "/api/settings"                 "" "profile_path"
check "GET /api/audit"                      GET  "/api/audit"                    "" "entries"
check "GET /api/tokens"                     GET  "/api/tokens"                   "" "tokens"
check "GET /api/presets"                    GET  "/api/presets"                  "" "presets"

# --- Surge write APIs (side-effect-safe: set mode back to same) ---
# Fetch current mode with a plain (no -o/-w) curl so we get JSON directly.
_hdr=()
[[ -n "$TOKEN" ]] && _hdr=(-H "Authorization: Bearer $TOKEN")
_mode_body=$(curl -sS --max-time 10 ${_hdr[@]+"${_hdr[@]}"} "$BASE/api/surge/outbound-mode" || echo '{}')
CUR_MODE=$(printf '%s' "$_mode_body" | sed -nE 's/.*"mode"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p')
case "$CUR_MODE" in direct|rule|proxy|global) ;; *) CUR_MODE=rule ;; esac
check "POST /api/surge/outbound-mode (idem)" POST "/api/surge/outbound-mode"     "{\"mode\":\"$CUR_MODE\"}"
check "POST /api/surge/test-latency ($GROUP)" POST "/api/surge/test-latency"     "{\"group\":\"$GROUP\"}" "latencies"

# --- Rules & user-managed direct rules ---
check "GET /rules (UI reachable)"           GET  "/rules"                        "" ""       "23"
check "GET /api/surge/rules"                GET  "/api/surge/rules"              "" "rules"
check "GET /api/user-rules"                 GET  "/api/user-rules"               "" "rules"

echo "----------------------------------------------------------------------"
echo "Passed: $PASS   Failed: $FAIL"
exit "$FAIL"
