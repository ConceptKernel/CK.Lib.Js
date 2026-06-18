# SPEC.ROADMAP.v1.5.0.CHECKLIST

Roadmap to **CK.Lib.Js v1.5.0 — Edge Isolation** (the client-edge twin of **CKP v3.9 — Critical
Isolation**; pgCK → **v0.4.0**), reached via the **v1.4.1 "Stripped Alpha"** precursor. Each stage
aligns to a pgCK gate (CI-A…CI-E) and may not ship until that gate lands.

**Grounding model:** `_WIP/ref-SPEC.CKP.v3.9.md` (three rings, closed `ckp.dispatch` four-tuple, §0.1 the four arguments against a query surface, §7 Postgres role isolation, P1–P10).
**pgCK delivery phases:** `_WIP/ref-SPEC.pgCK.ROADMAP.CRITICAL-ISOLATION.v0.1-devel.md` — CI-A…CI-E.
**pgCK task countdown (the twin we align to):** `_WIP/ref-SPEC.ROADMAP.v3.9.CHECKLIST.md` — 24→1.
**Specs:** `SPEC.CK-LIB-JS.v1.5.0.md` (full dispatch-only, the index-1 target; v3.9-ratification-gated for public push). v1.4.1 is a PATCH; its plan is `_WIP/PLAN.v1.4.1-intermediary-stripped-release.md`.

---

> **Status (2026-06-11) — v1.4.3 published (the first byte-verified stripped artifact); v1.5.0
> code-complete, tag held on the keystone.**
> **Packaging-integrity incident resolved:** `oci-publish.yml` checked out `ref: main`, so `:1.4.1`/`:1.4.2`
> shipped main's stale v1.4.0 pre-strip bytes — attested-but-wrong (found by oci-germination's byte audit).
> Corrective **`v1.4.3`** (`aa4d960`) builds the pushed tag and is **byte-verified stripped**
> (`ck-client.js` + `vendor/{nats.ws,msgpack}.js` only; digest `sha256:f2f6c2df…`). Treat `:1.4.1`/`:1.4.2`
> as `:1.4.0`; consumers pin **`:1.4.3`**. Byte-verification is now standing release policy.
> **v1.5.0 dispatch-only surface is PROMOTED + committed on the branch** (`ck.js` L2 facade, `ck-store.js`
> typed cache, dispatch transport on the vendored client; smokes 24/24 + 22/22; README + npm metadata recut
> Concept-Kernel-first, zero-dep). Live verifies vs v0.7.11/v0.7.13: the client is **verified-correct**
> (Gap 1 result-grammar closed in `a987f9b`, Trace-Id correlation, zero timeouts) — blocked only downstream.
> **The keystone chain:** pgCK **v0.4.2 "install-from-zero"** (fresh-cluster cascade — 5 asks + the s34
> gate) → oci-germination re-cut (the **2-arg governed relay**, already wired in their v0.7.14 line, +
> **cklib `:1.4.3`** pin) → our `verify-v150` 5/5 → **tag v1.5.0** → adoption NOTIFY starts the alias
> clock → web2 migrates → pgCK v0.5.0 retires `task.*`.
> npm note: registry `latest` is the v3.5-era `1.0.0` — deprecate + publish `1.5.0 --provenance` at tag
> (user-gated).

---

## The thesis (one line)

> v3.9 proves a query surface is incompatible with the contract (unenumerable capability, injection
> surface, unsealed write path). v1.5.0 carries that proof to the client edge: **the client collapses
> to authentication + `ckp.dispatch` — no RDF, no quad store, no pgRDF, no query engine.** It addresses
> **URNs and typed instances**, never triples, graphs, or storage layout. *Reduction precedes
> capability:* the v1.4.1 alpha strips first; v1.5.0 builds the dispatch surface as pgCK opens each gate.

---

## Descending-index task list (aligned to pgCK CI-A…CI-E)

Build/ship order is **descending**: the highest index is the first stage (the v1.4.1 alpha — done),
each decrements, and **index 1 ships v1.5.0** (aligned to pgCK v0.4.0 / CI-E). Every task names the
**pgCK gate it aligns to** and its **readiness** — a gated task cannot ship until that gate lands.

`#` descending · `ID` = `CE-<stage>-<n>` (stage aligns to pgCK CI-`<stage>`) · ⛴ = stage ship-it ·
✅ done · 🔨 built-ahead (in `_WIP/v1.5.0-thread/`, gated) · ⏳ in progress · ⬜ gated on the pgCK gate.

