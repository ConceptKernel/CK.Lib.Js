# CK.Lib.Js v1.2.0 OCI Bundle
# Multi-platform Node.js 20 runtime with dev HTTP server
# Generated from bundle-ck-lib-js.yaml

FROM node:20-bookworm AS builder

WORKDIR /build

# Copy source
COPY package.json package-lock.json* ./
COPY ck-*.js index.html ./
COPY vendor/ vendor/
COPY README.md LICENSE ./

# Install dependencies
RUN npm ci --only=production

# Final stage
FROM node:20-alpine

WORKDIR /app

# Install lightweight HTTP server
RUN npm install -g http-server

# Copy from builder
COPY --from=builder /build /app

# Create public directory for serving
RUN mkdir -p /app/public && \
    cp /app/*.js /app/public/ && \
    cp /app/*.html /app/public/ && \
    cp -r /app/vendor /app/public/

# Metadata
LABEL org.opencontainers.image.title="CK.Lib.Js"
LABEL org.opencontainers.image.description="CKP v3.8 JavaScript client library + dev server"
LABEL org.opencontainers.image.version="1.2.0"
LABEL org.opencontainers.image.source="https://github.com/ConceptKernel/CK.Lib.Js"

# Environment
ENV PORT=8080 \
    NATS_SERVERS="wss://localhost:9222" \
    NODE_ENV=development

# Expose ports
EXPOSE 8080 9222

# Health check
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost:8080/index.html || exit 1

# Run dev server
CMD ["http-server", "/app/public", "-p", "8080", "--cors"]
