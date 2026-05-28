# CK.Lib.Js — latest attested release

**Status: NO ATTESTED RELEASE YET.**

Per [`PROVENANCE.md`](./PROVENANCE.md) Rule 2, `LATEST.md` MUST NOT carry any version that was published manually or that lacks a verifiable SLSA Build Provenance v1 attestation. Per Rule 3, this file is only written by `.github/workflows/update-latest-md.yml` after `gh attestation verify` accepts the artifact.

No release on this repo has yet completed the attested-build path (GitHub Actions → `actions/attest-build-provenance@v1` → `gh attestation verify` → renderer). This file will be auto-populated when the first attested release lands.

## What exists on GHCR right now (pre-policy, NOT advertised here)

The following images are on GHCR but pre-date the provenance policy and are not pointed to by this file:

- `ghcr.io/conceptkernel/ck-lib-js:1.3.3` — last image built by GitHub Actions (run [#26591475079](https://github.com/ConceptKernel/CK.Lib.Js/actions/runs/26591475079)); however the corresponding GitHub Release object was created manually and then deleted, so the release-side of the chain is incomplete and Rule 2 disqualifies it.
- `ghcr.io/conceptkernel/ck-lib-js:1.3.0`, `:1.2.1`, `:1.2.0` — all built via local `docker buildx --push` (no GHA attestation).

See [`PROVENANCE.md` §Bootstrap](./PROVENANCE.md#one-time-bootstrap-rule-4-transition) for the full pre-policy table.

## Next steps

The pipeline is being iterated to produce the first fully-attested release (see [`CHANGELOG.md`](./CHANGELOG.md) iteration entries). When that lands:

- `update-latest-md.yml` will rewrite this file with the version, multi-arch digests, build run URL, attestation verify command, and pull instructions.
- Rule 4 then applies: subsequent tags cannot be pushed until this file lists the previous tag.

## See also

- [`PROVENANCE.md`](./PROVENANCE.md) — full release policy, enforcement, verify recipe
- [`CHANGELOG.md`](./CHANGELOG.md) — per-version notes including pipeline iteration history
- [`COMPLIANCE.md`](./COMPLIANCE.md) — runtime / transport contract
- [`README.md`](./README.md) — library overview and ESM exports
- [Repo packages](https://github.com/ConceptKernel/CK.Lib.Js/pkgs/container/ck-lib-js) — full GHCR version history (most pre-policy)
