# CK.Lib.Js v1.4.2 OCI Bundle — Static Artifact (STRIPPED: client RDF tier removed)
# v1.4.2 (hardening): the NATS transport (nats.ws + @msgpack/msgpack) is now VENDORED locally under
# vendor/ as self-contained browser ESM bundles. ck-client.js imports ./vendor/* — there is NO runtime
# CDN fetch (esm.sh removed), so the bundle is air-gapped and the last supply-chain vector is closed.
# Carries forward v1.4.1's stripped surface: the client RDF tier (ck-rdf-bridge.js + the hex/RDF quad
# store) removed; legacy render tier, vendored anime, and dev scripts retired. What ships is the single
# NATS WSS client `ck-client.js` (Keycloak JWT auth, current verb wire) + its vendored transport — the
# minimal stripped surface web2 consumes. Aligned to the v3.9 "no client RDF" direction.
# Single target: static folder mount (ckp:static designation)
# Files land at image root so consumers can `COPY --from=cklib_source / dest/`
# directly per SPEC.OCI.BUNDLE.v0.3 — declarable as either `static_web[]` (v0.2-compatible,
# routed) or `layer_sources[]` (v0.3 additive merge) in a downstream `bundle.yaml`.
#
# No npm install, no runtime CDN: nats.ws + @msgpack/msgpack are bundled into vendor/*.js at build time
# (esbuild), so the air-gapped bundle has zero external runtime dependencies.

FROM scratch

COPY ck-client.js /
COPY vendor /vendor
COPY README.md LICENSE /

LABEL org.opencontainers.image.title="CK.Lib.Js"
LABEL org.opencontainers.image.description="CKP v3.8 NATS WSS client (stripped, JWT, vendored transport — no runtime CDN) — static folder mount artifact"
LABEL org.opencontainers.image.version="1.4.2"
LABEL org.opencontainers.image.source="https://github.com/ConceptKernel/CK.Lib.Js"
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.designation="ckp:static"
