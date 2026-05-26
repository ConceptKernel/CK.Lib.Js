#!/bin/bash
# Build bundle-ck-lib-js OCI image (multi-platform)
# Usage: ./build-ck-lib-js.sh [tag]

set -eo pipefail

TAG="${1:-latest}"
REGISTRY="ghcr.io/conceptkernel"
IMAGE="bundle-ck-lib-js"

echo "📦 Building $REGISTRY/$IMAGE:$TAG"
echo ""

# Check for buildx
if ! docker buildx version &>/dev/null; then
  echo "⚠ docker buildx not found. Installing..."
  docker buildx create --use
fi

# Build multi-platform
echo "🏗 Building for: linux/amd64, linux/arm64"
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --tag "$REGISTRY/$IMAGE:$TAG" \
  --tag "$REGISTRY/$IMAGE:latest" \
  --file Dockerfile \
  --push \
  .

echo ""
echo "✅ Built and pushed: $REGISTRY/$IMAGE:$TAG"
echo ""
echo "Pull with:"
echo "  docker pull $REGISTRY/$IMAGE:$TAG"
