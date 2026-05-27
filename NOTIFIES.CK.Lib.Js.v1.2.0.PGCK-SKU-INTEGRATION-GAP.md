---
library: CK.Lib.Js
version: 1.2.0
date: 2026-05-27
theme: PGCK-SKU-INTEGRATION-GAP
severity: blocker-for-pgck-marketplace-launch
audience: /Users/neoxr/git_neux/nx-marketplace-operator-azure/sku/pgck/ owners
source-repo: https://github.com/ConceptKernel/CK.Lib.Js
---

# NOTIFIES — pgCK SKU Has No CK.Lib.Js Integration

## TL;DR

`nx-marketplace-operator-azure/sku/pgck/` currently has **zero references** to CK.Lib.Js, `/cklib`, NATS WSS, or any Sporaxis composite bundle. The SKU directory is scaffolding only — no deployment manifest, no Bicep template, no pod spec wires up the browser ↔ kernel transport. This is a **release blocker** for any pgCK marketplace launch that promises a browser UI.

The upstream consumer (Sporaxis `oci-germination/bundles/bundle-pg17-pgrdf-pgck-web-cklib/`) is fully ready and pinned to `ck-lib-js:1.2.0`. The composite image it produces is what the SKU should deploy. This NOTIFIES is the bridge document.

## What's Missing (Audit 2026-05-27)

| Concern | Found in SKU? | What's needed |
|---|---|---|
| Reference to a composite OCI image that includes ck-lib-js | ❌ | Pin to `ghcr.io/sporaxis-com/ociger-ck-allinone:<version>` or the pg17-pgrdf-pgck-web-cklib variant |
| `/cklib` route exposed in Envoy / ACA ingress | ❌ | The composite image serves `/cklib/*` via FastAPI mount; SKU must not strip or rewrite that prefix |
| HTML/JS files importing from `/cklib/` | ❌ | The pgCK SPA needs `<script type="module">import { CKPage } from '/cklib/ck-page.js'</script>` |
| NATS WSS endpoint URL configured | ❌ | `wss://...` URL must be set so `CKClient` can connect (env var or page-injected config) |
| Image tag pinned (not `:latest`) | ❌ | Currently `pgrdf:latest`; should be a specific version |
| ACR vs GHCR source for composite | ❌ | Decide: pull composite from GHCR directly, or mirror to ACR (`acrmpsandbox...`) |

## Recommended Integration Shape

### 1. Pick the composite image

Two options from `oci-germination`:

| Composite | What it contains | When to use |
|---|---|---|
| `ghcr.io/sporaxis-com/ociger-pg17-pgrdf-pgck-web-cklib:<ver>` | Postgres 17 + pg-rdf + pgCK web + CK.Lib.Js at `/cklib` | Focused pgCK SKU |
| `ghcr.io/sporaxis-com/ociger-ck-allinone:<ver>` | All-in-one (also includes NATS, etc.) | Single-pod marketplace deploy |

The all-in-one matches the typical Azure Marketplace single-container deploy.

### 2. Wire the pod / Container App

Replace the `pgrdf:latest` reference in `marketplace/control-plane/activate.sh` (line ~36):

```diff
-POD_IMAGE_DEFAULT="acrmpsandbox${SANDBOX_SUBSCRIPTION_ID:0:8}.azurecr.io/pgrdf:latest"
+# For pgCK plan: use Sporaxis composite that bundles ck-lib-js at /cklib
+POD_IMAGE_DEFAULT="ghcr.io/sporaxis-com/ociger-ck-allinone:<pinned-version>"
```

(Or mirror the composite to ACR first, depending on your ACR-only sandbox policy.)

### 3. Expose `/cklib` through ingress

The composite serves `/cklib/*` from FastAPI's `StaticFiles`. The ACA / Envoy ingress must pass that prefix through unchanged. Do **not** strip `/cklib` — the SPA imports use it as an absolute path.

If pgCK runs behind a sub-path mount (e.g. `/pgck/`), then `/cklib` becomes `/pgck/cklib` and the SPA imports must match. Pick one and stick with it.

### 4. Configure NATS WSS endpoint

`CKClient` needs a `natsUrl`. Three patterns:

