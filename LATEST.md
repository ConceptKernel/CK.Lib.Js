# CK.Lib.Js — latest published artifacts

One publishable surface ships from this repo: the **OCI static bundle** (`ckp:static` designation) — the CKP **NATS WSS client (stripped, JWT)** shipped as a Shape A filesystem-layer OCI image per [SPEC.OCI.BUNDLE.v0.4](https://github.com/sporaxis-com/oci-germination/blob/main/SPEC.OCI.BUNDLE.v0.4.md). The npm package `@conceptkernel/cklib` is staged in `package.json` but not yet released. See [Repo packages view](https://github.com/ConceptKernel/CK.Lib.Js/pkgs/container/ck-lib-js) for the full version history.

## CK.Lib.Js OCI bundle — `v1.4.2`

Per [`PROVENANCE.md`](./PROVENANCE.md), every digest below verifies under `gh attestation verify oci://… --repo ConceptKernel/CK.Lib.Js`. Versions before v1.3.9 predate the attestation wiring and never appear here — re-publishing them would change digests and break the immutability promise.

`docker pull ghcr.io/conceptkernel/ck-lib-js:1.4.2` → declare as a `static_web` (routed) or `layer_sources` (additive merge) entry in your `bundle.yaml` per SPEC.OCI.BUNDLE.v0.4. The stripped bundle lands a single module at image root (`/ck-client.js`) ready for spec-standard `COPY --from=cklib_source / dest/`.

| arch  | Pull URI                                | Also tagged | Digest                                                                  | Created (UTC)       |
|-------|-----------------------------------------|-------------|-------------------------------------------------------------------------|---------------------|
| amd64 | `ghcr.io/conceptkernel/ck-lib-js:1.4.2` | `latest`  | `sha256:964429f04ecdc2d94c6fd4458780ff753bd645cc3926fc6a189795be8c01006c` | 2026-06-10 22:27:53 UTC |
| arm64 | `ghcr.io/conceptkernel/ck-lib-js:1.4.2` | `latest`  | `sha256:7238270a25f478f9d5b7d7325d864d4ed9ef526497c6d072dd73d552149d1f3e` | 2026-06-10 22:27:53 UTC |

|                       |                                                                                                |
|-----------------------|------------------------------------------------------------------------------------------------|
| Artifact type         | OCI image index (multi-arch); `org.opencontainers.image.designation=ckp:static`               |
| Aggregate index       | `ghcr.io/conceptkernel/ck-lib-js:1.4.2` (also tagged `latest`)                              |
| Aggregate digest      | `sha256:479298c029b656d01f54d0fe588124b54e60e78ddfa1a1739b56101473a33188`                                                                                    |
| Provenance            | SLSA Build Provenance v1, Sigstore-backed, pushed as OCI referrer                              |
| Built by              | [Workflow run #27310388130](https://github.com/ConceptKernel/CK.Lib.Js/actions/runs/27310388130)                          |
| Built from commit     | [`d1c692f5c2e77777cfcc5bd42a596c0e5ff63bf1`](https://github.com/ConceptKernel/CK.Lib.Js/commit/d1c692f5c2e77777cfcc5bd42a596c0e5ff63bf1)                                          |
| Verify (CLI)          | `gh attestation verify oci://ghcr.io/conceptkernel/ck-lib-js:1.4.2 --repo ConceptKernel/CK.Lib.Js`            |
| Release notes         | https://github.com/ConceptKernel/CK.Lib.Js/releases/tag/v1.4.2                                                  |
| Repo packages view    | https://github.com/ConceptKernel/CK.Lib.Js/pkgs/container/ck-lib-js                                             |

## Verifying any artifact above

```sh
# Multi-arch index (Docker's manifest negotiation picks the right arch)
gh attestation verify oci://ghcr.io/conceptkernel/ck-lib-js:1.4.2 \
  --repo ConceptKernel/CK.Lib.Js

# A specific per-arch leaf
gh attestation verify oci://ghcr.io/conceptkernel/ck-lib-js@sha256:964429f04ecdc2d94c6fd4458780ff753bd645cc3926fc6a189795be8c01006c \
  --repo ConceptKernel/CK.Lib.Js
```

A successful verify means: signed by GitHub's Fulcio CA against the OIDC token of the v1.4.2 `oci-publish` workflow run, recorded in Sigstore's Rekor transparency log, subject digest matches the pulled artifact.

## Use as static layer

In your `bundle.yaml` (per [SPEC.OCI.BUNDLE.v0.3](https://github.com/sporaxis-com/oci-germination/blob/main/SPEC.OCI.BUNDLE.v0.3.md)):

```yaml
spec_version: 0.3
# Shape A — routed mount under a path the FastAPI/static server exposes:
static_web:
  - source_image: ghcr.io/conceptkernel/ck-lib-js:1.4.2
    route: /cklib
    attestation_repo: ConceptKernel/CK.Lib.Js
# …or additive filesystem merge into the final image:
layer_sources:
  - source_image: ghcr.io/conceptkernel/ck-lib-js:1.4.2
    into: /app/cklib/
    attestation_repo: ConceptKernel/CK.Lib.Js
```

The build MUST run `gh attestation verify oci://ghcr.io/conceptkernel/ck-lib-js:1.4.2 --repo ConceptKernel/CK.Lib.Js` before the consuming image is pushed (SPEC.OCI.BUNDLE.v0.3 §4 build-time gate).

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
- Tagged versions are immutable on GHCR. Pin by version (`1.4.2`) in production bundles; use `latest` only for development.
- The OCI bundle is anonymous public pull — no GHCR auth required.
- Per [`PROVENANCE.md`](./PROVENANCE.md) Rule 2: do not consider an artifact "shipped" if its digest does not verify under `gh attestation verify`.

See [`CHANGELOG.md`](./CHANGELOG.md) for what changed per version, [`COMPLIANCE.md`](./COMPLIANCE.md) for the transport contract, [`README.md`](./README.md) for the `CKClient` API.

---

> Rendered automatically by `.github/workflows/oci-publish.yml` on 2026-06-10 22:27:53 UTC after `gh attestation verify` accepted the aggregate digest above.
