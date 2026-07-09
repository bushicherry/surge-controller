#!/usr/bin/env bash
# Build a linux/amd64 Docker image on this (arm64) Mac for the Intel Surge Mac.
# Requires Docker Desktop (buildx included).
#
# Env overrides:
#   IMAGE_TAG   image ref to produce                     (default surge-controller:latest)
#   PLATFORM    target platform                          (default linux/amd64)
#   BUILDER     buildx builder name                      (default surge-builder)
#
# Notes:
#   - `--load` puts the image into the local Docker image store so we can
#     `docker save` it next. That only works for single-platform builds; do
#     not add more platforms to $PLATFORM.
#   - QEMU emulation is used on Apple Silicon → the whole build runs slower
#     than native. Expect 3–6 min on the first build; subsequent builds hit
#     the buildx cache and take seconds.

set -euo pipefail
cd "$(dirname "$0")/.."

IMAGE_TAG="${IMAGE_TAG:-surge-controller:latest}"
PLATFORM="${PLATFORM:-linux/amd64}"
BUILDER="${BUILDER:-surge-builder}"

echo "==> Ensuring buildx builder '$BUILDER' exists..."
if ! docker buildx inspect "$BUILDER" >/dev/null 2>&1; then
  docker buildx create --name "$BUILDER" --driver docker-container --use
else
  docker buildx use "$BUILDER"
fi
docker buildx inspect --bootstrap >/dev/null

echo "==> Building $IMAGE_TAG for $PLATFORM ..."
docker buildx build \
  --platform "$PLATFORM" \
  --tag "$IMAGE_TAG" \
  --load \
  .

echo
echo "==> Done. Local image:"
docker image ls "$IMAGE_TAG"
