---
library: CK.Lib.Js
version: 1.2.0
date: 2026-05-27
theme: OCI-BUNDLE-RELEASED
audience: any repo that consumes CK.Lib.Js as a browser client or OCI static layer
source-repo: https://github.com/ConceptKernel/CK.Lib.Js
---

# NOTIFIES — CK.Lib.Js v1.2.0 OCI Bundle Released

## TL;DR

`CK.Lib.Js v1.2.0` is published as a **static OCI bundle** at `ghcr.io/conceptkernel/ck-lib-js:1.2.0`. Anonymous pull, multi-platform (linux/amd64, linux/arm64), **2.07 MB**, `ckp:static` designation. Conforms to **SPEC.OCI.BUNDLE.v0.2** as a source layer for `static_web:` composition.

## What CK.Lib.Js Is

A self-contained ESM browser library that turns a static HTML page into a NATS-WSS-connected Concept Kernel client. No build step. No bundler. Drop a `<script type="module">` tag and you have:

| Export | Module | Purpose |
|---|---|---|
| `CKClient` | `ck-client.js` | NATS WSS connection, anonymous/Keycloak auth, request/event subscription |
| `CKPage` | `ck-page.js` | Unified page harness — auto-detects kernel from `/ontology.yaml`, renders chrome |
| `CKBus` | `ck-bus.js` | Local pub/sub with NATS-style wildcards (`*`, `>`) |
| `CKKernel` | `ck-kernel.js` | Base kernel class with lifecycle hooks + shared design tokens |
| `CKRuntime` | `ck-runtime.js` | Orchestrator wiring CKClient + CKBus + CKStore + CKKernel |
| `CKRegistry` + `materialize()` | `ck-registry.js` | Type → shape/animation/layout mapping for Konva-based UI materialization |
| `CKStore` | `ck-store.js` | Persistence (IndexedDB-backed) |
| `CKShapes` | `ck-shapes.js` | Shape primitives |
| `CKAnim` + `ck-anim-grammar.js` | `ck-anim.js` | Animation grammar |
| `CKSound` | `ck-sound.js` | Sound primitives |
| `CKMaterializer` | `ck-materializer.js` | Type-driven Konva materialization |

Sole dependency: `nats.ws ^1.30.3` (vendored at `vendor/`).

## How It's Distributed

| Distribution | URI | Use |
|---|---|---|
| **OCI static bundle** | `ghcr.io/conceptkernel/ck-lib-js:1.2.0` | Compose into FastAPI / Envoy stacks (Sporaxis bundles) |
| **OCI static bundle (rolling)** | `ghcr.io/conceptkernel/ck-lib-js:latest` | Same content, rolling tag — pin to `1.2.0` in production |
| **GitHub source** | https://github.com/ConceptKernel/CK.Lib.Js | Read source, file issues, vendor manually |
| **npm** | `@conceptkernel/cklib` (publish blocked, scope claim pending) | Future; not available yet |

## OCI Bundle Properties

- **Base:** `FROM scratch` — no runtime, no shell, no http server
- **Designation:** `ckp:static` (per SPEC.OCI.BUNDLE.v0.2 §1)
- **Content path inside image:** `/ck-lib-js/` (all files at root of this dir)
- **Platforms:** `linux/amd64`, `linux/arm64` (single multi-platform manifest)
- **Visibility:** Public (anonymous `docker pull` works, no GHCR auth required)
- **Size:** 2.07 MB (raw JS source + `nats.ws` vendored)

## How to Consume (SPEC.OCI.BUNDLE.v0.2 pattern)

In your `bundle.yaml`:

```yaml
spec_version: 0.2
static_web:
  - source_image: ghcr.io/conceptkernel/ck-lib-js:1.2.0
    route: /cklib
```

Generated Dockerfile (auto, once the v0.2 generator ships in oci-germination):

