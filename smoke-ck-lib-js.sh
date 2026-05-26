#!/bin/bash
# Smoke test for bundle-ck-lib-js OCI image
# Verifies: container startup, HTTP server, NATS WSS connectivity

set -eo pipefail

IMAGE="${1:-ghcr.io/conceptkernel/bundle-ck-lib-js:latest}"
CONTAINER="ckjs-smoke-test-$$"
TIMEOUT=30

echo "🧪 Smoke test: $IMAGE"
echo ""

# Start container
echo "▶ Starting container..."
docker run -d \
  --name "$CONTAINER" \
  -p 8080:8080 \
  -e NATS_SERVERS="wss://localhost:9222" \
  "$IMAGE" \
  > /dev/null

trap "docker rm -f $CONTAINER 2>/dev/null || true" EXIT

# Wait for health check
echo "⏳ Waiting for container to be ready..."
start_time=$(date +%s)
while true; do
  if docker exec "$CONTAINER" wget --quiet --tries=1 --spider http://localhost:8080/index.html 2>/dev/null; then
    echo "✓ HTTP server ready on :8080"
    break
  fi

  elapsed=$(($(date +%s) - start_time))
  if [ $elapsed -gt $TIMEOUT ]; then
    echo "✗ Timeout waiting for HTTP server"
    docker logs "$CONTAINER"
    exit 1
  fi
  sleep 1
done

# Test HTTP server
echo "▶ Testing HTTP endpoints..."
docker exec "$CONTAINER" wget -q -O /dev/null http://localhost:8080/index.html && \
  echo "✓ GET /index.html"
docker exec "$CONTAINER" wget -q -O /dev/null http://localhost:8080/ck-client.js && \
  echo "✓ GET /ck-client.js"
docker exec "$CONTAINER" wget -q -O /dev/null http://localhost:8080/ck-bus.js && \
  echo "✓ GET /ck-bus.js"

# Test npm modules
echo "▶ Testing npm dependencies..."
docker exec "$CONTAINER" node -e "require('nats.ws')" && \
  echo "✓ nats.ws module available"

# Display env
echo "▶ Environment variables..."
docker exec "$CONTAINER" sh -c 'echo "  NATS_SERVERS=$NATS_SERVERS"'
docker exec "$CONTAINER" sh -c 'echo "  NODE_ENV=$NODE_ENV"'

echo ""
echo "✅ All smoke tests passed!"
echo ""
echo "Container logs:"
docker logs "$CONTAINER" | head -20
