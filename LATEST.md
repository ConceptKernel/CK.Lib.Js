# CK.Lib.Js — latest published artifacts

One publishable surface ships from this repo: the **OCI static bundle** (`ckp:static` designation) — a CKP v3.8 JavaScript client library mounted as a static folder layer per [SPEC.OCI.BUNDLE.v0.2](https://github.com/sporaxis-com/oci-germination). The npm package `@conceptkernel/cklib` is staged in `package.json` but not yet released — see [`SPEC.CK.LIB.JS.PUBLIC.v1.0`](./SPEC.CK.LIB.JS.PUBLIC.v1.0.md). See [Repo packages view](https://github.com/ConceptKernel/CK.Lib.Js/pkgs/container/ck-lib-js) for the full version history.

## CK.Lib.Js OCI bundle — `v1.3.10`

Per [`PROVENANCE.md`](./PROVENANCE.md), every digest below verifies under `gh attestation verify oci://… --repo ConceptKernel/CK.Lib.Js`. Versions before v1.3.9 predate the attestation wiring and never appear here — re-publishing them would change digests and break the immutability promise.

`docker pull ghcr.io/conceptkernel/ck-lib-js:1.3.10` → mount as `static_web` source in your `bundle.yaml` per SPEC.OCI.BUNDLE.v0.2. Files land at image root (`/ck-client.js`, `/ck-page.js`, `/vendor/`) ready for spec-standard `COPY --from=cklib_source / dest/`.

| arch  | Pull URI                                | Also tagged | Digest                                                                  | Created (UTC)       |
|-------|-----------------------------------------|-------------|-------------------------------------------------------------------------|---------------------|
| amd64 | `ghcr.io/conceptkernel/ck-lib-js:1.3.10` | `latest`  | `sha256:5a196b63f357b62e7e12ccbe5e0bbb9fb24084e0af5be0f3113719594b77d18f` | 2026-05-28 20:04:35 UTC |
| arm64 | `ghcr.io/conceptkernel/ck-lib-js:1.3.10` | `latest`  | `sha256:514a6b3522ba29ab5fffa200507a6fcf0f37a583d8df06697eaa73ca85089ec8` | 2026-05-28 20:04:35 UTC |

|                       |                                                                                                |
|-----------------------|------------------------------------------------------------------------------------------------|
| Artifact type         | OCI image index (multi-arch); `org.opencontainers.image.designation=ckp:static`               |
| Aggregate index       | `ghcr.io/conceptkernel/ck-lib-js:1.3.10` (also tagged `latest`)                              |
| Aggregate digest      | `sha256:6618cd29931ece602306d3c7682756536c7744cdc35b128a62e0e30d2ed20315`                                                                                    |
| Provenance            | SLSA Build Provenance v1, Sigstore-backed, pushed as OCI referrer                              |
| Built by              | [Workflow run #26599092051](https://github.com/ConceptKernel/CK.Lib.Js/actions/runs/26599092051)                          |
| Built from commit     | [`c1e6c3ce8cc330d2a0b81be99ff9efcf8e6345be`](https://github.com/ConceptKernel/CK.Lib.Js/commit/c1e6c3ce8cc330d2a0b81be99ff9efcf8e6345be)                                          |
| Verify (CLI)          | `gh attestation verify oci://ghcr.io/conceptkernel/ck-lib-js:1.3.10 --repo ConceptKernel/CK.Lib.Js`            |
| Release notes         | https://github.com/ConceptKernel/CK.Lib.Js/releases/tag/v1.3.10                                                  |
| Repo packages view    | https://github.com/ConceptKernel/CK.Lib.Js/pkgs/container/ck-lib-js                                             |

## Verifying any artifact above

```sh
# Multi-arch index (Docker's manifest negotiation picks the right arch)
gh attestation verify oci://ghcr.io/conceptkernel/ck-lib-js:1.3.10 \
  --repo ConceptKernel/CK.Lib.Js

# A specific per-arch leaf
gh attestation verify oci://ghcr.io/conceptkernel/ck-lib-js@sha256:5a196b63f357b62e7e12ccbe5e0bbb9fb24084e0af5be0f3113719594b77d18f \
  --repo ConceptKernel/CK.Lib.Js
```

A successful verify means: signed by GitHub's Fulcio CA against the OIDC token of the v1.3.10 `oci-publish` workflow run, recorded in Sigstore's Rekor transparency log, subject digest matches the pulled artifact.

## Use as static layer

In your `bundle.yaml` (per SPEC.OCI.BUNDLE.v0.2):

```yaml
spec_version: 0.2
static_web:
  - source_image: ghcr.io/conceptkernel/ck-lib-js:1.3.10
    route: /cklib
```

Browser consumption (after the bundle is mounted at `/cklib/`):

```html
<script type="module">
  import { CKPage } from '/cklib/ck-page.js';
  await CKPage.init();
</script>
```

## Pin policy

- `latest` tracks the most recent attested CK.Lib.Js tag on the multi-arch image index. Both arches resolve transparently via Docker's manifest negotiation — no `latest-amd64` / `latest-arm64` split.
- Tagged versions are immutable on GHCR. Pin by version (`1.3.10`) in production bundles; use `latest` only for development.
- The OCI bundle is anonymous public pull — no GHCR auth required.
- Per [`PROVENANCE.md`](./PROVENANCE.md) Rule 2: do not consider an artifact "shipped" if its digest does not verify under `gh attestation verify`.

See [`CHANGELOG.md`](./CHANGELOG.md) for what changed per version, [`COMPLIANCE.md`](./COMPLIANCE.md) for the v3.8 transport contract, [`README.md`](./README.md) for the full ESM export surface.

---

> Rendered automatically by `.github/workflows/oci-publish.yml` on 2026-05-28 20:04:35 UTC after `gh attestation verify` accepted the aggregate digest above.
