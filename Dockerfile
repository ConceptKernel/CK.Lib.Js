# CK.Lib.Js v1.4.0 OCI Bundle — Static Artifact (root layout, binary codec + display roles)
# v1.4.0: CKHexStore lands at root (ck-hex-store.js) — native 6-way hex-indexed quad store with
# replace-by-subject default, native DatasetCore adapter (toRdfJs), and the pgCK-RESPONSE §3
# migration surface (size/subjects/predicates()/classes()/types()/recent(n)).
# Single target: static folder mount (ckp:static designation)
# Files land at image root so consumers can `COPY --from=cklib_source / dest/`
# directly per SPEC.OCI.BUNDLE.v0.3 — declarable as either `static_web[]` (v0.2-compatible,
# routed) or `layer_sources[]` (v0.3 additive merge) in a downstream `bundle.yaml`.
#
# No npm install: ck-client.js loads nats.ws from https://esm.sh at runtime,
# so node_modules in the bundle is dead weight (removed in v1.2.1).

FROM scratch

COPY ck-*.js index.html /
COPY vendor /vendor
COPY README.md LICENSE /

LABEL org.opencontainers.image.title="CK.Lib.Js"
LABEL org.opencontainers.image.description="CKP v3.8 JavaScript client library — static folder mount artifact"
LABEL org.opencontainers.image.version="1.4.0"
LABEL org.opencontainers.image.source="https://github.com/ConceptKernel/CK.Lib.Js"
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.designation="ckp:static"