| # | ID | Task | pgCK gate | Status |
|---:|---|---|---|---|
| 18 | CE-A-5 | Strip the client RDF tier — remove `ck-rdf-bridge.js`, `ck-hex-store.js` (no client quads) | CI-A | ✅ |
| 17 | CE-A-4 | Reduce attack surface → **`ck-client.js` only**: retire `vendor/`, `scripts/`, the 7 orphan render modules + the demo chain (`ck-page/bus/kernel/store`, `index.html`) | CI-A | ✅ |
| 16 | CE-A-3 | Repackage v1.4.1 + de-stale docs: `package.json` (`.`/`./client`→`ck-client.js`), `Dockerfile`, `README`, `COMPLIANCE`, `PROVENANCE`, `CHANGELOG`, the `oci-publish.yml` LATEST template | CI-A | ✅ |
| 15 | CE-A-2 | NOTIFIES agreement on the alpha — **pgCK AGREED** · **oci-germination CONFIRMED** (bundle spec layout-agnostic) | CI-A | ✅ |
| 14 | CE-A-1 ⛴ | **Ship v1.4.1** — tag `v1.4.1`@`1cd4346` → CI attest → `:1.4.1` published + `LATEST.md`→v1.4.1; dev `ck-client.js` connects over WSS (verified) | CI-A | ✅ **SHIPPED + attested** |
| 13 | CE-B-5 | `ck.js` L2 facade (`CK`/`ConceptKernel`/`ckOn`) | CI-B | 🔨 built-ahead |
| 12 | CE-B-4 | `CKStore` typed-instance cache (no quads) | CI-B | 🔨 built-ahead |
| 11 | CE-B-3 | `CKClient` dispatch transport (four-tuple) + v3.8→v3.9 shim | CI-B | 🔨 built-ahead |
| 10 | CE-B-2 | Land the wire: `task.*`→`instance.*` migration; **drop the v3.8 subject shim** | CI-B-2 | ⬜ gated |
| 9 | CE-B-1 ⛴ | `validate` → field-level `ValidationReport` (drop boolean-grade) | CI-B-3 | ⬜ gated |
| 8 | CE-C-1 | Drop the transitional shim once pgCK presents `ckp.dispatch` natively (epoch transparent) | CI-C | ⬜ gated |
| 7 | CE-D-2 | Governance `propose`/`vote`/`apply` — drop the `gov_plane_unavailable` stub | CI-D | ⬜ gated |
| 6 | CE-D-1 ⛴ | Governance plane live (type changes via quorum) | CI-D | ⬜ gated |
| 5 | CE-E-4 | `instance.query` typed QueryShape — drop the client-side cache-filter fallback | CI-E-5 | ⬜ gated |
| 4 | CE-E-3 | `instance.reach` bounded traversal | CI-E-4 | ⬜ gated |
| 3 | CE-E-2 | `instance.transition` server gate + authz'd `snapshot` — drop the `update` shim | CI-E-3 | ⬜ gated |
| 2 | CE-E-1 | `concept.match` governed query (typed params; never query text) | CI-E-2 | ⬜ gated |
| 1 | CE-SHIP ⛴ | **Ship v1.5.0 — dispatch-only Edge Isolation** (build+attest `ck-lib-js:1.5.0`; flip the spec authoritative) | CI-E-1 / v0.4.0 | ⬜ |

**Cross-stage order is fixed (floor precedes capability):** A (alpha) is shipped; B→C→D→E open only as
pgCK lands the matching gate. Tasks 13–11 are *code-complete and parked* (`_WIP/v1.5.0-thread/`) — they
ship as part of CE-B-2 the moment pgCK CI-B presents the four-tuple registry.

---

## pgCK gate alignment (kept in sync with pgCK's 24→1)

| pgCK gate | pgCK status | CK.Lib.Js stage | CK.Lib.Js status |
|---|---|---|---|
| **CI-A** (role floor + web2 verbs floored) | ✅ **v0.3.0** | v1.4.1 alpha (CE-A) | ✅ **SHIPPED** `:1.4.1` + v1.4.2 hardened `:1.4.2` |
| **CI-B** (sealed registry, `instance.*`, validate gate) | ✅ **v0.3.2** (v0.3.1 dead) | v1.5.0 dispatch (CE-B) | 🔨 **PROMOTING** (built-ahead → tracked) |
| **CI-C** (plan compiler + epoch) | ✅ **v0.3.3** | shim drop (CE-C) | 🔨 promoting |
| **CI-D** (governance plane) | ✅ **v0.3.4** | governance verbs (CE-D) | 🔨 promoting |
| **CI-E** (typed reads — epoch complete) | ✅ **v0.4.0** | typed reads + ship v1.5.0 (CE-E) | 🔨 promoting → verify vs v0.7.9 → tag v1.5.0 |

