# Build provenance & release policy

## Hard rules

1. **All builds and all GHCR pushes run on GitHub Actions only.** Workstation `docker push`, `docker buildx --push`, `oras push`, `gh release create`, `gh release edit`, `gh release delete`, or any equivalent local-credential publish is prohibited. Local CLI is allowed only for git operations (`git commit`, `git tag`, `git push`) and read-only inspection (`gh run list`, `gh api ... GET`, `docker pull`, `docker buildx imagetools inspect`).
2. **`LATEST.md` MUST NOT carry any version that was published manually or that lacks a verifiable SLSA Build Provenance v1 attestation.** If `gh attestation verify` rejects (or has no record of) the digest in question, that digest is not "the latest" — the file stays where it was. There is no manual-edit exception, not even to seed initial state. When no attested release has been produced yet, `LATEST.md` says so plainly.
3. **`LATEST.md` is only written by a GHA workflow that has just verified attestation in the same job.** Currently that workflow is `.github/workflows/oci-publish.yml` (which builds, attests, verifies, and renders `LATEST.md` in one job). Any out-of-band write (local edit, separate non-attesting workflow) is treated as drift and will be overwritten by the next release.
4. **A new version tag MUST NOT be pushed unless the previous tag in the same series is already advertised in `LATEST.md`.** Concretely: do not tag `v1.3.10` until `v1.3.9` shows up in `LATEST.md`. This guarantees the previous release went through the attestation gate end-to-end. Tagging ahead of the gate breaks the chain and creates orphan releases the policy cannot retroactively verify.
5. **Release often, in small focused groups.** Each release pairs one or more closed items from `CHANGELOG.md` with exactly one attested OCI artifact. Pipeline-only iteration bumps (no source-code change) are explicitly fine when the goal is to exercise/repair the release pipeline itself.

Everything else in this document explains how those rules are enforced.

### One-time bootstrap (Rule 4 transition)

Rule 4 takes effect from the **first attested release** onward. Releases that predate the attestation policy on `main` do NOT appear in `LATEST.md` and never will — re-publishing them with attestations would change their digests and break the immutability promise.

Versions that predate the policy (all manually built via local `docker buildx --push`, no SLSA attestation):

| Tag | Image digest (index) | Build path | Status |
|---|---|---|---|
| `v1.0.0` | (Apr 4 publish.yml run — original) | GHA (legacy workflow) | unverifiable; predates policy |
| `v1.2.0` | `sha256:98162def…` | local `docker buildx --push` | pre-policy, not advertised |
| `v1.2.1` | `sha256:b011bfdd…` | local `docker buildx --push` | pre-policy, not advertised |
| `v1.3.0` | `sha256:23fe41f7…` | local `docker buildx --push` | pre-policy, not advertised |
| `v1.3.1` | _(no image — release object only, manually created)_ | n/a | pipeline iteration scaffolding |
| `v1.3.2` | _(no image — GHA build attempted, push permission_denied)_ | GHA (build OK, push blocked) | pipeline iteration scaffolding |
| `v1.3.3` | `sha256:78c9ef70…` | GHA build + manual release-create | GHA build attestation exists, but release object was manually created and then deleted → does NOT qualify under Rule 2 |
| `v1.3.4` – `v1.3.7` | _(no image)_ | tag-push events silently dropped | pipeline iteration scaffolding |

The **first attested release** will be the next tag where:
- A `tag: push` event delivers to the workflow
- `actions/attest-build-provenance@v1` issues a SLSA Build Provenance v1 attestation
- `gh attestation verify` succeeds for the resulting OCI digest
- `.github/workflows/update-latest-md.yml` renders `LATEST.md` to advertise it

Until that happens, `LATEST.md` states plainly: no attested release yet.

Bootstrap exception is one-time. Once the gate fires once, "previous tag must be in `LATEST.md`" is strict.

---

Every artifact this repo publishes — the OCI static bundle on GHCR and the corresponding GitHub Release — is built and pushed **exclusively** by GitHub Actions. Workstation pushes are not permitted.

## What's enforced

