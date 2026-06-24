# SPEC.CSVC-CONSENSUS-REFERENCE.v1.5.2 — CSVC as a reference consumer of the concept kernel

**What this is.** CSVC (consensus-services) is a **reference consumer** of CK.Lib.Js: a two-person session
that turns a conflicting document into a *sealed, governed, re-verifiable* decision — every move through the
one door `dispatch(verb, kernel, payload)`. It is the simplest real demonstration of "a governed semantic
substrate over dispatch," so we **special-support it**: its requirements drive what `ck-lib-js` must expose,
and its gaps are our truest integration signal.

**Authoritative substrate floor (verified 2026-06-19, live real-path):** `ck-lib-js` **v1.5.2** (shipped,
attested) · `ociger-ck-allinone` **v0.7.20** · pgCK **0.4.14** (T1–T6 + `adopt_kernel_ttl` + `_resolve_ref`).

> **Why this doc exists / the trigger.** A `NOTIFIES.pgCK-and-CKlib-alignment.v3.9.1` doc (dated 2026-06-24
> but built on a **2026-06-15** substrate snapshot: v0.7.18 / pgCK 0.4.13 / "v1.5.1 not yet tagged") flags
> several items as blocking the CSVC session. **Most are already solved** — that snapshot is ~9 days and two
> releases stale. §3 below is the corrected map.

---

## 1. The session (9 verbs, one door)

A document `release-policy.md` has two conflicting sections (Alice: weekly train; Bob: continuous-on-merge).
The session preserves both, seals the conflict, and resolves by consensus — provenance permanent in the graph.

| step | verb(s) | what it does |
|---|---|---|
| **S7** prereq | `kernel.propose_change {op:set_transition_map}` → `vote` → `apply` | self-govern: seal the `ConsensusTopic` lifecycle map (`pending→[sealed,discarded,deferred]`, `sealed→[superseded]`) |
| anchor | `instance.create` (Session) | a session URN every decision points back to |
| fragments | `instance.create` ×2 (ConsensusTopic) | Alice's + Bob's claims sealed as typed facts; sealer = X-User-ID |
| **S1** orient | `instance.query {filter:{lifecycle_state:pending}}` | both see the two pending decisions |
| **S3** relate | `instance.link {predicate:distinct_from}` | the conflict becomes a sealed, traversable edge |
| **S4** resolve | `kernel.propose_change {op:resolve}` → `vote` → `apply` | synthesize, by quorum; epoch bumps |
| **S2** decide | `instance.transition` ×3 (sealed / discarded / superseded) | dispositions land on the sealed map |
| **S5** aim | `instance.link {predicate:composes}` | link the agreement to the goal |
| **S6** spawn | `instance.create {kind:action, target_kernel:'Build'}` | turn the decision into a queued task |
| **S8** prove | `instance.provenance` + `instance.verify` | the whole alignment re-verifiable from one URN |
| **S9** propose | `concept.match {term}` | the kernel surfaces the next inconsistency |

---

## 2. Every verb the session uses is REAL + verified on the floor

All eleven verbs map to shipped, real-path-verified `ck-lib-js` v1.5.2 ⇄ pgCK 0.4.14 surface:

| session verb | ck-lib-js | pgCK | verified |
|---|---|---|---|
| `kernel.propose_change` / `vote` / `apply` | `k.propose/vote/apply` | governance plane (CI-D) + `_graph_apply` (s39) | ✅ governance trio round-trips |
| `set_transition_map` (governance op) | via `propose` `detail` | T3 `_op_to_ttl` (v0.4.10) | ✅ sealed per-kernel map |
| `instance.create` | `k.create(type, fields)` — passes **all** fields incl `target_kernel` | T0 `create_typed` (v0.4.5) | ✅ **v1.5.2** (see §3) |
| `instance.query` | `k.query(type, filter)` | T1 QueryShape (v0.4.8) | ✅ short-key resolves under real enforcement |
| `instance.link` | `k.link(src, pred, target)` — plain IRI target | T2 declared predicates (v0.4.9) | ✅ edge seals + materializes |
| `instance.reach` | `k.reach(from, via)` | T2 + `_resolve_ref` (v0.4.14) | ✅ returns the linked target (bare-id resolves) |
| `instance.transition` | `k.transition(id, to_state)` | T3 sealed map (v0.4.10) | ✅ legal moves seal; illegal → `{allowed:[…]}` |
| `instance.provenance` / `verify` | `k.provenance/verify` | proof chain + HMAC ledger | ✅ full chain |
| `concept.match` | `k.match(term)` | T6 governed plan (v0.4.13) | ✅ governed SPARQL, binds only `term` |

There is **no cklib or pgCK verb the session needs that is missing or broken** on this floor.

---

## 3. The alignment-doc gaps — SOLVED vs REAL (the answer to "are we chasing something already fixed?")

### ✅ SOLVED — stale in the alignment doc; do not chase

