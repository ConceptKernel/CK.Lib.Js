# CK.Lib.Js v1.2.0 OCI Bundle — Static Artifact Only
# Single target: static folder mount (ckp:static designation)

FROM node:20-bookworm AS builder

WORKDIR /build

# Copy source
COPY package.json package-lock.json* ./
COPY ck-*.js index.html ./
COPY vendor/ vendor/
COPY README.md LICENSE ./

# Install dependencies (production only)
RUN npm install --production && npm cache clean --force

# Static artifact — mount as folder layer
FROM scratch

WORKDIR /ck-lib-js
COPY --from=builder /build .

LABEL org.opencontainers.image.title="CK.Lib.Js"
LABEL org.opencontainers.image.description="CKP v3.8 JavaScript client library — static folder mount artifact"
LABEL org.opencontainers.image.version="1.2.0"
LABEL org.opencontainers.image.source="https://github.com/ConceptKernel/CK.Lib.Js"
LABEL org.opencontainers.image.designation="ckp:static"
