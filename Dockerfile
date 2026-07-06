# CK.Lib.Js v1.5.0 OCI Bundle — Static Artifact (dispatch-only, vendored)
# v1.5.0: the dispatch-only concept-kernel surface aligned to CKP v3.9 Critical Isolation. What ships is
# three ESM modules — `ck.js` (L2 facade: CK.activate → ConceptKernel handle, op→verb table to
# instance.*), `ck-store.js` (CKStore typed-instance cache — no quads, no RDF), and `ck-client.js` (the
# CKClient dispatch transport over the current per-verb wire via the v3.8→v3.9 shim) — plus the vendored
# NATS transport (nats.ws + @msgpack/msgpack) under vendor/ as self-contained browser ESM bundles.
# ck-client.js imports ./vendor/* — there is NO runtime CDN fetch (esm.sh removed), so the bundle is
# air-gapped and the supply-chain vector stays closed (built on the v1.4.2 vendored base). The client
# carries no RDF, no quad store, no SPARQL, no query engine — it authenticates and dispatches typed
# payloads, nothing else crosses (v3.9 §0.1).
# Single target: static folder mount (ckp:static designation)
# Files land at image root so consumers can `COPY --from=cklib_source / dest/`
# directly per SPEC.OCI.BUNDLE.v0.3 — declarable as either `static_web[]` (v0.2-compatible,
# routed) or `layer_sources[]` (v0.3 additive merge) in a downstream `bundle.yaml`.
#
# No npm install, no runtime CDN: nats.ws + @msgpack/msgpack are bundled into vendor/*.js at build time
# (esbuild), so the air-gapped bundle has zero external runtime dependencies.

FROM scratch

COPY ck.js ck-client.js ck-store.js /
COPY vendor /vendor
COPY README.md LICENSE /

LABEL org.opencontainers.image.title="CK.Lib.Js"
LABEL org.opencontainers.image.description="CKP v3.9 dispatch-only concept-kernel JS client (vendored, air-gapped) — static folder mount artifact"
LABEL org.opencontainers.image.version="1.5.4"
LABEL org.opencontainers.image.source="https://github.com/ConceptKernel/CK.Lib.Js"
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.designation="ckp:static"
