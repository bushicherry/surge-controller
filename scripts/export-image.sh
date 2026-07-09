#!/usr/bin/env bash
# Save the built image as a gzipped tarball for scp / airdrop transfer.
#
# Env:
#   IMAGE_TAG   (default surge-controller:latest)
#   OUT         (default ./dist/surge-controller.tar.gz)

set -euo pipefail
cd "$(dirname "$0")/.."

IMAGE_TAG="${IMAGE_TAG:-surge-controller:latest}"
OUT="${OUT:-./dist/surge-controller.tar.gz}"

if ! docker image inspect "$IMAGE_TAG" >/dev/null 2>&1; then
  echo "Image $IMAGE_TAG not found. Run scripts/build-image.sh first." >&2
  exit 1
fi

mkdir -p "$(dirname "$OUT")"
echo "==> Saving $IMAGE_TAG -> $OUT ..."
docker save "$IMAGE_TAG" | gzip -c > "$OUT"

echo "==> Done: $OUT ($(du -h "$OUT" | cut -f1))"
