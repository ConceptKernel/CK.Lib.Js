# CK.Lib.Js — latest published artifacts

One publishable surface ships from this repo today: the **OCI static bundle** (`ckp:static` designation) published to GHCR. The npm package (`@conceptkernel/cklib`) is staged in `package.json` but not yet released — see [SPEC.CK.LIB.JS.PUBLIC.v1.0](./SPEC.CK.LIB.JS.PUBLIC.v1.0.md) for the reconciliation plan. See [Repo packages view](https://github.com/conceptkernel/ck-lib-js/pkgs/container/ck-lib-js) for the full version history.

> **⚠ Provenance gap (2026-05-28):** the `v1.3.0` image currently on GHCR was built via local `docker buildx --push`, NOT GitHub Actions. It carries no GHA build attestation. Per the project's release rule (`memory/feedback_tag_must_pair_with_built_package`), this is treated as an unfulfilled release. Versions `v1.3.1` and `v1.3.2` were tagged to iterate the GHA pipeline; `v1.3.1` produced no image, `v1.3.2` triggered a GHA run that built successfully but failed at push (`permission_denied: write_package` — package-level Actions access needs to be granted at https://github.com/orgs/ConceptKernel/packages/container/ck-lib-js/settings). The next successful GHA-built release will populate the **GitHub provenance** section below and supersede this notice.

## CK.Lib.Js OCI bundle — `v1.3.0`

`docker pull ghcr.io/conceptkernel/ck-lib-js:1.3.0` → mount as `static_web` source in your `bundle.yaml` per [SPEC.OCI.BUNDLE.v0.2](https://github.com/conceptkernel). Files land at image root (`/ck-client.js`, `/ck-page.js`, `/vendor/`) ready for spec-standard `COPY --from=cklib_source / dest/`.

| arch  | Pull URI                                | Also tagged | Digest                                                                  | Created (UTC)       |
|-------|-----------------------------------------|-------------|-------------------------------------------------------------------------|---------------------|
| amd64 | `ghcr.io/conceptkernel/ck-lib-js:1.3.0` | `latest`    | `sha256:c1078de454cb6116796c0871f4a7ee8bb822ccdf18863c827ae0c56517448f9a` | 2026-05-28 03:46:46 |
| arm64 | `ghcr.io/conceptkernel/ck-lib-js:1.3.0` | `latest`    | `sha256:aba88533202e4505efce1dddef8c1cfb56ab390e41227a6d2094aae6ee72ec3b` | 2026-05-28 03:46:46 |

|                       |                                                                              |
|-----------------------|------------------------------------------------------------------------------|
| Artifact type         | OCI image index (multi-arch); `org.opencontainers.image.designation=ckp:static` |
| Index digest          | `sha256:23fe41f74e26b6735e4e94074963133bb36f122aa1adbb906b2c8009afe5c092`     |
| Bundle size           | ~80 KB per arch (post v1.2.1 dead-weight removal)                            |
| Source                | [`Dockerfile`](./Dockerfile) · [`build-ck-lib-js.sh`](./build-ck-lib-js.sh)  |
| Release notes         | [`CHANGELOG.md`](./CHANGELOG.md) · [GitHub release](https://github.com/conceptkernel/ck-lib-js/releases/tag/v1.3.0) |
| Repo packages view    | https://github.com/conceptkernel/ck-lib-js/pkgs/container/ck-lib-js          |

## GitHub provenance (proof the image came from GitHub Actions)

> **Status: NOT POPULATED** — `v1.3.0` was built locally, no GHA run paired with this tag. Fields below will be filled on the next successful GHA-built release per `memory/feedback_tag_must_pair_with_built_package`.

| Proof field           | Value (template — populated on GHA-built release)                            |
|-----------------------|------------------------------------------------------------------------------|
| Workflow run URL      | `https://github.com/ConceptKernel/CK.Lib.Js/actions/runs/<run_id>`           |
| Workflow file @ ref   | `https://github.com/ConceptKernel/CK.Lib.Js/blob/v<version>/.github/workflows/release-pipeline.yml` |
| Commit SHA            | `<sha>` → `https://github.com/ConceptKernel/CK.Lib.Js/commit/<sha>`          |
| Tag URL               | `https://github.com/ConceptKernel/CK.Lib.Js/releases/tag/v<version>`         |
| Builder ID (attestation) | `https://github.com/ConceptKernel/CK.Lib.Js/actions/runs/<run_id>`        |
| Verify command        | `gh attestation verify oci://ghcr.io/conceptkernel/ck-lib-js:<version> --owner ConceptKernel` |
| Cosign inspection     | `cosign verify-attestation --type slsaprovenance ghcr.io/conceptkernel/ck-lib-js:<version>` |

The image carries `--attest type=provenance,mode=max,builder-id=<run-url>` baked into the OCI manifest, signed by GitHub's OIDC token. This is the cryptographic proof that the image was built by a specific GHA workflow run from a specific commit at a specific tag.

## Use as static layer

In your `bundle.yaml`:

```yaml
spec_version: 0.2
static_web:
  - source_image: ghcr.io/conceptkernel/ck-lib-js:1.3.0
    route: /cklib
```

Browser consumption (after the bundle is mounted at `/cklib/`):

```html
<script type="module">
  import { CKPage } from '/cklib/ck-page.js';
  await CKPage.init();
</script>
```

See [`README.md`](./README.md) for the full ESM export surface and [`COMPLIANCE.md`](./COMPLIANCE.md) for the v3.8 transport contract.

## Pin policy

- `latest` tracks the **most recent CK.Lib.Js tag** on the multi-arch image index. Both arches resolve transparently via Docker's manifest negotiation — no `latest-amd64` / `latest-arm64` split.
- Tagged versions are immutable on GHCR. Pin by version (`1.3.0`) in production bundles; use `latest` only for development.
- The OCI bundle is anonymous public pull — no GHCR auth required.

See [`CHANGELOG.md`](./CHANGELOG.md) for what changed per version.
