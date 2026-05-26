# SPEC.CK.LIB.JS.PUBLIC.v1.0
## CK.Lib.Js Reconciliation & Public Reopening

**Version:** 1.0  
**Status:** Draft  
**Date:** 2026-05-26  
**Author:** Peter Styk (peter@conceptkernel.org)  
**Scope:** CK.Lib.Js kernel transition from private/forked development back to public GitHub  

---

## 1. Context & Motivation

### 1.1 Background

CK.Lib.Js was originally released as v1.0.0 on the public GitHub repo (`git@github.com:ConceptKernel/CK.Lib.Js.git`) but subsequently moved to private development. During the private phase:

- **Public repo** remained at 3 commits (latest: "Add package.json + npm publish workflow")
- **Internal fork** (git.int.tech.games) advanced to 5 commits, adding CKP integration work:
  - Python processor stub for kernel dispatch compatibility
  - .gitignore for build artifacts
  - TOOL organ consolidation fixes
  - Console UI cleanup (moved to CK.Web.Console kernel)

### 1.2 Goal

Reconcile the fork with the public repo and reopen CK.Lib.Js as an actively maintained public artifact, ensuring:

- **CKP v3.8-final-ready** JavaScript client library (production alignment)
- Clean CI/CD publishing to npmjs (via existing workflow)
- Runtime requirements explicit: Envoy Gateway + NATS WSS (micro bundle pattern)
- Documented change history and PR trail
- No disruption to existing consumers

### 1.3 CKP v3.8 Alignment

CK.Lib.Js v1.1.0 is released concurrently with **CKP v3.8 final production**. This version declares:

- **Minimum CKP version:** v3.8-final (not v3.7.6, not v3.5)
- **Runtime dependencies:** Envoy Gateway (HTTP routing) + NATS WSS (message bus)
- **Client profile:** Browser-based kernel agent (kernel dispatch + event subscription)
- **Deployment model:** Single-page application on Envoy-managed virtual host

---

## 2. Current State Analysis

### 2.1 Public Repo Status

**Location:** `git@github.com:ConceptKernel/CK.Lib.Js.git`  
**Branch:** main  
**HEAD:** 3b53483 (describe: `v1.0.0-0-g3b53483`)  
**Latest tag:** v1.0.0 (annotated, matches HEAD exactly)  
**Registry:** npmjs (via GitHub Actions workflow)  
**Contents:**
- 15 core JS client modules (ck-*.js)
- vendor/ anime.esm.min.js
- package.json with npm metadata (v1.0.0)
- No .gitignore (will be added via reconciliation)
- No processor.py (will be added via reconciliation)

### 2.2 Internal Fork Status

**Location:** git.int.tech.games/CK.Lib.Js/tool.git  
**Pinned at:** /Users/neoxr/.config/conceptkernel/ck/CK.Lib.Js/06963841eb74/tool  
**HEAD:** 0696384 (describe: `v0.1-4-g0696384`)  
**Latest tag:** v0.1 (4 commits after, version drift from public v1.0.0)  
**Commits ahead:** 2 feature + 3 chore (5 total vs public 3)  
**Contents:**
- All 15 core JS modules (byte-identical to public)
- processor.py (CKP dispatch stub, ~30 lines)
- .gitignore (Python artifacts)
- **Removed:** console.{html,js,css} (intentionally moved to CK.Web.Console)

### 2.3 Diff Summary

```
Public: v1.0.0-0-g3b53483 (released to npmjs)
Fork:   v0.1-4-g0696384 (internal development)

Public commits (v1.0.0 baseline):
  3b53483  Add package.json + npm publish workflow  (HEAD, tagged v1.0.0)
  6dc53c0  TODO: 5 items + 8 test cases for alpha-9
  9eea426  CK.Lib.Js v1.0.0 — CKP JavaScript client library

Fork development (built on shared ancestor 9eea426):
  ef07d64  feat: TOOL organ for CK.Lib.Js
  7197c3b  fix: restore missing TOOL files
  39d5d4b  chore: gitignore __pycache__
  00913f0  feat: minimal KernelProcessor stub for dispatch compatibility
  0696384  trim: drop tool/console.{html,js,css} — surface moved to CK.Web.Console kernel
```

**Version note:** Public is v1.0.0 (released); fork is v0.1 (not released). Reconciliation bumps to v1.1.0 (patch with new features).

### 2.4 Key Artifacts

