# CK.Lib.Js v1.3.5 OCI Bundle — Static Artifact (root layout, binary codec + display roles)
# v1.3.5: pipeline iteration #5 — workflow file unchanged from v1.3.4; tests whether tag-event routing recovers when GitHub isn't re-parsing
# Single target: static folder mount (ckp:static designation)
# Files land at image root so consumers can `COPY --from=cklib_source / dest/`
# directly per SPEC.OCI.BUNDLE.v0.2.
#
# No npm install: ck-client.js loads nats.ws from https://esm.sh at runtime,
# so node_modules in the bundle is dead weight (removed in v1.2.1).

FROM scratch

COPY ck-*.js index.html /
COPY vendor /vendor
COPY README.md LICENSE /

LABEL org.opencontainers.image.title="CK.Lib.Js"
LABEL org.opencontainers.image.description="CKP v3.8 JavaScript client library — static folder mount artifact"
LABEL org.opencontainers.image.version="1.3.5"
LABEL org.opencontainers.image.source="https://github.com/ConceptKernel/CK.Lib.Js"
LABEL org.opencontainers.image.designation="ckp:static"
