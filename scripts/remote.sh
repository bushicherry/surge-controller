#!/usr/bin/env bash
# Remote-ops wrapper for the Surge Mac (deploy / logs / restart / status / power).
# All operations run over SSH so you never have to touch the box physically.
#
# Config via env (defaults match the current setup):
#   REMOTE_USER  (default: jeffreychen)
#   REMOTE_HOST  (default: 192.168.1.1)
#   REMOTE_DIR   (default: /Users/jeffreychen/workspaces/surge-controller)
#
# Usage:
#   scripts/remote.sh deploy         git pull + install + build + restart
#   scripts/remote.sh restart        kickstart the launchd agent
#   scripts/remote.sh status         agent state + HTTP health
#   scripts/remote.sh logs [N]       tail last N lines (default 120)
#   scripts/remote.sh tailf          follow logs live
#   scripts/remote.sh power          sleep/keep-awake (clamshell) settings
#   scripts/remote.sh temp           CPU/GPU/fan readings on the box
#   scripts/remote.sh audit [N]      last N audit rows via the API (default 20)
#   scripts/remote.sh exec '<cmd>'   run an arbitrary command in REMOTE_DIR
#   scripts/remote.sh ssh            open an interactive shell
set -euo pipefail

REMOTE_USER="${REMOTE_USER:-jeffreychen}"
REMOTE_HOST="${REMOTE_HOST:-192.168.1.1}"
REMOTE_DIR="${REMOTE_DIR:-/Users/jeffreychen/workspaces/surge-controller}"
LABEL="com.bushicherry.surgecontroller"

# Non-interactive SSH gets a minimal PATH (/usr/bin:/bin:/usr/sbin:/sbin) and
# does not source login profiles, so node/yarn (in /usr/local/bin) are missing.
# Prepend it for every remote command.
remote() { ssh "${REMOTE_USER}@${REMOTE_HOST}" "export PATH=/usr/local/bin:\$PATH; $*"; }

cmd="${1:-help}"; shift || true

case "$cmd" in
  deploy)
    remote "set -e; cd '$REMOTE_DIR' && \
      git pull --ff-only && \
      yarn install --frozen-lockfile --network-timeout 600000 && \
      yarn build && \
      launchctl kickstart -k gui/\$(id -u)/$LABEL && echo '=== DEPLOYED ==='"
    ;;
  restart)
    remote "launchctl kickstart -k gui/\$(id -u)/$LABEL && echo RESTARTED"
    ;;
  status)
    remote "echo '--- launchd ---'; launchctl list | grep '$LABEL' || echo 'NOT LOADED'; \
      echo '--- http ---'; curl -s -o /dev/null -w 'localhost:3000/login -> %{http_code}\n' http://localhost:3000/login || echo 'no response'"
    ;;
  logs)
    n="${1:-120}"
    remote "tail -n $n '$REMOTE_DIR/data/stdout.log' '$REMOTE_DIR/data/stderr.log'"
    ;;
  tailf)
    remote "tail -f '$REMOTE_DIR/data/stdout.log' '$REMOTE_DIR/data/stderr.log'"
    ;;
  power)
    # Clamshell keep-awake indicators: SleepDisabled=1 (from `pmset disablesleep`),
    # system `sleep 0` (never), plus any active no-sleep assertions.
    remote "echo '--- pmset -g ---'; pmset -g; \
      echo '--- SleepDisabled ---'; pmset -g | grep -i SleepDisabled || echo 'SleepDisabled not set'; \
      echo '--- assertions ---'; pmset -g assertions | grep -iE 'PreventUserIdleSystemSleep|PreventSystemSleep|caffeinate' || echo 'no keep-awake assertions'"
    ;;
  temp)
    remote "if [ -x /usr/local/bin/osx-cpu-temp ]; then echo 'CPU:'; /usr/local/bin/osx-cpu-temp; \
      echo 'GPU:'; /usr/local/bin/osx-cpu-temp -g 2>/dev/null || true; \
      echo 'Fan:'; /usr/local/bin/osx-cpu-temp -f 2>/dev/null || true; \
      else echo 'osx-cpu-temp not found'; fi"
    ;;
  audit)
    n="${1:-20}"
    remote "curl -s 'http://localhost:3000/api/audit?limit=$n'"
    ;;
  exec)
    remote "cd '$REMOTE_DIR' && $*"
    ;;
  ssh)
    exec ssh "${REMOTE_USER}@${REMOTE_HOST}"
    ;;
  help|*)
    sed -n '2,25p' "$0"
    ;;
esac