**pgCK is at v0.4.0 (full v3.9 epoch); oci-germination at v0.7.9 (integration env).** All CI gates landed
in one wave — so CE-B…CE-E unblock together: promote the built-ahead dispatch, integration-verify vs
v0.7.9 (pgCK v0.4.0 + a real dispatcher), then tag **v1.5.0** = ship-it (index 1).

**Cross-side rule:** if a pgCK gate slips, the dependent CE task is **blocked, not worked around** —
surface via NOTIFY. The client degrades **honestly** against any unshipped gate (stable signatures).

---

## Removals (done — archived to `_WIP/deprecated/`, reversible)

| Removed | Was | Successor |
|---|---|---|
| `ck-rdf-bridge.js` | `toQuads`/`dataFactory`/`makeNativeDatasetCore` | none (no client quads) |
| `ck-hex-store.js` (+ `ck-hex-store/`) | `CKHexStore` RDF mirror, hex index, `toRdfJs` | `ck.js`+`CKStore` typed cache (v1.5.0 thread) |
| `ck-page/bus/kernel/runtime/registry/shapes/materializer/anim/anim-grammar/sound`, `ck-store`, `index.html` | legacy render/page tier + demo | none — web2 needs only `ck-client.js` |
| `vendor/anime.esm.min.js`, `scripts/gh-watch.sh` | vendored 3rd-party + dev tooling | none |
| `build-ck-lib-js.sh`, `smoke-ck-lib-js.sh`, `bundle-ck-lib-js.yaml` | stale dev artifacts (build script **violated PROVENANCE Rule 1**) | none |
| `SPEC.CK-LIB-JS.v1.4.2.md` | obsolete L2-over-RDF DRAFT (never shipped) | superseded by `SPEC.CK-LIB-JS.v1.5.0` |

**Last remaining attack vector (tracked):** `ck-client.js` runtime-loads `nats.ws`+`@msgpack` from
esm.sh (CDN) — needed for NATS; **vendoring** is the immediate next hardening step.

---

## Inherited prerequisites (owned elsewhere)

- **Identity = verified JWT + seal-time claim check** (v3.9 TR-02 / SPORE Phases 0–1; transitional GUC
  for the alpha). The client supplies the JWT, never asserts identity.
- **F-C per-session result routing** (transport-side) — the granted-scope subscription is the client half.

---

## Release posture & compliance (PROVENANCE)

- **Staged, not one cut.** v1.4.1 (alpha) ships first; v1.5.0 ships across CE-B…CE-E as pgCK opens gates.
- **CI-only publish.** A release = a **`v*` tag push** → `oci-publish.yml` builds + attests + publishes +
  renders `LATEST.md`. Workstation `docker push`/`gh release create` are **prohibited** (Rule 1); plain
  `git push` of a branch is allowed (done for v1.4.1). The offending `build-ck-lib-js.sh` is retired.
- **Rule 4:** a `v1.4.1` tag is permitted (v1.4.0 is attested in `LATEST.md`). The tag is **your**
  authorized step — not cut yet.
- **Branch discipline (LOCKS):** all writes land on the task branch (`ck-lib-js.task.*`), never `main`.
- **Visibility:** `SPEC*` are public *client* docs (tracked) — but the **v1.5.0 spec + this checklist
  detail v3.9, which pgCK holds "public only when ratified" (§15)** → kept **untracked/local** (excluded
  from the v1.4.1 commit) until a pgCK NOTIFY clears the public push. The shipped artifact (npm/OCI)
  never carries a spec regardless.

---

## Alignment statement

The client-edge twin of `_WIP/ref-SPEC.ROADMAP.v3.9.CHECKLIST.md`. The proof that closes the query
surface server-side (Ring 0 reachable only via Ring-1 under Postgres role isolation) closes it one tier
out: the client carries no RDF/quad/pgRDF/query engine — it authenticates and dispatches. pgCK marches
CI-A→CI-E to v0.4.0; CK.Lib.Js ships v1.4.1 now (CI-A) and v1.5.0 in step (CI-B…CI-E), so a concept
kernel is secure end-to-end with no participant holding more than `EXECUTE ckp.dispatch`.
