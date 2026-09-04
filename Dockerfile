# CK.Lib.Js OCI bundle — static artifact, vendored, air-gapped.
#
# What ships: three ESM modules — `ck.js` (the facade: CK.activate → ConceptKernel handle, every
# operation compiling to one governed dispatch through one door), `ck-client.js` (the transport:
# NATS-over-WebSocket with a verified bearer, subject grammar per SPEC.CK-DOOR), `ck-store.js` (the
# typed-instance cache) — plus the vendored NATS transport (nats.ws + @msgpack/msgpack) under
# vendor/ as self-contained browser ESM bundles. ck-client.js imports ./vendor/* only: no runtime
# CDN fetch, no npm install, zero external runtime dependencies. The client carries no RDF, no quad
# store, no query engine — it authenticates and dispatches typed payloads; all compute is the
# substrate's (v3.11-and-forward; see SPEC.CK-DOOR for the contract).
#
# Single target: static folder mount. Files land at image root so consumers can
# `COPY --from=cklib_source / dest/` and serve them at the door's own `/cklib/` route (same
# origin as the kernel, version-affine with the substrate behind it).
#
# The image version label is bumped with every release (PROVENANCE.md, "Cutting a release").

FROM scratch

COPY ck.js ck-client.js ck-store.js /
COPY vendor /vendor
COPY LICENSE /

LABEL org.opencontainers.image.title="CK.Lib.Js"
LABEL org.opencontainers.image.description="Concept Kernel JS client — one governed dispatch through one door, verified identity, vendored and air-gapped (v3.11-and-forward)"
LABEL org.opencontainers.image.version="1.6.5"
LABEL org.opencontainers.image.source="https://github.com/ConceptKernel/CK.Lib.Js"
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.designation="ckp:static"