```dockerfile
FROM ghcr.io/conceptkernel/ck-lib-js:1.2.0 AS cklib_source
FROM python:3.11-slim AS builder
COPY --from=cklib_source / /app/cklib/
```

FastAPI mount (auto-generated):

```python
app.mount("/cklib", StaticFiles(directory=str(cklib_dir)), name="cklib")
```

## Browser Consumption Pattern

After the bundle is served at `/cklib/`, an HTML page loads it via ESM:

```html
<script type="module">
  import { CKPage } from '/cklib/ck-page.js';
  await CKPage.init();
</script>
```

Or for fine-grained control:

```html
<script type="module">
  import { CKClient } from '/cklib/ck-client.js';
  const ck = new CKClient({
    kernel: 'pgCK.Goal',
    natsUrl: 'wss://nats-bridge.localhost:9222'
  });
  await ck.connect();
  ck.on('event', msg => { ... });
  await ck.send({ action: 'create', payload: { ... } });
</script>
```

## Transport Discipline

CK.Lib.Js speaks **NATS WSS only** (no REST). Subject families:

| Subject family | Direction | Purpose |
|---|---|---|
| `input.kernel.<Kernel>.action.<verb>` | browser → kernel | Affordance dispatch (request) |
| `result.kernel.<Kernel>.action.<verb>` | kernel → browser | Affordance result (reply) |
| `event.kernel.<Kernel>.<event>` | kernel → browser | One-fact-per-message event broadcast |
| `stream.kernel.<Kernel>.<stream>` | kernel → browser | High-frequency observer streams (v1.3+ binary) |

Per **SPEC.CKP.v3.8-rc-06-nats** (in pgCK `_WIP/`).

## Confirmed Consumer Compatibility (2026-05-27)

| Consumer repo | Status | Notes |
|---|---|---|
| `git_sporaxis-com/oci-germination` `bundles/bundle-ck-allinone/` | ✅ COMPATIBLE | Pinned to `1.2.0`, v0.2 `static_web:`, mount `/cklib` |
| `git_sporaxis-com/oci-germination` `bundles/bundle-pg17-pgrdf-pgck-web-cklib/` | ✅ COMPATIBLE | Pinned to `1.2.0`, v0.2 `static_web:`, mount `/cklib` |
| `git_neux/nx-marketplace-operator-azure/sku/pgck/` | ⚠️ NOT INTEGRATED | See [NOTIFIES.CK.Lib.Js.v1.2.0.PGCK-SKU-INTEGRATION-GAP.md](NOTIFIES.CK.Lib.Js.v1.2.0.PGCK-SKU-INTEGRATION-GAP.md) |

## Action Required for Consumers

| If you... | Then... |
|---|---|
| ...were pulling `:1.2.0-dev` (145 MB http-server variant) | See [NOTIFIES.CK.Lib.Js.v1.2.0.DEV-VARIANT-REMOVED.md](NOTIFIES.CK.Lib.Js.v1.2.0.DEV-VARIANT-REMOVED.md) |
| ...are on `:latest` for production | Pin to `:1.2.0` explicitly |
| ...hand-edited a Dockerfile with `COPY --from=ck-lib-js` | Replace with v0.2 `static_web:` once oci-germination generator ships |
| ...were waiting for binary delta / dedup | That lands in v1.3.0; v1.2.0 stays Core JSON |

## References

- **CHANGELOG.md** (this repo) — v1.2.0 entry
- **COMPLIANCE.md** (this repo) — full v1.1.0 → v1.2.0 → v1.3.0 → v2.0.0 roadmap
- **COMPLIANCE.v0.2-pgCK-ALIGNMENT.md** (this repo) — v3.7 → v3.8 architecture shift
- **SPEC.OCI.BUNDLE.v0.2** (`git_sporaxis-com/oci-germination/`) — consumer pattern
- **SPEC.CKP.v3.8-rc-06-nats** (`git_conceptkernel/pgCK/_WIP/`) — subject families
