# CK.Lib.Js — latest published artifacts

One publishable surface ships from this repo: the **OCI static bundle** (`ckp:static` designation) — the CKP **NATS WSS client (stripped, JWT)** shipped as a Shape A filesystem-layer OCI image per [SPEC.OCI.BUNDLE.v0.4](https://github.com/sporaxis-com/oci-germination/blob/main/SPEC.OCI.BUNDLE.v0.4.md). The npm package `@conceptkernel/cklib` is staged in `package.json` but not yet released. See [Repo packages view](https://github.com/ConceptKernel/CK.Lib.Js/pkgs/container/ck-lib-js) for the full version history.

## CK.Lib.Js OCI bundle — `v1.4.3`

Per [`PROVENANCE.md`](./PROVENANCE.md), every digest below verifies under `gh attestation verify oci://… --repo ConceptKernel/CK.Lib.Js`. Versions before v1.3.9 predate the attestation wiring and never appear here — re-publishing them would change digests and break the immutability promise.

`docker pull ghcr.io/conceptkernel/ck-lib-js:1.4.3` → declare as a `static_web` (routed) or `layer_sources` (additive merge) entry in your `bundle.yaml` per SPEC.OCI.BUNDLE.v0.4. The stripped bundle lands a single module at image root (`/ck-client.js`) ready for spec-standard `COPY --from=cklib_source / dest/`.

| arch  | Pull URI                                | Also tagged | Digest                                                                  | Created (UTC)       |
|-------|-----------------------------------------|-------------|-------------------------------------------------------------------------|---------------------|
| amd64 | `ghcr.io/conceptkernel/ck-lib-js:1.4.3` | `latest`  | `sha256:4e80af5b3c0ec58c96c275a4ed22b5857905ebf928f0d02a6b209989642d1192` | 2026-06-11 17:46:13 UTC |
| arm64 | `ghcr.io/conceptkernel/ck-lib-js:1.4.3` | `latest`  | `sha256:4e6593e37192cc3953bbdcc1e059e1a91451b6dec1b024954e6a21ada1cf0ab0` | 2026-06-11 17:46:13 UTC |

|                       |                                                                                                |
|-----------------------|------------------------------------------------------------------------------------------------|
| Artifact type         | OCI image index (multi-arch); `org.opencontainers.image.designation=ckp:static`               |
| Aggregate index       | `ghcr.io/conceptkernel/ck-lib-js:1.4.3` (also tagged `latest`)                              |
| Aggregate digest      | `sha256:f2f6c2df8401aef1f236a4c87d8ce722c4fdc2840d3d8d186a3daf3210c33211`                                                                                    |
| Provenance            | SLSA Build Provenance v1, Sigstore-backed, pushed as OCI referrer                              |
| Built by              | [Workflow run #27366230475](https://github.com/ConceptKernel/CK.Lib.Js/actions/runs/27366230475)                          |
| Built from commit     | [`aa4d960e07345eba9917aa5d777e83d75aed8f5f`](https://github.com/ConceptKernel/CK.Lib.Js/commit/aa4d960e07345eba9917aa5d777e83d75aed8f5f)                                          |
| Verify (CLI)          | `gh attestation verify oci://ghcr.io/conceptkernel/ck-lib-js:1.4.3 --repo ConceptKernel/CK.Lib.Js`            |
| Release notes         | https://github.com/ConceptKernel/CK.Lib.Js/releases/tag/v1.4.3                                                  |
| Repo packages view    | https://github.com/ConceptKernel/CK.Lib.Js/pkgs/container/ck-lib-js                                             |

## Verifying any artifact above

```sh
# Multi-arch index (Docker's manifest negotiation picks the right arch)
gh attestation verify oci://ghcr.io/conceptkernel/ck-lib-js:1.4.3 \
  --repo ConceptKernel/CK.Lib.Js

# A specific per-arch leaf
gh attestation verify oci://ghcr.io/conceptkernel/ck-lib-js@sha256:4e80af5b3c0ec58c96c275a4ed22b5857905ebf928f0d02a6b209989642d1192 \
  --repo ConceptKernel/CK.Lib.Js
```

A successful verify means: signed by GitHub's Fulcio CA against the OIDC token of the v1.4.3 `oci-publish` workflow run, recorded in Sigstore's Rekor transparency log, subject digest matches the pulled artifact.

## Use as static layer

In your `bundle.yaml` (per [SPEC.OCI.BUNDLE.v0.3](https://github.com/sporaxis-com/oci-germination/blob/main/SPEC.OCI.BUNDLE.v0.3.md)):

```yaml
spec_version: 0.3
# Shape A — routed mount under a path the FastAPI/static server exposes:
static_web:
  - source_image: ghcr.io/conceptkernel/ck-lib-js:1.4.3
    route: /cklib
    attestation_repo: ConceptKernel/CK.Lib.Js
# …or additive filesystem merge into the final image:
layer_sources:
  - source_image: ghcr.io/conceptkernel/ck-lib-js:1.4.3
    into: /app/cklib/
    attestation_repo: ConceptKernel/CK.Lib.Js
```

The build MUST run `gh attestation verify oci://ghcr.io/conceptkernel/ck-lib-js:1.4.3 --repo ConceptKernel/CK.Lib.Js` before the consuming image is pushed (SPEC.OCI.BUNDLE.v0.3 §4 build-time gate).

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
- Tagged versions are immutable on GHCR. Pin by version (`1.4.3`) in production bundles; use `latest` only for development.
- The OCI bundle is anonymous public pull — no GHCR auth required.
- Per [`PROVENANCE.md`](./PROVENANCE.md) Rule 2: do not consider an artifact "shipped" if its digest does not verify under `gh attestation verify`.

See [`CHANGELOG.md`](./CHANGELOG.md) for what changed per version, [`COMPLIANCE.md`](./COMPLIANCE.md) for the transport contract, [`README.md`](./README.md) for the `CKClient` API.

---

> Rendered automatically by `.github/workflows/oci-publish.yml` on 2026-06-11 17:46:13 UTC after `gh attestation verify` accepted the aggregate digest above.