| Artifact | Public | Fork | Status |
|----------|--------|------|--------|
| ck-*.js (15 files) | ✓ | ✓ | Identical |
| package.json | ✓ | ✓ | Identical |
| vendor/anime.esm.min.js | ✓ | ✓ | Identical |
| processor.py | ✗ | ✓ | **New** |
| .gitignore | ✗ | ✓ | **New** |
| console.{html,js,css} | ✓ | ✗ | **Intentional removal** |

---

## 3. Investigation Checklist

Before reconciliation, verify:

### 3.1 Fork Commit History

- [ ] Review each fork commit message for intent and correctness
- [ ] Confirm `0696384 trim: ...console` is intentional (moved to CK.Web.Console kernel)
- [ ] Verify processor.py is production-ready (minimal stub vs full impl)
- [ ] Confirm .gitignore entries are complete and necessary

### 3.2 Public Repo State

- [ ] Verify package.json describes v1.0.0 correctly
- [ ] Check GitHub Actions npm publish workflow is active
- [ ] Confirm main branch is current with no uncommitted changes
- [ ] Review existing GitHub issues/PRs for context on the pivot

### 3.3 Downstream Impact

- [ ] Search for public consumers of CK.Lib.Js (npmjs package page, GitHub references)
- [ ] Identify any v1.0.0 release notes or documentation
- [ ] Check for any breaking changes between fork and public (there shouldn't be)

### 3.4 CKP Integration

- [ ] Verify processor.py imports correctly (cklib availability)
- [ ] Confirm dispatch handlers match ontology (ontology.yaml)
- [ ] Check for data/ organ structure (llm/, instances/, etc.)
- [ ] Verify LOCKS contract compliance (v3.7.6)

### 3.5 Storage Layout

- [ ] Confirm master worktree exists at ~/.config/conceptkernel/ck/CK.Lib.Js/master/tool/
- [ ] Verify bare repo at ~/.config/conceptkernel/ck-bare/CK.Lib.Js/tool.git/
- [ ] Check lock compliance (branch should be named per v3.7.6 spec)

---

## 4. Reconciliation Strategy

### 4.1 Approach: "Fork-first forward"

We adopt the fork as canonical and advance public repo to match, since:

- Fork has tested CKP integration (processor.py)
- Fork has .gitignore (necessary for Python)
- Fork's console removal is intentional decomposition (not loss)
- Public HEAD (3b53483) has npm workflow but no CKP depth

**NOT** bringing back console.{html,js,css} — those are intentionally moved to CK.Web.Console kernel.

### 4.2 Phase 1: Direct cherry-pick (Low-risk)

Create feature branch from public main:

```bash
git checkout main
git pull origin main
git checkout -b feature/ckp-integration-and-cleanup
```

Bring in fork commits in order:

```bash
git cherry-pick ef07d64  # TOOL organ
git cherry-pick 7197c3b  # restore missing TOOL files
git cherry-pick 39d5d4b  # gitignore
git cherry-pick 00913f0  # processor.py
# DO NOT cherry-pick 0696384 (console removal — already documented in commit history)
```

**Outcome:** public main + fork work, minus the console removal (which we'll document separately).

### 4.3 Phase 2: Explicit console removal commit

If we want to align fully with fork's cleanup decision, add a new commit documenting the intent:

```bash
git rm ck-console.{html,js,css}  # if they exist
git commit -m "refactor: relocate console UI to CK.Web.Console kernel

- ck-console.html, ck-console.js, ck-console.css moved to CK.Web.Console (v0.1+)
- CK.Lib.Js now focuses on client/runtime/registry/processor dispatch
- Resolves cross-kernel UI dependency"
```

OR skip this entirely and document the removal in release notes (§ 5.2 Public Plan).

### 4.4 Verification Before Push

Before pushing to public:

```bash
npm install && npm test              # (if tests exist)
node -c ck-*.js                      # syntax check all modules
python3 processor.py --help          # (if processor has CLI)
ck verify CK.Lib.Js                  # CKP compliance check
```

### 4.5 Timeline

| Phase | Task | Owner | ETA |
|-------|------|-------|-----|
| 1 | Investigation checklist (§ 3) | Claude Code | Today |
| 2 | Create feature branch + cherry-pick | Claude Code | Today |
| 3 | Verify & test | Claude Code | Today |
| 4 | Create PR (public on GitHub) | User review | +1d |
| 5 | Review & merge | Peter Styk | +2-3d |
| 6 | Tag v1.1.0 (CKP integration) | User | +1d post-merge |
| 7 | npm publish (CI/CD) | GitHub Actions | +5m post-tag |

---

## 5. Runtime Requirements (CKP v3.8 Production)

### 5.0 NATS WSS Transport & pgCK Governance

CK.Lib.Js v1.1.0 requires:

**Transport Layer:**
- Native NATS server v2.14+ with WebSocket Secure (WSS) listener
- No embedded NATS in the kernel itself; NATS is a separate transport service
- TLS-encrypted WSS endpoint (required, not optional)

**Governance Layer:**
- pgCK router/executor subscribes to fixed subject families
- SQL-first validation: affordance resolution, SHACL validation, governed accept/reject
- Core JSON profile for inbound/outbound (binary optimization deferred to v1.2+)

**Subject Families (v3.8 normative):**
- `input.*` — inbound kernel actions (browser → pgCK)
- `result.*` — action outcomes (pgCK → browser)
- `event.*` — state change notifications (pgCK → browser)
- `stream.*` — optional high-frequency observer feeds
- `session.*` — optional session state (future)

#### 5.0.1 NATS WSS Configuration

**Requirement:** Native NATS server with WSS listener enabled

```yaml
# Local dev setup (compose.nats-wss.yml pattern)
nats-server:
  image: nats:2.14.1-scratch
  ports:
    - "4222:4222"    # TCP (internal/worker use)
    - "8443:8443"    # WSS (browser clients)
    - "8222:8222"    # HTTP monitoring
  environment:
    - TLS_CERT=/etc/nats/tls/server.pem
    - TLS_KEY=/etc/nats/tls/server-key.pem
```

**Browser client usage:**

```javascript
import { connect } from "nats.ws";

// Connect to NATS WSS endpoint
const nc = await connect({
  servers: ["wss://stream.example.com:8443"],
  // or for local dev: ["wss://localhost:8443"]
});

// Subscribe to result/event feeds
const sub = nc.subscribe("result.kernel.*");
for await (const msg of sub) {
  const result = msg.json();
  console.log("Action result:", result);
}
```

**TLS Requirements:**
- Self-signed dev certs OK for local/test (gitignored, not committed)
- CA-signed certs for production
- Browser must trust the WSS endpoint (add CA to client trust store if self-signed)

#### 5.0.2 pgCK Router/Executor Boundary

CK.Lib.Js is a **transport client only**. Kernel logic lives in pgCK:

```
browser (CK.Lib.Js)
  → NATS.publish("input.kernel.XrVoyage.action.launch", {...})
  → NATS WSS transport
  → nats-server (transport edge)
  → pgCK router/executor (business logic)
     - affordance resolution
     - identity verification
     - SHACL validation
     - governed state mutation
  → ckp.seal() or ckp.reject()
  → NATS.publish("result.kernel.XrVoyage.action.launch", {...})
  → browser receives result
```

**No direct kernel logic in CK.Lib.Js**; all governance is in pgCK.

#### 5.0.3 Subject Discipline

Inbound (browser → kernel):

```javascript
await nc.request(
  "input.kernel.MyKernel.action.do_thing",
  JSON.stringify({
    trace_id: "uuid",
    participant: "browser_session_id",
    affordance: "urn:ckp:affordance:MyKernel:do_thing",
    payload: { /* ... */ },
  }),
  { timeout: 5000 }
);
```

Outbound (kernel → browser):

```javascript
// Subscribe to result
nc.subscribe("result.kernel.MyKernel.action.*", (msg) => {
  const { trace_id, outcome, proof } = msg.json();
  // outcome: success | rejected | error
  // proof: optional durable proof reference
});

// Subscribe to events
nc.subscribe("event.kernel.MyKernel.*", (msg) => {
  const { entity, predicate, object } = msg.json();
  // state change notification
});
```

#### 5.0.4 OCI Bundling (v1.2.0+)

For containerized local dev, see `compose/compose.nats-wss.yml` pattern in pgCK repo.

Future v1.2.0 OCI bundle will follow Sporaxis-Com micro profile.

---

## 5.1 GitHub Actions CI/CD

Current workflow (`github/workflows/npm-publish.yml` or similar):

- **Trigger:** on push to main or tag
- **Steps:** npm install → npm test → npm publish
- **Registry:** npmjs

Verify:

- [ ] Workflow file exists and is active
- [ ] npmjs token is valid and scoped to @ConceptKernel org
- [ ] No branch protections blocking merge

### 5.2 Release Notes & Documentation

Create `CHANGELOG.md` or update README with:

```markdown
## v1.1.0 (2026-05-26) — CKP Integration

### Added
- processor.py: minimal KernelProcessor stub for CKP dispatch compatibility
- .gitignore: Python build artifact exclusions

### Removed
- console.{html,js,css}: Moved to CK.Web.Console kernel (separate public repo)

### Docs
- Console functionality now available via CK.Web.Console (see https://github.com/ConceptKernel/CK.Web.Console)
```

### 5.3 Consumer Communication

If v1.0.0 had any public users:

- [ ] Check npmjs "Dependents" page for who installed v1.0.0
- [ ] If any, announce v1.1.0 via GitHub Releases (breaking change: console removal)
- [ ] Update package.json "repository" and "homepage" links to public GitHub

### 5.4 Repository Settings

On GitHub, verify:

- [ ] "About" section accurate (Concept Kernel Protocol JavaScript client)
- [ ] Topics: `conceptkernel`, `ckp`, `client-library`, `javascript`
- [ ] License: same as fork (likely MIT or Apache 2.0)
- [ ] Collaborators/teams with push access documented
- [ ] Branch protection on `main` enabled (require PR review)

### 5.6 Packaging Strategy (npm + future OCI)

**Current (v1.1.0):**
- **npm registry:** @conceptkernel/cklib v1.1.0 published via GitHub Actions workflow
- **CI/CD trigger:** tag `v*` on main → `npm publish` to npmjs

**Planned (v1.2.0+):**
- **OCI bundle:** `bundle-ck-lib-js.yaml` declaring:
  - Base image: Node.js 20+ LTS
  - CK.Lib.Js packaged as npm artifact + bundled modules
  - Multi-platform support (linux/amd64 + linux/arm64)
  - Optional: NATS client for runtime message bus
  - Smoke tests validating module imports and client connectivity
- **Publishing:** Multi-platform OCI images to GHCR
- **Reference:** Follow `SPEC.OCI.BUNDLE.v0.1` pattern (per Sporaxis-Com)

**Governance:**
- OCI bundling does NOT block v1.1.0 npm release
- To be added in a separate `feature/oci-bundle` branch post-v1.1.0
- Versioning: independent `bundle-ck-lib-js-v*` tag series (same pattern as Sporaxis bundles)

### 5.5 Governance & Maintenance

Post-reopening:

- **Primary source of truth:** public GitHub `main` branch
- **Internal fork:** no longer needed (delete or archive after verification)
- **Release process:** Tag on main → GitHub Actions publishes to npmjs
- **Development:** feature branches → PR review → merge to main
- **Kernel sync:** manual pull-requests when new CKP updates needed

---

## 6. Risk & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|-----------|
| Breaking change: console removal affects users | Low | High | Communicate in v1.1.0 release notes; check npmjs dependents first |
| processor.py has import errors (cklib unavailable) | Low | Medium | Test with `python3 processor.py` before merge; verify cklib in venv |
| GitHub workflow token expired | Low | High | Verify npmjs token before push; re-create if needed |
| Data/proof files in fork not captured | Low | Low | Fork is tool.git only; data.git handled separately (not in scope) |
| Commit history confusion (two origins) | Medium | Low | Delete internal fork after verification to avoid confusion |

---

## 7. Success Criteria

Reconciliation is complete when:

1. **Public repo state:**
   - ✓ main branch includes processor.py + .gitignore
   - ✓ commit history shows PR trail (not squashed)
   - ✓ latest tag is v1.1.0 (or higher)
   - ✓ npmjs package shows v1.1.0 published

2. **Testing:**
   - ✓ All .js files pass syntax check
   - ✓ processor.py imports cklib successfully
   - ✓ No console.* references remain in code
   - ✓ package.json version is 1.1.0+

3. **Documentation:**
   - ✓ CHANGELOG.md documents v1.1.0 changes
   - ✓ README mentions CKP integration
   - ✓ GitHub Releases page has release notes
   - ✓ No outdated links in docs

4. **Operational:**
   - ✓ Internal fork (git.int.tech.games) marked deprecated or deleted
   - ✓ All project `.ckproject` files reference public GitHub repo
   - ✓ ck verify CK.Lib.Js passes compliance check
   - ✓ No uncommitted changes in any working tree

5. **Packaging (v1.1.0 scope):**
   - ✓ npm publish workflow verified and passing
   - ✓ npmjs package page shows v1.1.0
   - ✓ OCI bundling deferred to v1.2.0 (not blocking)
   - ✓ Future bundling path documented in SPEC § 5.6

---

## 8. References

### Authoritative specs (v3.7.6)

- [SPEC.CK.NEW.v3.7.6.md](file:///Users/neoxr/git_neux/xr-websockets-v4/SPEC.CK.NEW.v3.7.6.md) — kernel discipline
- [SPEC.CK.LOCKS.v3.7.6.md](file:///Users/neoxr/git_neux/xr-websockets-v4/SPEC.CK.LOCKS.v3.7.6.md) — lock semantics
- [SPEC.STORAGE.GIT.WORKTREES.v3.7.md](file:///Users/neoxr/git_neux/xr-websockets-v4/SPEC.STORAGE.GIT.WORKTREES.v3.7.md) — storage layout

### Related kernels

- CK.Lib.Py — reference for processor.py pattern
- CK.Web.Console — target for console.* relocation
- CK.Operator — registry & kernel orchestration

### External references

- npmjs: https://www.npmjs.com/package/@conceptkernel/ck-lib-js
- GitHub: https://github.com/ConceptKernel/CK.Lib.Js
- Internal registry: https://git.int.tech.games/CK.Lib.Js/

---

## 9. Appendix: Commit Details

### Fork commits (cherry-pick candidates)

**ef07d64 feat: TOOL organ for CK.Lib.Js**
- Establishes tool.git as authoritative source for CK.Lib.Js runtime
- Core infrastructure commit; safe to cherry-pick
- No breaking changes

**7197c3b fix: restore missing TOOL files**
- Recovery commit; restores inadvertently-dropped files
- Safe to cherry-pick; additive only

**39d5d4b chore: gitignore __pycache__**
- Adds .gitignore entry for Python build artifacts
- Necessary for processor.py inclusion
- Safe to cherry-pick; idempotent

**00913f0 feat: minimal KernelProcessor stub for dispatch compatibility**
- Adds processor.py (~30 lines, zero external deps on cklib at import time)
- Enables CKP dispatch routing
- Core feature; safe to cherry-pick

**0696384 trim: drop tool/console.{html,js,css} — surface moved to CK.Web.Console kernel**
- Intentional refactoring (console UI → dedicated kernel)
- **Skip direct cherry-pick** — already implied in current repo (if console.* exist)
- Document separately in changelog

---

## 10. Next Steps

1. **Assign:** Investigation checklist (§ 3) to Claude Code
2. **Gate:** Review investigation findings before Phase 1 cherry-pick
3. **Execute:** Phase 1 & 2 (feature branch + PR creation)
4. **Review:** User reviews PR; approves or requests changes
5. **Merge:** Merge to main; tag v1.1.0
6. **Monitor:** Verify npm publish succeeds; check npmjs package page

---

## Appendix A: Planned OCI Bundle Specification (v1.2.0+)

**Status:** Template; not implemented in v1.1.0  
**Reference:** Follows `SPEC.OCI.BUNDLE.v0.1` (Sporaxis-Com pattern)

When OCI bundling is added, the `bundle-ck-lib-js.yaml` will have this structure:

```yaml
name: bundle-ck-lib-js
description: CK.Lib.Js client library + Node.js runtime with optional NATS

image:
  registry: ghcr.io/conceptkernel/ck-lib-js
  node_major: 20
  base_image: node:20-bookworm
  final_image: node:20-alpine
  runtime_profile: stable

services:
  nats:
    source_image: nats:2.14.1-scratch
    core_port: 4222
    websocket_port: 9222
    jetstream: false

ports:
  - name: nats
    container_port: 4222
  - name: nats-ws
    container_port: 9222

platforms:
  - linux/amd64
  - linux/arm64

local:
  prefix: ckjs-
  data_dir: .artifacts/ckjs-smoke
  network: ckjs-net
  container: ckjs-smoke
```

**Lifecycle:**
- Create `bundles/bundle-ck-lib-js/` directory
- Write `bundle.yaml` (as above)
- Render `Dockerfile` from spec
- Create `scripts/smoke-ck-lib-js.sh` for verification
- Tag releases as `bundle-ck-lib-js-v1.2.0`, etc.
- Publish to GHCR with multi-platform support

**Build triggers:** Tag push to `bundle-ck-lib-js-v*` → GitHub Actions → multi-platform build & push

---

**Document Version:** 1.0  
**Last Updated:** 2026-05-26  
**Next Review:** Post-Phase 1 (§ 4.2) for v1.1.0; then plan v1.2.0 OCI bundling
