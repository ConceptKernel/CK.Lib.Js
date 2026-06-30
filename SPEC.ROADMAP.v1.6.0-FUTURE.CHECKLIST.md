> **CHECKLIST for the v1.6.0 milestone — but v1.6.0 is NOT announced, and not in sight.**
> Every item below is delivered **progressively, via sequential 1.5.x releases** (1.5.1 shipped; then
> 1.5.2, 1.5.3, …). **"v1.6.0" is the label for the milestone** reached when its section is fully checked —
> it is **NOT a scheduled tag.** Until then, **1.5.x is the way forward**: each item ships in whatever
> 1.5.x release real-path-proves it (the v1.5.1 discipline). v1.6.0 is announced only once its checklist
> reads all `[x]`. Current shipped: **v1.5.1** (2026-06-18). Next: **v1.5.2**.

# SPEC.ROADMAP.v1.6.0-FUTURE.CHECKLIST

The progressive checklist of all post-v1.5.1 work. Check `[ ]` → `[x]` as a **1.5.x release** ships and
real-path-proves each item (no item is "done" until released + verified). The milestone labels (v1.6.0,
v1.7.0, v2.0) only **group items by theme** — they are **not release dates**; the only release vehicle
is **1.5.x**.

**Predecessor:** `SPEC.ROADMAP.v1.5.1.CHECKLIST.md` (v1.5.1 SHIPPED 2026-06-18)
**Date:** 2026-06-18

---

## Milestone map — delivered via sequential 1.5.x (these are NOT scheduled tags)

| Milestone (label only) | Gate | Checklist items |
|---|---|---|
| ✅ **v1.5.1** | TE-10→TE-4 + FIX-A/B/G5a | Typed-edge forms; wire spec — **SHIPPED 2026-06-18** |
| **v1.6.0** *(target — unannounced, not in sight)* | pgCK T8+T9 + BLK-1 + FIX-C | TE-3 snapshot/F-A; TE-2 session routing; enforcement non-vacuous |
| v1.7.0 *(later — parking lot)* | CE-B-2 + alias retirement + Node | `ckp.dispatch` default; retire `task.*`; Node surface |
| v2.0 *(later — parking lot)* | major cleanup | drop short-form topics, `./client` subpath, legacy aliases |

**Release vehicle: 1.5.x only.** Each checklist item lands in the next 1.5.x that proves it real-path.
v1.6.0 is announced only when its section reads all `[x]` (re-tag/alias the last green 1.5.x then) —
there is **no v1.6.0 tag scheduled** before that.

---

## v1.6.0 — Typed Edge complete

Gated on: **pgCK T8 (v0.4.15)** + **pgCK T9 (v0.4.16)** + **BLK-1** resolved + **FIX-C** resolved.

`[ ]` not delivered · `[x]` delivered in a 1.5.x (note which) — check each as its 1.5.x release ships + real-path-proves it.

| ID | Task | Depends on | Status |
|---|---|---|---|
| **TE-3** | `instance.snapshot` — supply verified JWT; render granted bodies; drop `snapshot_not_granted` degrade | pgCK T8 · v0.4.15 (F-A) + SPORE Phases 0–1 | `[ ]` gated (pgCK T8) |
| **TE-2** | Per-session result routing on `session.{project}.{id}` — subscribe below L2; correlate to dispatch | pgCK T9 · v0.4.16 (F-C) | `[ ]` gated (pgCK T9) |
| **FIX-C** | `reach` — `from` must be a full IRI; bare instance-id triggers pgCK SPARQL error | pgCK NOTIFY response | `[x]` RESOLVED — ociger v0.7.20; `reach` returns the linked target (real-path verified, v1.5.2) |
| **BLK-1** | Demo enforcement non-vacuous — shapes must be in `urn:ckp:<proj>/kernel/ck` | oci-germination v0.7.20 | `[x]` FIXED — ociger v0.7.20; shapes in `kernel/ck`, enforcement real (real-path verified, v1.5.2) |
| **MILESTONE** | **Announce v1.6.0** — when every item above is `[x]`, the accumulated 1.5.x state *is* v1.6.0; re-tag/announce then. No v1.6.0 tag before that. | all above `[x]` | `[ ]` |

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
| pgCK §7.1–§7.4 (preview, strict detail, inverse/undo, breaking-change guard) | Carried from a consumer RCA — pgCK ask pending |
| `PD-1` base `ckp:notifies` predicate | NOTIFY to pgCK pending |

---

## Carried-forward (version-agnostic)

- `instance.explain` — full derivation-chain trace; surfaces opaquely when pgRDF v0.6 lands (T10).
- NOTIFIES coordination for alias retirement: one NOTIFY to pgCK + one to oci-germination per
  SPEC.NOTIFIES v0.4, one minor ahead of the drop.
- npm publish `--provenance` at each tag (user-gated per PROVENANCE).
- `LATEST.md` OCI digest update after each tag (CI-automated).
