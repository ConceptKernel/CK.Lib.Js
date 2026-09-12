# CK.Lib.Js — latest published artifacts

One publishable surface ships from this repo today: the **OCI static bundle** (`ckp:static`) per [SPEC.OCI.BUNDLE.v0.4](https://github.com/sporaxis-com/oci-germination/blob/main/SPEC.OCI.BUNDLE.v0.4.md), attestation-gated (this file renders only after `gh attestation verify` passes). **npm is not a delivery channel** for this library (operator ruling 2026-08-18): publishing is disabled deliberately — the workflow gate is off and `package.json` carries `"private": true`. Note `@conceptkernel/cklib@1.0.0` remains on the public registry from an early publish and is **not a supported artifact**. See [Repo packages view](https://github.com/ConceptKernel/CK.Lib.Js/pkgs/container/ck-lib-js) for the full version history.

## CK.Lib.Js OCI bundle — `v1.6.6`

Per [`PROVENANCE.md`](./PROVENANCE.md), every digest below verifies under `gh attestation verify oci://… --repo ConceptKernel/CK.Lib.Js`. Versions before v1.3.9 predate the attestation wiring and never appear here — re-publishing them would change digests and break the immutability promise.

`docker pull ghcr.io/conceptkernel/ck-lib-js:1.6.6` → declare as a `static_web` (routed) or `layer_sources` (additive merge) entry in your `bundle.yaml` per SPEC.OCI.BUNDLE.v0.4. The bundle lands the facade + transport + cache at image root (`/ck.js`, `/ck-client.js`, `/ck-store.js`, `/vendor/`) ready for spec-standard `COPY --from=cklib_source / dest/`.

| arch  | Pull URI                                | Also tagged | Digest                                                                  | Created (UTC)       |
|-------|-----------------------------------------|-------------|-------------------------------------------------------------------------|---------------------|
| amd64 | `ghcr.io/conceptkernel/ck-lib-js:1.6.6` | `latest`  | `sha256:cb2e0c6b42372ae91dc123822240ebb0168dbc0c0180e1c884daa871f56990c6` | 2026-09-12 08:45:21 UTC |
| arm64 | `ghcr.io/conceptkernel/ck-lib-js:1.6.6` | `latest`  | `sha256:4fa3cd12a2f599d764313f99c71aa83ea25f76ea4e625aa1d42b08eda489cd32` | 2026-09-12 08:45:21 UTC |

|                       |                                                                                                |
|-----------------------|------------------------------------------------------------------------------------------------|
| Artifact type         | OCI image index (multi-arch); `org.opencontainers.image.designation=ckp:static`               |
| Aggregate index       | `ghcr.io/conceptkernel/ck-lib-js:1.6.6` (also tagged `latest`)                              |
| Aggregate digest      | `sha256:7ac5ac4eebc0e84c0ea141c186bf50a24f584307a974944bcb656648f241d066`                                                                                    |
| Provenance            | SLSA Build Provenance v1, Sigstore-backed, pushed as OCI referrer                              |
| Built by              | [Workflow run #34684045039](https://github.com/ConceptKernel/CK.Lib.Js/actions/runs/34684045039)                          |
| Built from commit     | [`f45ba5bc1987c268aa4ac6981d536e04889cd777`](https://github.com/ConceptKernel/CK.Lib.Js/commit/f45ba5bc1987c268aa4ac6981d536e04889cd777)                                          |
| Verify (CLI)          | `gh attestation verify oci://ghcr.io/conceptkernel/ck-lib-js:1.6.6 --repo ConceptKernel/CK.Lib.Js`            |
| Release notes         | https://github.com/ConceptKernel/CK.Lib.Js/releases/tag/v1.6.6                                                  |
| Repo packages view    | https://github.com/ConceptKernel/CK.Lib.Js/pkgs/container/ck-lib-js                                             |

## Verifying any artifact above

```sh
# Multi-arch index (Docker's manifest negotiation picks the right arch)
gh attestation verify oci://ghcr.io/conceptkernel/ck-lib-js:1.6.6 \
  --repo ConceptKernel/CK.Lib.Js

# A specific per-arch leaf
gh attestation verify oci://ghcr.io/conceptkernel/ck-lib-js@sha256:cb2e0c6b42372ae91dc123822240ebb0168dbc0c0180e1c884daa871f56990c6 \
  --repo ConceptKernel/CK.Lib.Js
```

A successful verify means: signed by GitHub's Fulcio CA against the OIDC token of the v1.6.6 `oci-publish` workflow run, recorded in Sigstore's Rekor transparency log, subject digest matches the pulled artifact.

## Use as static layer

In your `bundle.yaml` (per [SPEC.OCI.BUNDLE.v0.3](https://github.com/sporaxis-com/oci-germination/blob/main/SPEC.OCI.BUNDLE.v0.3.md)):

```yaml
spec_version: 0.3
# Shape A — routed mount under a path the FastAPI/static server exposes:
static_web:
  - source_image: ghcr.io/conceptkernel/ck-lib-js:1.6.6
    route: /cklib
    attestation_repo: ConceptKernel/CK.Lib.Js
# …or additive filesystem merge into the final image:
layer_sources:
  - source_image: ghcr.io/conceptkernel/ck-lib-js:1.6.6
    into: /app/cklib/
    attestation_repo: ConceptKernel/CK.Lib.Js
```

The build MUST run `gh attestation verify oci://ghcr.io/conceptkernel/ck-lib-js:1.6.6 --repo ConceptKernel/CK.Lib.Js` before the consuming image is pushed (SPEC.OCI.BUNDLE.v0.3 §4 build-time gate).

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
- Tagged versions are immutable on GHCR. Pin by version (`1.6.6`) in production bundles; use `latest` only for development.
- The OCI bundle is anonymous public pull — no GHCR auth required.
- Per [`PROVENANCE.md`](./PROVENANCE.md) Rule 2: do not consider an artifact "shipped" if its digest does not verify under `gh attestation verify`.

See [`CHANGELOG.md`](./CHANGELOG.md) for what changed per version.

---

> Rendered automatically by `.github/workflows/oci-publish.yml` on 2026-09-12 08:45:21 UTC after `gh attestation verify` accepted the aggregate digest above.
