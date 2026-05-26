# CK.Lib.Js v1.2.0 OCI Bundle — Static + Dev Server
# Two targets: 'static' (ckp:static for mounting) and 'dev' (HTTP server for testing)

FROM node:20-bookworm AS builder

WORKDIR /build

# Copy source
COPY package.json package-lock.json* ./
COPY ck-*.js index.html ./
COPY vendor/ vendor/
COPY README.md LICENSE ./

# Install dependencies (production only)
RUN npm install --production && npm cache clean --force

# Target 1: Static artifact (default) — mount as folder layer
FROM scratch AS static

WORKDIR /ck-lib-js
COPY --from=builder /build .

LABEL org.opencontainers.image.title="CK.Lib.Js"
LABEL org.opencontainers.image.description="CKP v3.8 JavaScript client library — static folder mount artifact"
LABEL org.opencontainers.image.version="1.2.0"
LABEL org.opencontainers.image.source="https://github.com/ConceptKernel/CK.Lib.Js"
LABEL org.opencontainers.image.designation="ckp:static"

# Target 2: Development HTTP server — for testing standalone
FROM node:20-alpine AS dev

WORKDIR /app

RUN npm install -g http-server

COPY --from=builder /build .

RUN mkdir -p /app/public && \
    cp /app/*.js /app/public/ && \
    cp /app/*.html /app/public/ && \
    cp -r /app/vendor /app/public/ && \
    cp /app/package.json /app/public/

LABEL org.opencontainers.image.title="CK.Lib.Js (Dev Server)"
LABEL org.opencontainers.image.description="CKP v3.8 JavaScript client library + HTTP server for testing"
LABEL org.opencontainers.image.version="1.2.0"
LABEL org.opencontainers.image.source="https://github.com/ConceptKernel/CK.Lib.Js"
LABEL org.opencontainers.image.designation="ckp:web-serving"

ENV PORT=8080 \
    NATS_SERVERS="wss://stream.example.com:9222" \
    NODE_ENV=development

EXPOSE 8080

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost:8080/index.html || exit 1

CMD ["http-server", "/app/public", "-p", "8080", "--cors"]
