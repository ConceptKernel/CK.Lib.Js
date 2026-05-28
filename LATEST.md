# CK.Lib.Js — latest attested release

> Rendered automatically by `.github/workflows/oci-publish.yml` on 2026-05-28 18:58:10 UTC after `gh attestation verify` accepted the digest below. See [`PROVENANCE.md`](./PROVENANCE.md) for the policy.

## Static OCI bundle — `v1.3.9`

```bash
docker pull ghcr.io/conceptkernel/ck-lib-js:1.3.9
```

### Per-architecture digests

| arch  | Pull URI                                | Also tagged | Digest |
|-------|-----------------------------------------|-------------|--------|
| amd64 | `ghcr.io/conceptkernel/ck-lib-js:1.3.9` | `latest`  | `sha256:7cc93c03309563971d745b28736226cb784c352afdbe217bcb5d2b34c6a6b37d` |
| arm64 | `ghcr.io/conceptkernel/ck-lib-js:1.3.9` | `latest`  | `sha256:c1b56a8260b8e897eb93dae43dddce60597b7fc533f8d354f2549177ff9642c3` |

### Artifact properties

|                       |                                                                              |
|-----------------------|------------------------------------------------------------------------------|
| Artifact type         | OCI image index (multi-arch); `org.opencontainers.image.designation=ckp:static` |
| Index digest          | `sha256:94fc5d738f8c656071937ee1d865d79d959b0eff65a80d8f3e8ff0cad4b9c8c8`                                                                  |
| Designation           | `ckp:static`                                                                |

## GitHub provenance (SLSA Build Provenance v1)

|                       |                                                                              |
|-----------------------|------------------------------------------------------------------------------|
| Workflow run          | https://github.com/ConceptKernel/CK.Lib.Js/actions/runs/26595692316              |
| Built from commit     | [`dacf8df86c197045168c1fd81f819cf06fa01cd3`](https://github.com/ConceptKernel/CK.Lib.Js/commit/dacf8df86c197045168c1fd81f819cf06fa01cd3)       |
| Tag                   | [v1.3.9](https://github.com/ConceptKernel/CK.Lib.Js/releases/tag/v1.3.9)     |
| Attestation generator | [`actions/attest-build-provenance@v1`](https://github.com/actions/attest-build-provenance) (Sigstore-backed) |
| Verify locally        | `gh attestation verify oci://ghcr.io/conceptkernel/ck-lib-js:1.3.9 --repo ConceptKernel/CK.Lib.Js` |

## Use as static layer

In your `bundle.yaml` (per SPEC.OCI.BUNDLE.v0.2):

```yaml
spec_version: 0.2
static_web:
  - source_image: ghcr.io/conceptkernel/ck-lib-js:1.3.9
    route: /cklib
```

Browser consumption (after the bundle is mounted at `/cklib/`):

```html
<script type="module">
  import { CKPage } from '/cklib/ck-page.js';
  await CKPage.init();
</script>
```

See [`README.md`](./README.md) for the full ESM export surface, [`CHANGELOG.md`](./CHANGELOG.md) for release notes, [`COMPLIANCE.md`](./COMPLIANCE.md) for the v3.8 transport contract, [`PROVENANCE.md`](./PROVENANCE.md) for the release policy.