| Surface | Build / push performed by | Provenance |
|---|---|---|
| `ghcr.io/conceptkernel/ck-lib-js:<ver>` (multi-arch OCI static bundle) | `oci-publish` workflow on `v*` tag push | [SLSA Build Provenance v1](https://slsa.dev/spec/v1.0/provenance) via [`actions/attest-build-provenance@v1`](https://github.com/actions/attest-build-provenance), pushed as an OCI referrer |
| `ghcr.io/conceptkernel/ck-lib-js:latest` (rolling alias) | Same workflow, same run | Same attestation as the versioned tag pushed in the same run |
| `https://github.com/ConceptKernel/CK.Lib.Js/releases/tag/v<ver>` (Release object + notes) | Same workflow's final step | Notes embed the workflow run URL + commit SHA + index digest; Release object is `created_by: github-actions[bot]` |
| `LATEST.md` at repo root | `update-latest-md` workflow on successful `workflow_run` of the above | Refuses to advance unless `gh attestation verify` accepts every digest it's about to publish |

If `gh attestation verify` rejects an artifact, `LATEST.md` stays where it was. That's how a workstation push (or any non-GHA build) gets caught — it cannot produce a valid GitHub-issued OIDC attestation.

## Verifying a release locally

```sh
# Multi-arch index
gh attestation verify oci://ghcr.io/conceptkernel/ck-lib-js:1.3.X \
  --repo ConceptKernel/CK.Lib.Js

# Per-architecture (if you pinned to an arch digest)
gh attestation verify oci://ghcr.io/conceptkernel/ck-lib-js@sha256:<amd64-digest> \
  --repo ConceptKernel/CK.Lib.Js
```

A successful verify means:

- Signed by GitHub's Fulcio CA against the OIDC token of a specific workflow run
- That workflow run is in `ConceptKernel/CK.Lib.Js`
- The signature is recorded in Sigstore's Rekor transparency log
- The subject digest matches the artifact you pulled

`gh attestation verify` requires `gh` 2.49+.

## Cutting a release (the only allowed flow)

1. Bump versions in:
   - `package.json::version`
   - `Dockerfile::LABEL org.opencontainers.image.version` (and the comment header)
   - `CHANGELOG.md` — add a new top entry
2. Commit the bumps with a `release: v<new>` message.
3. Tag: `git tag v<new>` (bare semver only — no project prefix, no decorations; see `memory/feedback_release_name_clean.md`).
4. Push the tag: `git push origin v<new>`.

GitHub Actions takes over:
- `oci-publish` workflow builds + pushes multi-arch image + creates Release object with attestation
- `update-latest-md` workflow verifies attestation and renders `LATEST.md`

There is no step in this flow that requires local `docker push`, `gh release create`, or any non-git local credential. If you find yourself reaching for any of those: stop, push the tag, let CI do its job.

## Pipeline iteration (when CI is broken)

When GitHub Actions fails to fire / build / push for a given tag, do NOT fall back to manual operations. Instead:

1. Diagnose what failed (workflow not triggered, build error, push permission, etc.)
2. Make a targeted fix in the workflow file or related config
3. Bump the patch version (e.g., `v1.3.7 → v1.3.8`) — each pipeline iteration gets its own version so the audit trail shows what was tried
4. Commit, tag, push
5. Either the iteration succeeds (pipeline restored) or it fails (try the next fix in the next iteration)
6. Failed iterations leave their tag in git history but contribute no entry to `LATEST.md` (because they produced no attested artifact)

This iteration discipline is normative — see `memory/feedback_tag_must_pair_with_built_package.md`.

## Hooks against accidental local pushes

- `.github/workflows/` is the only path that may run `docker buildx --push` or `gh release create`
- The former local build/smoke helper scripts were **retired (v1.4.1)** from the tracked tree: one ran a workstation `docker buildx --push`, which **violated Rule 1** — removing it eliminates the bypass. All builds/pushes run only via `.github/workflows/oci-publish.yml`.
- The repo's `.gitignore` excludes local working/coordination folders so they don't leak into history
- If you find yourself typing `docker push ghcr.io/conceptkernel/...` or `gh release create v...` from your shell, stop. Push the tag instead.

## Cross-repo coordination & public-repo disclosure

Coordination between this library and its neighbouring repositories (the substrate, the all-in-one
bundle, downstream consumers) happens **on GitHub** — **issues and pull requests for concrete
defects**, and a **per-repo project board for forward plans and feature tracks**. Any earlier
file-based coordination notes are a **local drafting step only**; the published, authoritative
record lives in GitHub.

**These repositories are public.** Everything written into an issue, a pull request, a project
card, a commit message, or any tracked file is world-readable and permanent. Before posting,
sanitise:

- **No local/workstation paths** — home directories, absolute working paths, scratch/working folders.
- **No infrastructure or operator identifiers** — host/cluster/fleet names, internal endpoints,
  or account handles tied to private infrastructure.
- **No unreleased internal specifications** — design notes and specs that have not been
  deliberately published. Reference behaviour by its **public surface** (verb, version, OCI digest),
  not by an internal document name or contents.
- **No secrets** — tokens, credentials, or digests still in flight.

Draft with full detail privately; post a **public-safe summary** that a stranger reading the repo
should be able to see without learning anything about private infrastructure. When in doubt, leave
it out and ask.

## Audit trail

- Workflow source: `.github/workflows/oci-publish.yml` (single workflow does build + push + attest + verify + GitHub Release + LATEST.md write, in that order, all gated on attestation success)
- Attestation generator: `actions/attest-build-provenance@v1` (Sigstore-backed)
- Verifier: `gh attestation verify` (built into `gh` 2.49+)
- LATEST.md renderer: lives inside `update-latest-md.yml`; queries the package versions API + verifies attestations before any write
- Release policy memory (dev-bot): `memory/feedback_tag_must_pair_with_built_package.md` + `memory/feedback_release_name_clean.md`
