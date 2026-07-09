#!/usr/bin/env bash
# Push the built image + compose files to the Surge Mac and start the stack.
#
# Env (required):
#   REMOTE            e.g. li.chen@old-mac.local
#
# Env (optional):
#   REMOTE_DIR        path on the remote Mac       (default ~/surge-controller)
#   IMAGE_TAG         image ref                    (default surge-controller:latest)
#   TAR               local tarball path           (default ./dist/surge-controller.tar.gz)
#   SSH_OPTS          extra ssh flags              (default "")
#
# Prereqs on the remote Mac:
#   - Docker Desktop (or OrbStack / colima) installed and running
#   - ~/.ssh/authorized_keys has this machine's public key (or expect a passwd prompt)
#   - Surge running with `http-api = <key>@0.0.0.0:6171` in its active profile

set -euo pipefail
cd "$(dirname "$0")/.."

: "${REMOTE:?set REMOTE=user@host (e.g. REMOTE=li.chen@old-mac.local)}"
REMOTE_DIR="${REMOTE_DIR:-~/surge-controller}"
IMAGE_TAG="${IMAGE_TAG:-surge-controller:latest}"
TAR="${TAR:-./dist/surge-controller.tar.gz}"
SSH_OPTS="${SSH_OPTS:-}"

[[ -f "$TAR" ]] || { echo "Missing $TAR — run scripts/build-image.sh && scripts/export-image.sh first" >&2; exit 1; }

echo "==> Ensuring $REMOTE:$REMOTE_DIR exists..."
# shellcheck disable=SC2029
ssh $SSH_OPTS "$REMOTE" "mkdir -p $REMOTE_DIR/data"

echo "==> Copying compose + env template + image tarball..."
scp $SSH_OPTS docker-compose.yml .env.example "$REMOTE":"$REMOTE_DIR/"
scp $SSH_OPTS "$TAR" "$REMOTE":"$REMOTE_DIR/surge-controller.tar.gz"

echo "==> Loading image + starting stack on remote..."
# shellcheck disable=SC2087
ssh $SSH_OPTS "$REMOTE" bash -s <<'REMOTE_EOF'
set -euo pipefail
cd ~/surge-controller

echo "  -- docker load"
gunzip -c surge-controller.tar.gz | docker load

if [[ ! -f .env.local ]]; then
  cp .env.example .env.local
  cat <<MSG

  ⚠️  First-time deploy — .env.local was seeded from .env.example.
      Edit ~/surge-controller/.env.local with your secrets:
        - NEXTAUTH_SECRET, APP_ENC_KEY  (openssl rand -base64 32)
        - SURGE_API_KEY                  (must match Surge profile http-api password)
        - HOST_SURGE_PROFILE             (absolute path to Default.conf)
        - LAN_TRUSTED_HOSTS              (e.g. 192.168.1.50:3000,localhost:3000)
      Then finish with:
        cd ~/surge-controller && docker compose up -d

MSG
  exit 0
fi

echo "  -- docker compose up -d"
docker compose up -d
docker compose ps
REMOTE_EOF

echo
echo "==> Deploy step done. Verify with:"
echo "    BASE=http://<remote-lan-ip>:3000 ./scripts/smoke-test.sh"
