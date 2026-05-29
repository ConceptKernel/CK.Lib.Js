# Changelog

All notable changes to CK.Lib.Js are documented here.

## [1.3.11] — 2026-05-29

### Changed
- Aligned to [`SPEC.OCI.BUNDLE.v0.3`](https://github.com/sporaxis-com/oci-germination/blob/main/SPEC.OCI.BUNDLE.v0.3.md) — supersedes v0.2 as the authoritative packaging protocol for the fleet. CK.Lib.Js is recognized under v0.3 as a **Shape A (filesystem-layer OCI image)** artifact (§1.1) — already the shape we shipped from `FROM scratch` since v1.2.0, no Dockerfile restructure required.
- `Dockerfile` adds `LABEL org.opencontainers.image.licenses=MIT` per v0.3 §2.1 (Recommended manifest labels for Shape A).
- `.github/workflows/oci-publish.yml` build step now injects `org.opencontainers.image.revision` (git SHA), `org.opencontainers.image.created` (commit timestamp), and `org.opencontainers.image.licenses` labels per v0.3 §2.1 Required + Recommended set.
- `LATEST.md` render template (in `oci-publish.yml`) updated: spec link points to `SPEC.OCI.BUNDLE.v0.3.md`; bundle.yaml example bumped to `spec_version: 0.3` and now shows BOTH the v0.2-compatible `static_web[]` form AND the new v0.3 `layer_sources[]` form, each with the required `attestation_repo: ConceptKernel/CK.Lib.Js` field per v0.3 §3.2 / §3.4; an explicit reference to the v0.3 §4 build-time `gh attestation verify` gate added.
- `COMPLIANCE.md` reference updated from `SPEC.OCI.BUNDLE.v0.1.md` to `SPEC.OCI.BUNDLE.v0.3.md` with explicit Shape A designation note.

### Compatibility
- No wire-format change. The pulled image is byte-for-byte identical in shape and content to v1.3.10 (apart from the added OCI labels and the version string). Existing `static_web:` declarations in downstream `bundle.yaml` files continue to render correctly under v0.3 generators (§10 backwards compatibility).
- Downstream consumers (`oci-germination`'s `bundle-ck-allinone`, `bundle-pg17-pgrdf-pgck-web-cklib`, `bundle-pg17-pgrdf-pgck-static-cklib`) MAY bump their `spec_version: 0.2` → `0.3` and add `attestation_repo: ConceptKernel/CK.Lib.Js` to the CK.Lib.Js entry to opt into v0.3's pre-build attestation gate. Bumping is non-blocking.

---

## [1.3.10] — 2026-05-28

### Changed
- `LATEST.md` template (rendered by `oci-publish.yml`) rewritten to match pgRDF's `LATEST.md` structure: introduces per-arch table with Created (UTC) column, consolidated properties table (artifact type / aggregate index / aggregate digest / provenance / verify CLI / release notes / repo packages view), "Verifying any artifact above" section with both multi-arch and per-arch leaf verify commands + explanation of what successful verify means, "Pin policy" section.
- No code or runtime change.

---

## [1.3.9] — 2026-05-28

### Pipeline iteration #9 — collapsed pipeline (one workflow, end-to-end)
- v1.3.8 confirmed GHA build + push + SLSA attestation works; `gh attestation verify` accepts the v1.3.8 digest. However the chained `workflow_run` event from `oci-publish` → `update-latest-md` was blackholed (no run created), so LATEST.md was not auto-updated.
- v1.3.9 collapses everything into a single workflow `oci-publish.yml`: build → push → attest → `gh attestation verify` (Rule 2 gate) → render LATEST.md → `gh release create` → commit LATEST.md to main. No chained workflow event needed.
- `update-latest-md.yml` deleted.
- `PROVENANCE.md` Rule 3 amended to permit any workflow that gates on attestation in the same job (instead of naming a specific separate workflow). Single-workflow setup is the canonical path for this repo.

---

## [1.3.8] — 2026-05-28

### Adopted PROVENANCE.md release policy
- New file `PROVENANCE.md` adapted from pgCK's pattern: 5 hard rules (GHA-only builds, LATEST.md attestation gate, workflow-only LATEST.md writes, previous-tag-in-LATEST gate, release-often discipline) + bootstrap table + enforcement matrix + verify recipe.
- `LATEST.md` rewritten to state "no attested release yet" per Rule 2; will be auto-populated by `update-latest-md.yml` after the first attested release.

### Pipeline wiring
- `oci-publish.yml` adds `actions/attest-build-provenance@v1` step → issues SLSA Build Provenance v1 attestation, signed by GitHub's Fulcio CA, recorded in Sigstore Rekor, pushed as OCI referrer. Requires new permissions: `id-token: write`, `attestations: write`.
- New workflow `update-latest-md.yml` — the only allowed writer of `LATEST.md` per PROVENANCE Rule 3. Triggered by `workflow_run` of `oci-publish` on success. Verifies attestation via `gh attestation verify`; if accepted, renders and commits `LATEST.md` with version + per-arch digests + run URL + verify command.

### Pipeline iteration #8
- v1.3.4 → v1.3.7 attempts: tag-push events silently dropped (no GHA runs created) whenever the workflow included an in-pipeline `gh release create` step. v1.3.8 removes the release-create step (will be added via a separate workflow later if Rule 3 needs it) and adds the attestation step which is the higher-priority provenance contract.
- Expected outcome: tag v1.3.8 push → `oci-publish` runs → builds + pushes + attests → `update-latest-md` fires on completion → verifies + writes LATEST.md.

---

## [1.3.7] — 2026-05-28

### Pipeline iteration #7
- v1.3.6 used `publish.yml` — but GitHub recycled the OLD workflow_id `256288279` (from the original Apr 4 publish.yml). Recycled-id may carry stale routing state. Tag-push event still silently dropped.
- v1.3.7: workflow renamed to `oci-publish.yml` — a filename that has NEVER existed in this repo's history. Expected to receive a brand-new workflow_id from GitHub and a fresh event-routing registration.

---

## [1.3.6] — 2026-05-28

### Pipeline iteration #6
- v1.3.5 (no workflow edit) also didn't trigger — busts the "edit-breaks-routing" hypothesis.
- v1.3.6: rename workflow `release-pipeline.yml` → `publish.yml` (fresh filename = new workflow_id = fresh GitHub registration) AND remove the `concurrency:` block (possible source of event dedupe). Workflow content otherwise unchanged from v1.3.4 (build+push+in-pipeline-release-create).

---

## [1.3.5] — 2026-05-28

### Pipeline iteration #5
- v1.3.4 attempt: workflow file edit (added in-pipeline `gh release create` step) appears to have broken the tag-event routing — tag push to `v1.3.4` did not generate any GHA run (only branch-push from main commit, filtered).
- Hypothesis: GitHub's workflow registration goes into a temporarily-broken state immediately after a workflow file edit. v1.3.3 worked because the workflow had just been created in a fresh state; v1.3.4 broke because the edit triggered re-parsing.
- v1.3.5 tests the hypothesis: **no workflow file change**. Only version files bumped. If the v1.3.5 tag triggers the workflow (which still has the in-pipeline release-create step from v1.3.4), the hypothesis is confirmed AND the release-create step gets exercised.

---

## [1.3.4] — 2026-05-28

### Pipeline iteration #4
- v1.3.3 confirmed end-to-end GHA build+push works (run #26591475079, 24s, success). However the v1.3.3 GitHub Release object was created manually via `gh release create` from local CLI — a violation of the rule that ALL release operations happen inside GHA.
- v1.3.4 adds a `gh release create` step to `release-pipeline.yml` so the Release object is created by the workflow itself with a clean bare-tag title (`v1.3.4`, no decorations) and notes that include the run URL, commit SHA, and index digest as built-in provenance.
- The v1.3.3 release was deleted; the v1.3.3 tag and image remain on GHCR as the historical record of the first GHA-built image.

---

## [1.3.3] — 2026-05-28

### Pipeline iteration #3
- v1.3.2 attempt #2 progress: workflow file `release-pipeline.yml` correctly registered, tag-event routed (19s run on `v1.3.2`), multi-platform build succeeded. **But** the push step failed with `denied: permission_denied: write_package` — the GHCR package `ck-lib-js` had no Actions-access grant for the workflow.
- **Fix between v1.3.2 and v1.3.3:** maintainer added `CK.Lib.Js` repo with `Write` role under https://github.com/orgs/ConceptKernel/packages/container/ck-lib-js/settings → "Manage Actions access".
- v1.3.3 retests the full pipeline with the same workflow that built successfully in v1.3.2. Expected: GHA pushes `ck-lib-js:1.3.3` + `:latest` to GHCR with attached build provenance attestation, satisfying the LATEST.md GitHub-provenance requirement.

---

## [1.3.2] — 2026-05-28

### Pipeline iteration #2
- v1.3.1 attempt #1 failed: `release: published` event also blackholed (only branch-push events fire workflows in this repo).
- v1.3.2 attempt #2: fresh workflow filename `release-pipeline.yml` (deletes `gha-build-and-push.yml`), single trigger `push: tags: ["v*"]`, `concurrency: group: release-${{ github.ref }}` to break any potential stuck lock, no `if:` guard, minimal job surface.
- No source-code change.

---

## [1.3.1] — 2026-05-28

### Changed
- **Pipeline-only bump** — no source-code change. v1.3.1 exists solely to iterate the GitHub Actions release pipeline (the v1.3.0 tag did not pair with a GHA-built artifact due to a tag-push event routing issue; v1.3.1 attempts the `release: published` event as a different trigger bus).

### Pipeline iteration #1
- Workflow `.github/workflows/gha-build-and-push.yml` now responds to three event types:
  - `release: types: [published]` (primary — different event bus, may bypass cached routing)
  - `push: tags: ["v*"]` (kept as fallback)
  - `workflow_dispatch` (kept for manual)
- `Resolve version` step handles all three event sources.
- `Create GitHub Release` step suppressed when triggered by `release: published` (release already exists in that path).

---

## [1.3.0] — 2026-05-28

### Added — Long-Form Subject Support (v3.8 Canonical)
- **Dual-subscribe** on `result.<K>` (short) AND `result.kernel.<K>.action.>` (long, v3.8 canonical)
- **Dual-subscribe** on `event.<K>` (short) AND `event.kernel.<K>.>` (long)
- **Dual-publish** on `input.<K>` (short) AND `input.kernel.<K>.action.<verb>` (long, when `data.action` is present)
- Short-form subjects marked **deprecated**; will be removed in v2.0

### Added — Display / Broadcast / Observer Roles
- **`subscribe:` constructor option** — opt out of `result` channel for broadcast-only roles (e.g. `subscribe: ['event']`). Default `['event','result']` preserves v1.2 behavior.
- **`extraSubjects:` constructor option** — subscribe to non-kernel-derived subjects (e.g. `broadcast.<project>.<channel>`, `event.CK.Compliance.violation`). Emits via `ck.on('broadcast', ...)`.
- **`topicDefs:` constructor option** — advanced callers can override the kernel-derived topic list entirely.

### Added — Binary Wire Profile (Codec-Transparent)
- **MessagePack codec support** for `event.kernel.*` and `stream.kernel.*` messages
- Codec selection via `Content-Encoding: msgpack` header (JSON when absent)
- `ck.on('event', handler)` signature unchanged across codec swap; `msg.data` always exposes decoded payload
- MessagePack loaded from `https://esm.sh/@msgpack/msgpack@3.0.0` (same CDN pattern as nats.ws)

### Added — Per-Subject Deduplication
- Reads `Ck-Seq` header on incoming messages, dedups against per-subject `Set<seq>`
- Cap of 1000 entries per subject; LRU-style eviction at threshold
- Graceful degrade: if `Ck-Seq` header is absent, no dedup (v1.2-compatible behavior)
- `seq` source is publisher-assigned (per pgCK §C lock: `ckp.ledger.id`); browser doesn't generate

### Added — IRI Dictionary (Per-Project) Auto-Sync
- Auto-subscribes to `event.kernel.Dictionary.v_bumped` + `.snapshot` when `kernel:` is set
- Maintains internal `handles` ↔ `reverse` map (int → IRI both directions)
- `dictVersion: <N>` constructor option (default 0); embedded in NATS CONNECT `name` field for server-side snapshot delivery
- New public API: `ck.handleForIri(iri)` / `ck.iriForHandle(handle)` / `ck.dictVersion`
- Dictionary messages do NOT emit on `'event'` channel — internal infrastructure

### Added — Per-Kernel Error Broadcast
- Auto-subscribes to `event.kernel.<K>.error` when `kernel:` is set
- Emits via `ck.on('error', handler)` (existing channel; new traffic source)

### Changed — Reconnect on Auth Upgrade
- `ck.login(user, pass)` now closes NATS and reconnects with JWT in CONNECT options (was: in-place token update)
- `ck.logout()` reconnects as anonymous (drops authenticated permissions cleanly)
- Token refresh (`_maybeRefreshToken`) also reconnects to refresh server-side permission ACLs
- Locked per pgCK §G.3 + §15 (consistent reconnect strategy across all auth state changes)

### Changed — Default `clientId`
- Default client_id changed from `ck-web` to `ck-browser` (per pgCK §11 confirmation)
- Override via `clientId:` constructor option (e.g., per-tenant in marketplace SKU)

### Changed — README Subject Family Table
- Long-form subjects now documented as canonical
- Short-form aliases explicitly marked deprecated with v2.0 removal target
- Added v1.3 additions: `event.kernel.<K>.error`, `event.kernel.Dictionary.*`, `event.CK.Compliance.violation`

### Compatibility
- **No breaking changes from v1.2.x.** All existing CKClient code continues to work.
- v1.2.x callers that subscribed only to short-form subjects continue to receive events.
- Dictionary + binary paths activate transparently when pgCK starts publishing the relevant messages (pgCK v0.2 dependency).

### Coordination
- v1.3.0 design surface fully locked via three-turn NOTIFY exchange with pgCK (see internal `_WIP/NOTIFIES.pgCK.v1.3.0.transport-binary-identity-alignment*` files).
- Per pgCK §F: requires pgCK v0.2 for `ckp.dictionary` table + `ckp.ledger.id` → wire-seq plumbing. CKClient v1.3.0 ships with graceful JSON fallback when those server-side pieces aren't yet shipped.

---

## [1.2.1] — 2026-05-28

### Fixed
- **OCI Bundle Layout** — Files now land at image root (`/ck-client.js`, `/index.html`, `/vendor/`) instead of nested under `/ck-lib-js/`. Consumers using the spec-standard `COPY --from=cklib_source / dest/` pattern get the expected layout without manual path adjustments. Resolves runtime 404s in oci-germination composites (`bundle-ck-allinone`, `bundle-pg17-pgrdf-pgck-web-cklib`) where `/cklib/ck-client.js` was resolving to a missing path.

### Removed
- **Dead-Weight `node_modules/`** — `npm install --production` step removed from Dockerfile. The published bundle no longer ships `node_modules/{nats.ws,nkeys.js,tweetnacl}/`. `ck-client.js:31` loads `nats.ws` from `https://esm.sh/nats.ws@1.30.3` at runtime; bundling these modules was unused weight.
- **`package.json` / `package-lock.json`** — No longer copied into the OCI bundle. They remain in the source repo for npm package metadata, but are not part of the static artifact.
- **`builder` stage** — Dockerfile is now a single `FROM scratch` with direct `COPY` of source files. No multi-stage build needed.

### Changed
- **Bundle Size** — Reduced from 2.07 MB to ~80 KB (96% smaller).

### Migration Note for Consumers
If you were using the v1.2.0 workaround `COPY --from=cklib_source /ck-lib-js/ dest/`, switch back to the spec-standard root copy:
```diff
- COPY --from=cklib_source /ck-lib-js/ /app/cklib/
+ COPY --from=cklib_source / /app/cklib/
```
Pin `bundle.yaml` `source_image:` to `ghcr.io/conceptkernel/ck-lib-js:1.2.1`.

---

## [1.2.0] — 2026-05-26

### Added
- **OCI Bundle Release** — Static artifact published to GHCR (`ghcr.io/conceptkernel/ck-lib-js:1.2.0`)
- **Multi-Platform Support** — Images built for linux/amd64 and linux/arm64
- **GitHub Actions Automation** — Workflow-dispatch-based release pipeline via `workflow_dispatch` inputs
- **Sporaxis Compliance** — Bundle adheres to SPEC.OCI.BUNDLE.v0.1; static-only (ckp:static designation)

### Changed
- **Removed Dev Target** — Eliminated 145MB http-server variant; bundle is now 2.07MB static artifact only
- **Simplified Dockerfile** — Single `FROM scratch` target for folder mounting (no Node runtime in bundle)

### Fixed
- **Multi-Platform Manifest** — Corrected per-architecture digest handling (amd64 and arm64 now properly differentiated)
- **Public Access** — Bundle is anonymous-accessible via GHCR (no authentication required for pulls)

### Technical Details
- **Bundle Size:** 2.07MB (JS source + nats.ws deps)
- **Artifact Type:** ckp:static (mount-friendly filesystem layer)
- **Transport:** NATS WSS v2.14+ (input.kernel.* → result.kernel.* affordance pattern)
- **Compliance:** CKP v3.8 Core JSON profile (v1.1.0); binary optimization deferred to v1.3.0

---

## [1.1.0] — 2026-05-20

### Initial Release
- Core JSON message profile for NATS WSS browser client
- Affordance request/reply pattern (input.kernel.* → result.kernel.*)
- Event subscription (event.kernel.*, stream.kernel.*)
- nats.ws v1.30.3 as sole dependency

---

## Versioning Roadmap

| Version | Focus | Status |
|---------|-------|--------|
| **1.1.0** | Core JSON profile | ✓ Released |
| **1.2.0** | OCI bundle + GHCR publishing | ✓ Released |
| **1.2.1** | OCI layout fix + bundle slim-down | ✓ Released |
| **1.3.0** | Binary codec + dedup + display roles + long-form subjects | ✓ Released |
| **1.4.0** | Keycloak / JWT identity plumbing (per-tenant realm) | ⧗ Planned |
| **2.0.0** | TypeScript definitions + remove short-form subjects (no REST API, ever) | ⧗ Planned |

---

**Repository:** https://github.com/ConceptKernel/CK.Lib.Js  
**Package:** https://ghcr.io/conceptkernel/ck-lib-js  
**License:** MIT
