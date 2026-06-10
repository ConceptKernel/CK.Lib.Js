# CK.Lib.Js v1.4.1 OCI Bundle — Static Artifact (STRIPPED: client RDF tier removed)
# v1.4.1 (intermediary toward dispatch-only v1.5.0): the client RDF tier (ck-rdf-bridge.js + the
# hex/RDF quad store) is removed; the legacy render tier, vendored anime, and dev scripts are retired.
# What ships is the single NATS WSS client `ck-client.js` (Keycloak JWT auth, current verb wire) —
# the minimal stripped surface web2 consumes. Aligned to the v3.9 "no client RDF" direction.
# Single target: static folder mount (ckp:static designation)
# Files land at image root so consumers can `COPY --from=cklib_source / dest/`
# directly per SPEC.OCI.BUNDLE.v0.3 — declarable as either `static_web[]` (v0.2-compatible,
# routed) or `layer_sources[]` (v0.3 additive merge) in a downstream `bundle.yaml`.
#
# No npm install: ck-client.js loads nats.ws from https://esm.sh at runtime,
# so node_modules in the bundle is dead weight (removed in v1.2.1).

FROM scratch

COPY ck-client.js /
COPY README.md LICENSE /

LABEL org.opencontainers.image.title="CK.Lib.Js"
LABEL org.opencontainers.image.description="CKP v3.8 NATS WSS client (stripped, JWT) — static folder mount artifact"
LABEL org.opencontainers.image.version="1.4.1"
LABEL org.opencontainers.image.source="https://github.com/ConceptKernel/CK.Lib.Js"
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.designation="ckp:static"
