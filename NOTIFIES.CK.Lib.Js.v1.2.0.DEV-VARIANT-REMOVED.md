---
library: CK.Lib.Js
version: 1.2.0
date: 2026-05-27
theme: DEV-VARIANT-REMOVED
severity: breaking-but-low-blast-radius
audience: any repo that pulled `ghcr.io/conceptkernel/ck-lib-js:1.2.0-dev` during the 2026-05-26 publishing window
source-repo: https://github.com/ConceptKernel/CK.Lib.Js
---

# NOTIFIES — CK.Lib.Js v1.2.0 Dev Variant Removed

## TL;DR

The `ghcr.io/conceptkernel/ck-lib-js:1.2.0-dev` image (a 145 MB `node:20-alpine` + `http-server` variant) was published briefly on 2026-05-26 and **has been removed**. The published bundle is now **static-only**: `ghcr.io/conceptkernel/ck-lib-js:1.2.0` (2.07 MB, `FROM scratch`, `ckp:static`). No `-dev` tag will ever ship again.

## What Happened

During the v1.2.0 publishing pass, two OCI targets were briefly published:

| Tag (removed) | What it was | Size | Why removed |
|---|---|---|---|
| `:1.2.0-dev` | `node:20-alpine` + `http-server` running on `:8080` | **145 MB** | Confused the bundle concept — bundles are static folder mounts, not runnable services. Adding a node runtime defeats the entire `ckp:static` designation. |
| `:1.2.0` | `FROM scratch` + files at `/ck-lib-js/` | **2.07 MB** | Correct bundle shape — stays. |

The `-dev` variant was an early misread of what an OCI bundle is. Per **SPEC.OCI.BUNDLE.v0.2** (and v0.1 before it), bundles are filesystem-layer artifacts that composing bundles `COPY --from` into a builder stage. A bundle is **not** a runnable service; the dev server belongs in the consuming bundle (FastAPI / Envoy) or in local tooling.

## Blast Radius (Confirmed Zero)

Audit on 2026-05-27 of known downstream consumers:

| Repo | References to `:1.2.0-dev` | Status |
|---|---|---|
| `git_sporaxis-com/oci-germination` `bundles/bundle-ck-allinone/` | 0 | safe |
| `git_sporaxis-com/oci-germination` `bundles/bundle-pg17-pgrdf-pgck-web-cklib/` | 0 | safe |
| `git_neux/nx-marketplace-operator-azure/sku/pgck/` | 0 | safe (not yet integrated at all — see [NOTIFIES.CK.Lib.Js.v1.2.0.PGCK-SKU-INTEGRATION-GAP.md](NOTIFIES.CK.Lib.Js.v1.2.0.PGCK-SKU-INTEGRATION-GAP.md)) |

No production or test pipeline is known to depend on `:1.2.0-dev`. Removal is safe.

## If You Did Pull `:1.2.0-dev`

You hit an undocumented short-lived variant. Replace the image reference:

```diff
-FROM ghcr.io/conceptkernel/ck-lib-js:1.2.0-dev AS cklib_source
+FROM ghcr.io/conceptkernel/ck-lib-js:1.2.0 AS cklib_source
```

The file layout inside the image **changed**:

| Variant | Path inside image |
|---|---|
| `:1.2.0-dev` (removed) | `/app/public/*.js`, `/app/public/index.html`, `/app/public/vendor/` |
| `:1.2.0` (current) | `/ck-lib-js/*.js`, `/ck-lib-js/index.html`, `/ck-lib-js/vendor/` |

If you were copying from `/app/public/`, update to copy from `/ck-lib-js/` (or `/` for everything — the static target only contains the bundle files).

If you were running `http-server` from the image as a container, **you must run it elsewhere** (in your consuming bundle, in a sidecar, or in local dev tooling). The static bundle has no `CMD` and no shell.

## Why Not Republish `:1.2.0-dev` for Compatibility?

Three reasons:

1. **Zero confirmed users** (per audit above) — no one to break.
2. **The bundle/service distinction is normative** in SPEC.OCI.BUNDLE.v0.2. Republishing `-dev` would be a misleading signal that re-implies bundles can be runnable services.
3. **145 MB vs 2.07 MB** — the `-dev` variant carries a full Node runtime that consumers should never inherit. Even if used "just for dev," it teaches the wrong shape.

A separate development server (if needed) belongs in a different image entirely, e.g. `ghcr.io/conceptkernel/ck-lib-js-dev-server:1.2.0`, with a clearly different name. **None is planned at this time.** Use any static file server you like to serve the bundle locally (`python -m http.server`, `npx http-server`, `caddy file-server`, etc.).

## GHCR Cleanup

The `:1.2.0-dev` tag still exists in GHCR as an orphaned manifest (the publishing was successful, only the workflow + Dockerfile have been changed). It can be deleted via the GitHub web UI:

```
https://github.com/orgs/ConceptKernel/packages/container/ck-lib-js/versions
```

→ find the version tagged `1.2.0-dev` → delete. Deletion does not affect `:1.2.0` or `:latest`.

## References

- **NOTIFIES.CK.Lib.Js.v1.2.0.OCI-BUNDLE-RELEASED.md** — the main release notification
- **CHANGELOG.md** (this repo) — "Removed Dev Target" entry under v1.2.0
- **Dockerfile** (this repo) — single `FROM scratch` target, no dev stage
- **.github/workflows/bundle-ck-lib-js-release.yml** — publishes only the static target