```javascript
// Option A: page-injected (preferred for marketplace deploys)
const ck = new CKClient({
  kernel: 'pgCK.Goal',
  natsUrl: window.__CK_CONFIG__.natsUrl
});

// Option B: derived from current host
const ck = new CKClient({
  kernel: 'pgCK.Goal',
  natsUrl: `wss://${location.host}/nats`
});

// Option C: hard-coded for single-pod all-in-one
const ck = new CKClient({
  kernel: 'pgCK.Goal',
  natsUrl: 'wss://localhost:9222'
});
```

The all-in-one bundle's NATS service exposes WSS on `:9222`. Pick whichever matches your ingress shape.

### 5. SPA entry point

Add (or update) `sku/pgrdf/v0.1/app/static/ui/index.html` (or pgCK's SPA equivalent) to load CK.Lib.Js:

```html
<!DOCTYPE html>
<html>
  <head>
    <title>pgCK</title>
    <script>
      window.__CK_CONFIG__ = { natsUrl: 'wss://CHOOSE_ME' };
    </script>
  </head>
  <body>
    <div id="app"></div>
    <script type="module">
      import { CKPage } from '/cklib/ck-page.js';
      await CKPage.init({ mount: '#app', kernel: 'pgCK.Goal' });
    </script>
  </body>
</html>
```

## Compatibility Confirmation

Once the above is wired:

- ✅ `ck-lib-js:1.2.0` is published and publicly pullable from GHCR (no auth)
- ✅ Sporaxis composite bundles correctly pin and mount it at `/cklib` (per SPEC.OCI.BUNDLE.v0.2)
- ✅ Transport contract (NATS WSS, `input.kernel.*` ↔ `result.kernel.*` ↔ `event.kernel.*`) is stable through v1.2.x
- ✅ Bundle is `FROM scratch` static-only (2.07 MB) — no runtime surprises

The only missing piece is the SKU wiring.

## Pre-launch Checklist

- [ ] Decide composite (`bundle-ck-allinone` vs `bundle-pg17-pgrdf-pgck-web-cklib`)
- [ ] Pin composite to a specific version (no `:latest` in production deploys)
- [ ] Update `activate.sh` `POD_IMAGE_DEFAULT` (or whichever variable feeds the pgCK plan)
- [ ] Confirm ACA / Envoy passes `/cklib` through unchanged
- [ ] Add `window.__CK_CONFIG__` or equivalent NATS URL injection
- [ ] Add `<script type="module">import { CKPage } from '/cklib/ck-page.js'</script>` to SPA
- [ ] Smoke test: page loads, `CKClient` connects, `event.kernel.*` arrives, an `input.kernel.*` round-trips
- [ ] Document the wired endpoints in the SKU README

## When This Document Becomes Obsolete

Delete or supersede this NOTIFIES once the pgCK SKU has at least one composite image pinned, the SPA imports from `/cklib/`, and a smoke test confirms a NATS round-trip. At that point, update [NOTIFIES.CK.Lib.Js.v1.2.0.OCI-BUNDLE-RELEASED.md](NOTIFIES.CK.Lib.Js.v1.2.0.OCI-BUNDLE-RELEASED.md) §"Confirmed Consumer Compatibility" to mark the SKU as ✅.

## References

- **NOTIFIES.CK.Lib.Js.v1.2.0.OCI-BUNDLE-RELEASED.md** — release headline
- **NOTIFIES.CK.Lib.Js.v1.2.0.DEV-VARIANT-REMOVED.md** — confirms zero blast radius from `-dev` removal on this SKU
- **Sporaxis composite bundles:**
  - `/Users/neoxr/git_sporaxis-com/oci-germination/bundles/bundle-ck-allinone/bundle.yaml`
  - `/Users/neoxr/git_sporaxis-com/oci-germination/bundles/bundle-pg17-pgrdf-pgck-web-cklib/bundle.yaml`
- **SPEC.OCI.BUNDLE.v0.2** — `/Users/neoxr/git_sporaxis-com/oci-germination/SPEC.OCI.BUNDLE.v0.2.md`
- **SKU directory under audit:** `/Users/neoxr/git_neux/nx-marketplace-operator-azure/sku/pgck/`
- **activate.sh** — `/Users/neoxr/git_neux/nx-marketplace-operator-azure/marketplace/control-plane/activate.sh`
