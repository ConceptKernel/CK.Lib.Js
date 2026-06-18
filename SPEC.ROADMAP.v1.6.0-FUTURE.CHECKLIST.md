> **FUTURE — post-v1.5.1.** This is the single post-v1.5.1 roadmap.
> Current shipped: **v1.5.0**. In progress: **v1.5.1** (`SPEC.ROADMAP.v1.5.1.CHECKLIST.md`).
> Nothing here is released until its version tags and attests.

# SPEC.ROADMAP.v1.6.0-FUTURE.CHECKLIST

All work that ships **after v1.5.1**. Organised by planned version; version boundaries may shift
as pgCK tracks land. The rule: a version can only tag when its pgCK gate is attested and the
dependent code is live-verified.

**Predecessor:** `SPEC.ROADMAP.v1.5.1.CHECKLIST.md`
**Date:** 2026-06-18

---

## Version map

| Version | Trigger | Key delivery |
|---|---|---|
| **v1.5.1** *(in progress)* | TE-10→TE-4 + FIX-A/B/G5a | Typed-edge forms; wire spec |
| **v1.6.0** | pgCK v0.5.0 (T8+T9) + BLK-1 + FIX-C | TE-3 snapshot/F-A; TE-2 session routing; enforcement non-vacuous |
| **v1.7.0** | CE-B-2 + alias retirement + Node binding | `ckp.dispatch` default; retire `task.*`; Node/harness surface |
| **v2.0** | Major cleanup | Drop short-form topics, `./client` subpath, legacy aliases |

---

## v1.6.0 — Typed Edge complete

Gated on: **pgCK T8 (v0.4.15)** + **pgCK T9 (v0.4.16)** + **BLK-1** resolved + **FIX-C** resolved.

`⏳` blocked · `⬜` not started

| ID | Task | Depends on | Status |
|---|---|---|---|
| **TE-3** | `instance.snapshot` — supply verified JWT; render granted bodies; drop `snapshot_not_granted` degrade | pgCK T8 · v0.4.15 (F-A) + SPORE Phases 0–1 | ⏳ gated |
| **TE-2** | Per-session result routing on `session.{project}.{id}` — subscribe below L2; correlate to dispatch | pgCK T9 · v0.4.16 (F-C) | ⏳ gated |
| **FIX-C** | `reach` — `from` must be a full IRI; bare instance-id triggers pgCK SPARQL error | pgCK NOTIFY response | ⏳ awaiting pgCK |
| **BLK-1** | Demo enforcement non-vacuous — shapes must be in `urn:ckp:<proj>/kernel/ck` | oci-germination v0.7.20 (pgCK reconcile first) | ⏳ awaiting oci-germination RESPONSE to pgCK reconcile |
| **TE-SHIP** ⛴ | Ship v1.6.0 — build+attest `ck-lib-js:1.6.0` | All above + pgCK v0.5.0 | ⏳ blocked |

---

## v1.7.0 — Wire cleanup + Node + Harness

Independent of F-A/F-C. Batches when enough items accumulate.

| ID | Task | Depends on | Status |
|---|---|---|---|
| **AP-1** | Affordance projection — `activate` subscribes identity's **granted** affordance rows; `affordances()` returns intersected set | pgCK CI-A/CI-B + SPORE | ⬜ gated |
| **AP-2** | `k.do(verb)` for ungranted verb resolves `{ok:false}` client-side (ergonomics; enforcement still server-side) | AP-1 | ⬜ gated |
| **SS-1** | `instance.snapshot` with verified JWT — cache hydration from server-granted scope (closes F-E) | TE-3 + AP-1 | ⬜ gated |
| **CE-B-2** | Flip `dispatchMode` default `v3.8` → `v3.9` (`ckp.dispatch` four-tuple ingress) | pgCK CI-B confirmed + NOTIFY to `task.*`-alias holders | ⬜ unblocked client-side; await pgCK |
| **SR-2** | Retire granted-scope wildcard subscription (`result.kernel.<K>.>`) replaced by F-C per-session routing | TE-2 | ⬜ gated |
| **AL-1** | Retire `task.*` → `instance.*` aliases — NOTIFY pgCK + oci-germination one minor before drop | CE-B-2 confirmed; web2-green | ⬜ clock started (v1.5.0 adoption) |
| **ND-1** | Node.js binding (`ck-harness` surface) — L2 is transport-agnostic; Node adapter is additive | — | ⬜ |
| **MB-1** | Minified build + TypeScript declaration file (`ck.d.ts`) | — | ⬜ |
| **PD-1** | Declare `ckp://conceptkernel.org/notifies` as a base-ontology predicate — unblocks cross-kernel `notify` without per-kernel `add_property` | pgCK ontology / NOTIFY | ⬜ NOTIFY to pgCK pending |

---

## v2.0 — Major cleanup

| ID | Task | Gate |
|---|---|---|
| **AL-2** | Hard-remove `./client` subpath alias (deprecated since v1.5.0) | MAJOR bump |
| **XR-1** | Extract legacy render/page surface → `CK.Lib.Xr` | `CK.Lib.Xr` readiness |
| Short-form topics | Remove `input.<K>` / `result.<K>` / `event.<K>` publish/subscribe aliases | MAJOR bump; NOTIFY round-trip |

---

## Open NOTIFIES (carried)

| NOTIFY | Status |
|---|---|
| `NOTIFIES.oci-germination.v0.7.19.shape-graph-mismatch` (BLK-1) | RESPONSE received; relayed to pgCK; awaiting pgCK reconcile → v0.7.20 |
| `NOTIFIES.SuperAiHarness3000.v3.9.harness-review-convergence` | Awaiting RESPONSE (3 asks: agent.* names, notify convergence, facts shape) |
| pgCK reach IRI bug (FIX-C) | NOTIFY not yet written — needed |
| pgCK §7.1–§7.4 (preview, strict detail, inverse/undo, breaking-change guard) | Carried from CSVC RCA — NOTIFY to pgCK pending |
| `PD-1` base `ckp:notifies` predicate | NOTIFY to pgCK pending |

---

## Carried-forward (version-agnostic)

- `instance.explain` — full derivation-chain trace; surfaces opaquely when pgRDF v0.6 lands (T10).
- NOTIFIES coordination for alias retirement: one NOTIFY to pgCK + one to oci-germination per
  SPEC.NOTIFIES v0.4, one minor ahead of the drop.
- npm publish `--provenance` at each tag (user-gated per PROVENANCE).
- `LATEST.md` OCI digest update after each tag (CI-automated).
