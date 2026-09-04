# CK.Lib.Js — latest published artifacts

One publishable surface ships from this repo today: the **OCI static bundle** (`ckp:static`) per [SPEC.OCI.BUNDLE.v0.4](https://github.com/sporaxis-com/oci-germination/blob/main/SPEC.OCI.BUNDLE.v0.4.md), attestation-gated (this file renders only after `gh attestation verify` passes). **npm is not a delivery channel** for this library (operator ruling 2026-08-18): publishing is disabled deliberately — the workflow gate is off and `package.json` carries `"private": true`. Note `@conceptkernel/cklib@1.0.0` remains on the public registry from an early publish and is **not a supported artifact**. See [Repo packages view](https://github.com/ConceptKernel/CK.Lib.Js/pkgs/container/ck-lib-js) for the full version history.

## CK.Lib.Js OCI bundle — `v1.6.4`

Per [`PROVENANCE.md`](./PROVENANCE.md), every digest below verifies under `gh attestation verify oci://… --repo ConceptKernel/CK.Lib.Js`. Versions before v1.3.9 predate the attestation wiring and never appear here — re-publishing them would change digests and break the immutability promise.

`docker pull ghcr.io/conceptkernel/ck-lib-js:1.6.4` → declare as a `static_web` (routed) or `layer_sources` (additive merge) entry in your `bundle.yaml` per SPEC.OCI.BUNDLE.v0.4. The bundle lands the facade + transport + cache at image root (`/ck.js`, `/ck-client.js`, `/ck-store.js`, `/vendor/`) ready for spec-standard `COPY --from=cklib_source / dest/`.

| arch  | Pull URI                                | Also tagged | Digest                                                                  | Created (UTC)       |
|-------|-----------------------------------------|-------------|-------------------------------------------------------------------------|---------------------|
| amd64 | `ghcr.io/conceptkernel/ck-lib-js:1.6.4` | `latest`  | `sha256:abce56e7968ad27c37258e1ae2838abb8f5628b38f52da2bd85e52f72cef7438` | 2026-09-04 12:57:52 UTC |
| arm64 | `ghcr.io/conceptkernel/ck-lib-js:1.6.4` | `latest`  | `sha256:7e56f80bf5b90af52f23be791179ca14662f87aa40bda32e68174fa0e48ce01e` | 2026-09-04 12:57:52 UTC |

|                       |                                                                                                |
|-----------------------|------------------------------------------------------------------------------------------------|
| Artifact type         | OCI image index (multi-arch); `org.opencontainers.image.designation=ckp:static`               |
| Aggregate index       | `ghcr.io/conceptkernel/ck-lib-js:1.6.4` (also tagged `latest`)                              |
| Aggregate digest      | `sha256:a638d6d371e9a8be7503c1df9d49ac28e65dd486e5c2654d3157e97f5cba2783`                                                                                    |
| Provenance            | SLSA Build Provenance v1, Sigstore-backed, pushed as OCI referrer                              |
| Built by              | [Workflow run #33875393981](https://github.com/ConceptKernel/CK.Lib.Js/actions/runs/33875393981)                          |
| Built from commit     | [`f7b4ea8f63149d18fde08b7f3067583721667c4f`](https://github.com/ConceptKernel/CK.Lib.Js/commit/f7b4ea8f63149d18fde08b7f3067583721667c4f)                                          |
| Verify (CLI)          | `gh attestation verify oci://ghcr.io/conceptkernel/ck-lib-js:1.6.4 --repo ConceptKernel/CK.Lib.Js`            |
| Release notes         | https://github.com/ConceptKernel/CK.Lib.Js/releases/tag/v1.6.4                                                  |
| Repo packages view    | https://github.com/ConceptKernel/CK.Lib.Js/pkgs/container/ck-lib-js                                             |

## Verifying any artifact above

```sh
# Multi-arch index (Docker's manifest negotiation picks the right arch)
gh attestation verify oci://ghcr.io/conceptkernel/ck-lib-js:1.6.4 \
  --repo ConceptKernel/CK.Lib.Js

# A specific per-arch leaf
gh attestation verify oci://ghcr.io/conceptkernel/ck-lib-js@sha256:abce56e7968ad27c37258e1ae2838abb8f5628b38f52da2bd85e52f72cef7438 \
  --repo ConceptKernel/CK.Lib.Js
```

A successful verify means: signed by GitHub's Fulcio CA against the OIDC token of the v1.6.4 `oci-publish` workflow run, recorded in Sigstore's Rekor transparency log, subject digest matches the pulled artifact.

## Use as static layer

In your `bundle.yaml` (per [SPEC.OCI.BUNDLE.v0.3](https://github.com/sporaxis-com/oci-germination/blob/main/SPEC.OCI.BUNDLE.v0.3.md)):

```yaml
spec_version: 0.3
# Shape A — routed mount under a path the FastAPI/static server exposes:
static_web:
  - source_image: ghcr.io/conceptkernel/ck-lib-js:1.6.4
    route: /cklib
    attestation_repo: ConceptKernel/CK.Lib.Js
# …or additive filesystem merge into the final image:
layer_sources:
  - source_image: ghcr.io/conceptkernel/ck-lib-js:1.6.4
    into: /app/cklib/
    attestation_repo: ConceptKernel/CK.Lib.Js
```

The build MUST run `gh attestation verify oci://ghcr.io/conceptkernel/ck-lib-js:1.6.4 --repo ConceptKernel/CK.Lib.Js` before the consuming image is pushed (SPEC.OCI.BUNDLE.v0.3 §4 build-time gate).

Browser consumption (after the bundle is mounted at `/cklib/`):

```html
<script type="module">
  import { CKClient } from '/cklib/ck-client.js';
  const ck = new CKClient({ kernel: 'pgCK.Task' });
  await ck.connect();
</script>
```

## Pin policy

- `latest` tracks the most recent attested CK.Lib.Js tag on the multi-arch image index. Both arches resolve transparently via Docker's manifest negotiation — no `latest-amd64` / `latest-arm64` split.
- Tagged versions are immutable on GHCR. Pin by version (`1.6.4`) in production bundles; use `latest` only for development.
- The OCI bundle is anonymous public pull — no GHCR auth required.
- Per [`PROVENANCE.md`](./PROVENANCE.md) Rule 2: do not consider an artifact "shipped" if its digest does not verify under `gh attestation verify`.

See [`CHANGELOG.md`](./CHANGELOG.md) for what changed per version.

---

> Rendered automatically by `.github/workflows/oci-publish.yml` on 2026-09-04 12:57:52 UTC after `gh attestation verify` accepted the aggregate digest above.
