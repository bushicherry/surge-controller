#!/usr/bin/env bash
# Run the app on the host (no Docker) against the mock Surge API.
# Useful for UI sanity-checking before Docker is even involved.
#
# Prereqs: node >= 20, yarn install, yarn build (all done once).
#
# Usage:
#   ./scripts/dev-local.sh              # foreground; ctrl-c to stop both
#   PORT=3001 ./scripts/dev-local.sh    # override http port

set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${PORT:-3000}"
MOCK_PORT="${MOCK_PORT:-6171}"
HOST_BIND="${HOST_BIND:-0.0.0.0}"

# Detect the Mac's LAN IP (best-effort). Users on Ethernet or a VPN can
# override by exporting LAN_IP before running this script.
detect_lan_ip() {
  for iface in en0 en1 en2 en3 en4 en5; do
    ip="$(ipconfig getifaddr "$iface" 2>/dev/null || true)"
    [ -n "$ip" ] && { echo "$ip"; return; }
  done
  echo ""
}
LAN_IP="${LAN_IP:-$(detect_lan_ip)}"

# Kill leftover mock + Next from a prior run so re-runs don't EADDRINUSE.
pkill -f 'scripts/mock-surge.mjs' 2>/dev/null || true
# lsof is standard on macOS; -ti prints PIDs only.
LEFT="$(lsof -ti "tcp:$PORT" 2>/dev/null || true)"
if [ -n "$LEFT" ]; then
  echo "==> Killing leftover process on :$PORT ($LEFT)"
  kill -9 $LEFT 2>/dev/null || true
  sleep 0.2
fi
LEFT_MOCK="$(lsof -ti "tcp:$MOCK_PORT" 2>/dev/null || true)"
if [ -n "$LEFT_MOCK" ]; then
  echo "==> Killing leftover process on :$MOCK_PORT ($LEFT_MOCK)"
  kill -9 $LEFT_MOCK 2>/dev/null || true
  sleep 0.2
fi

mkdir -p data tmp
: > tmp/profile.conf   # empty is fine; sanitize() prepends sections it needs

echo "==> Starting mock Surge on :$MOCK_PORT ..."
PORT="$MOCK_PORT" node scripts/mock-surge.mjs > tmp/mock-surge.log 2>&1 &
MOCK_PID=$!
trap 'kill $MOCK_PID 2>/dev/null || true' EXIT

sleep 0.3

TRUSTED="localhost:$PORT,127.0.0.1:$PORT"
if [ -n "$LAN_IP" ]; then
  TRUSTED="$TRUSTED,$LAN_IP:$PORT"
fi
export LAN_TRUSTED_HOSTS="$TRUSTED"
export SURGE_API_HOST="http://127.0.0.1:$MOCK_PORT"
export SURGE_API_KEY="surgepasswd"
export SURGE_PROFILE_PATH="$(pwd)/tmp/profile.conf"
export DB_PATH="$(pwd)/data/dev.db"
export NEXTAUTH_SECRET="local-dev-not-secret"
export APP_ENC_KEY="local-dev-not-secret"
export NEXTAUTH_URL="http://localhost:$PORT"
export PORT

echo "==> Starting Next server on ${HOST_BIND}:$PORT ..."
echo "    UI (Mac):    http://localhost:$PORT   (LAN mode → no login)"
if [ -n "$LAN_IP" ]; then
  echo "    UI (phone):  http://$LAN_IP:$PORT   (open on iPhone on the same Wi-Fi)"
else
  echo "    UI (phone):  set LAN_IP=<mac-ip> before running to enable phone access"
fi
echo "    Mock log:    tail -f tmp/mock-surge.log"
echo "    DB:          $DB_PATH"
echo "    Trusted:     $LAN_TRUSTED_HOSTS"
echo
exec yarn next start -H "$HOST_BIND" -p "$PORT"
