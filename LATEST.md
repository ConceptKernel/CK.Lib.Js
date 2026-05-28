# CK.Lib.Js — Latest Release

| | |
|---|---|
| **Version** | `1.3.0` |
| **Pull URI** | `ghcr.io/conceptkernel/ck-lib-js:1.3.0` |
| **Also tagged** | `latest` |
| **Index digest** | `sha256:23fe41f74e26b6735e4e94074963133bb36f122aa1adbb906b2c8009afe5c092` |
| **Created (UTC)** | 2026-05-28 03:46:54 |
| **Size** | ~220 KB |
| **Platforms** | linux/amd64, linux/arm64 |
| **GHCR view** | https://github.com/conceptkernel/ck-lib-js/pkgs/container/ck-lib-js |
| **Repo packages view** | https://github.com/ConceptKernel/CK.Lib.Js/pkgs/container/ck-lib-js |

## Pull

```bash
docker pull ghcr.io/conceptkernel/ck-lib-js:1.3.0
```

Anonymous public pull — no GHCR auth required.

## Use as static layer (per SPEC.OCI.BUNDLE.v0.2)

In your `bundle.yaml`:

```yaml
spec_version: 0.2
static_web:
  - source_image: ghcr.io/conceptkernel/ck-lib-js:1.3.0
    route: /cklib
```

Files land at root of the image — your generated Dockerfile uses spec-standard `COPY --from=cklib_source / dest/`.

## Browser consumption

After the bundle is mounted at `/cklib/`:

```html
<script type="module">
  import { CKPage } from '/cklib/ck-page.js';
  await CKPage.init();
</script>
```

See `README.md` for the full ESM export surface, `CHANGELOG.md` for what shipped in this version, `COMPLIANCE.md` for the v3.8 transport contract.