| Flagged item | Doc said | Reality (verified) |
|---|---|---|
| **Substrate floor** | v0.7.18 / 0.4.13 / v1.5.1 *not tagged* | v0.7.20 / 0.4.14 / **v1.5.2 SHIPPED + attested** |
| **§4 v1.5.1 release gate** | `[ ]` open checklist | **DONE** — v1.5.1 (06-18) **and** v1.5.2 (06-19) shipped, attested, byte-verified |
| **BLK-1** (demo enforcement vacuous) | "awaiting ociger v0.7.20" | **FIXED** in v0.7.20 — shapes in `/kernel/ck`; enforcement real (real-path harness: incomplete create rejected, filtered query resolves) |
| **FIX-C** (`reach` bare-id) | "awaiting pgCK NOTIFY" | **FIXED** in pgCK 0.4.14 (`_resolve_ref`); reach returns the linked target. *The doc's own §1 already lists this as done — it contradicts its own §2.* |
| **G7 / D6** (Trace-Id correlation) *for ck-lib-js* | "🔄 `_pending` keyed by verb — unsafe co-tenancy" | **ALREADY DONE in ck-lib-js** — `ck-client.js` keys `_pending` by `traceId`, result handler correlates on `hdrs['Trace-Id']`. The verb-keyed map is the **harness's `ck-bus.mjs`** (a different transport/repo), not cklib. |
| **`target_kernel` create strip** (not in the doc; the real cklib bug) | — | **FIXED in v1.5.2** — `create()` passes all fields; S6's `target_kernel:'Build'` now seals (v1.5.1 stripped it → failed under real enforcement) |

### 🟠 REAL — genuine gaps, but **none in ck-lib-js**, and none blocks the consensus session (S1–S8)

| Item | Owner | Real impact |
|---|---|---|
| **CSVC kernel seed** (`ConsensusTopic`/`Session`/`ConceptLink` shapes + required props; predicates `distinct_from`/`composes`/`part_of_goal`; lifecycle states) | **CSVC** | *Prerequisite.* The typed ops are only non-vacuous once CSVC's `seed.ttl` is sealed into `urn:ckp:csvc/kernel/ck` via `ckp.adopt_kernel_ttl`. This is the session's true requirement — implied but not shown in the story. |
| **F-A / T8** — verified-JWT identity + seal-time claim check | pgCK + SPORE-GENESIS | The "sealer = alice vs bob" distinction needs each participant on a JWT-authed connection injecting their `X-User-ID`. Basic identity-stamping works with two authed connections; the full seal-time claim check + grant-scoped `snapshot`/affordance projection is F-A, **not built**. A 2-person demo stamps identity; grant projection waits. |
| **F-C / T9** — per-session result routing | pgCK transport | Needed only for **concurrent** sessions on one kernel (isolation/fan-out). The **single** story does not need it. |
| **Harness G2/G3/G4** — Tier-2 landing (`{req}` envelope, result→`produced_by`, ToolCall gating) | Sporaxis / `ck-harness` | Affects **S6's downstream task execution** (the Build kernel's harness picking up + sealing the work) — **not the consensus session itself**. |
| `instance.validate` verb governed-in-kernel; `instance.explain` full trace | pgCK | Not used by the session. |

---

## 4. Runnability verdict

**The consensus session (S1→S8) is runnable now** on `ck-lib-js v1.5.2` / `ociger v0.7.20` / pgCK 0.4.14,
**given CSVC's `seed.ttl` is sealed into `urn:ckp:csvc/kernel/ck`** (`adopt_kernel_ttl`) and each participant
is on a verified (JWT) connection. The verbs are all real and live-verified; the demo-bundle enforcement that
was vacuous is now real; the bare-id `reach` and the `target_kernel` create bug are both fixed.

**What genuinely remains is outside cklib:** CSVC's seed (CSVC owns), full multi-party identity (F-A/T8,
upstream), per-session isolation (F-C/T9, for concurrency), and S6's downstream task execution (the harness).
None of these blocks demonstrating the *core* value the story is about — conflict → sealed edge → governed
synthesis → re-verifiable decision.

**Recommended next step (cheap, high-signal):** seal CSVC's `seed.ttl`, then run S1→S8 as a Playwright/cklib
test against `csvc.localhost` (real client, real wss) — the same harness pattern in `tests/real-path/`. That
converts this reference from "verbs verified individually" to "the whole session proven end-to-end," and it
will surface any genuine CSVC-shape gap (vs the already-solved substrate ones).

---

## 5. The one correction to send back to the alignment doc

The doc is **mostly chasing solved work** because it's built on a 2026-06-15 substrate. Bump its floor to
v0.7.20 / pgCK 0.4.14 / **cklib v1.5.2**, then: tick **§4** (released), **BLK-1**, **FIX-C**, and **G7 (for
ck-lib-js)** as ✅. Re-scope **G7** to the harness's `ck-bus.mjs` only. The remaining open items collapse to:
**CSVC seed**, **F-A/T8**, **F-C/T9**, and the **harness landing (G2/G3/G4)** — the genuine post-v1.5.x epoch.
