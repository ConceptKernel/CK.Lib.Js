# SPEC.CK-OPERATIONS.v1.6.0 — The Concept-Kernel Operations Layer (cross-consumer, transport-independent)

**Status:** **tracked on the v1.6.0 branch (2026-06-13); publish gated on pgCK ratification.** Grounded in
pgCK **v0.4.13** (T1–T6 of the v0.5 track set all **released + attested**; `LATEST.md` at 0.4.13) — but the
**integrated/live-verified floor is still pgCK 0.4.2** (bundle `ociger-ck-allinone:v0.7.18` / client
`ck-lib-js:1.5.0`), so §8 carries a **two-axis** status (pgCK-released vs integrated). The two contract
questions Q1/Q2 are **PINNED** (§7).
This document specifies the **operations layer** that sits between pgCK's substrate spec
(`SPEC.CKP.v3.9.md`, private) and the per-consumer specs (`SPEC.CK-LIB-JS.v1.6.0`,
`SPEC.CK-HARNESS-CL.v3.9`). It says **what each concept-kernel operation MEANS** — independent of who
invokes it (a browser, the `cklib` facade, the Claude harness, an agent) and independent of the wire it
rides on. It is the shared contract both repos need above the transport.

**Visibility:** kept **untracked / local** (it details CKP v3.9, which pgCK holds "public only when
ratified" — its roadmap §15). It is NOT shipped in any distributed artifact (npm tarball, OCI image).
It MAY be co-developed with pgCK via the NOTIFIES protocol; its **public push is gated on a pgCK
v3.9-ratification NOTIFY**, exactly as `SPEC.CK-LIB-JS.v1.5.0`'s Visibility note records.

**Date:** 2026-06-12
**Grounded in (read, not invented):**
- `SPEC.CKP.v3.9.md` (pgCK; via `_WIP/ref-SPEC.CKP.v3.9.md`) — the three rings, the closed four-tuple
  `ckp.dispatch`, the instance / governance planes, the frozen Ring-1 primitive set, invariants P1–P10.
- `SPEC.pgCK.ROADMAP.v0.5.0.md` (pgCK; via `_WIP/ref-…`) — the T1…T10 tracks that replace each remaining
  concretion with the kernel's **declared** shape; every `⏳` below names the track that closes it.
- **pgCK `ontology/*.ttl`** — the **authoritative declared shapes** (`core.ttl`, `task.ttl`/`goal.ttl`,
  and the split modeling slices), loaded into the kernel graph (`urn:ckp:<project>/kernel/ck`). This is
  the source of every "declared shape" this layer references — the QueryShape filter keys (T1), the
  declared predicate set (T2), the sealed transition map (T3), the update patch fields (T4), the
  ValidationReport shapes (T5). *Authoritative until the sporaxis concept directory distributes them.*
- `SPEC.CK-LIB-JS.v1.6.0.md` §4 — the handle API + the operation→verb table (reconciled to `ck.js`).
- `ck.js` (v1.5.0 facade, shipped) — `OP_VERB`, `REPLY_FIELD`, `normalizeReply`, the payload shapes it
  emits (nested `instance.create`, `[{op,key,value}]` query filter), the per-verb sugar.
- `SPEC.CK-HARNESS-CL.v3.9.md` §0/§1/§4/§5/§6/§8 — the `agent.*` delegated-affordance catalog, the
  Tier-2 delegation reframe, SEMANTIC IN/OUT typing, ToolCall as a sealed transition map.
- `_WIP/NOTIFIES.pgCK.v0.4.2.wire-contract-pin-operations(-RESPONSE).md` — the two contract questions
  (Q1 reply-envelope, Q2 create-routing), **now PINNED** by pgCK's RESPONSE (§7) + the per-verb shapes.

**Conformance language:** MUST / SHOULD / MAY per RFC 2119.

> **Honesty markers — TWO axes (refreshed 2026-06-13).** A verb is "done" only when BOTH hold, so each op
> carries two states (full table in §8):
> - **pgCK** — released + SLSA-attested on pgCK's wire: **✅** released / **⏳** not yet handled (F-A/F-C) /
>   **❌** gap.
> - **Integrated** — carried in a consumable bundle AND live-verified end-to-end by a consumer: **✅ vX**
>   live-verified at that release / **🔨 TE-n** client built-ahead, mock-only / **⏳** released-but-not-in-
>   any-bundle (bundle-gated).
>
> **pgCK floor = `v0.4.13`** (GitHub-released + attested *sequentially* through 2026-06-12; `LATEST.md`
> attested at 0.4.13). Released: the **core five** + **governance trio** (TYPED-SEALED), `retire` +
> `validate`-gate (v0.4.3), generic typed `create` + type-mutating `apply` (v0.4.5), reach over materialized
> quads (v0.4.6), governed query affordances (v0.4.7), **and the full v0.5 track set T1–T6** — derived
> QueryShape (T1/v0.4.8), declared predicate set (T2/v0.4.9), per-kernel sealed transition map (T3/v0.4.10),
> generic update patch (T4/v0.4.11), full SHACL ValidationReport (T5/v0.4.12), governed `concept.match`
> (T6/v0.4.13). `snapshot` stays `⏳` on F-A (T8); `agent.*` session-control stays `⏳` on the registry.
>
> **Integrated floor = pgCK `0.4.2` / bundle `ociger-ck-allinone:v0.7.18` / client `ck-lib-js:1.5.0`** —
> and it has **not moved since v1.5.0**. The consumable bundle still bakes pgCK **0.4.2**, so *none* of the
> v0.5-track refinements (T1–T6) — nor even `retire`/typed-`create` (0.4.3/0.4.5) — is reachable end-to-end
> yet. The client mirrors them **built-ahead** (TE-10→TE-5, mock-verified 27/27, commits on
> `ck-lib-js.task.v1.6.0-typed-edge`, *not released*); they integrate the moment the bundle bumps to pgCK
> ≥0.4.13 (#14).

---

## 1. Scope and the three layers

CKP is layered. Each layer has a different audience and a different vocabulary, and **a layer never
reaches around the one below it**.

```
  ┌───────────────────────────────────────────────────────────────────────────┐
  │ CONSUMER LAYER   browser app · cklib facade (ck.js) · Claude harness · agent│
  │                  vocabulary: URNs + verbs.  (THIS LAYER NAMES NO WIRE.)     │
  ├───────────────────────────────────────────────────────────────────────────┤
  │ OPERATIONS LAYER (THIS SPEC)                                                 │
  │   what each op MEANS · payload + reply shape · lifecycle/provenance ·        │
  │   plane (instance/governance/agent) · delegation seam · discovery           │
  ├───────────────────────────────────────────────────────────────────────────┤
  │ SUBSTRATE LAYER  pgCK (SPEC.CKP.v3.9): three rings, ckp.dispatch, _seal,     │
  │                  the frozen Ring-1 primitives, Postgres role isolation       │
  └───────────────────────────────────────────────────────────────────────────┘
```

- **Substrate** (pgCK, owned elsewhere) is the closed primitive contract: Ring 0 the pgRDF engine,
  Ring 1 the frozen ~10 primitives, Ring 2 the affordances, the single door `ckp.dispatch`, the
  Postgres role floor. This spec **consumes** the substrate; it does not redefine it.
- **Operations** (this spec) is the **semantics of each verb**: the fact a verb asserts or reads, the
  payload that carries it, the reply that comes back, the lifecycle/provenance it produces, the plane
  it executes on, and whether it is delegated outward to a Tier-2 executor. It is **transport-
  independent**: the same operation has the same meaning whether emitted on the v3.8 per-verb subject
  grammar or the v3.9 four-tuple ingress.
- **Consumers** (browser, `cklib`, harness, agent) **name URNs and verbs only**. They are normative:

> **The consumer-vocabulary rule (MUST).** A consumer addresses **concept kernels and concepts (URNs)
> and verbs**. It MUST NOT name — in any application-layer surface — a NATS subject, a codec token, a
> dictionary handle, a trace id, a quad, a graph id, a table name, or a query string. (VISION I11;
> CKP v3.9 P1; CK-LIB-JS §4.8; CK-HARNESS-CL §11.1.) The operations layer is exactly the set of things
> a consumer IS allowed to name, with their meanings pinned.

This is why the operations layer exists: without it, each consumer would re-derive op meaning from the
substrate's private shapes (the failure the pgCK wire-contract NOTIFY is closing), and the meanings
would drift between the facade and the harness.

---

## 2. The dispatch contract — every operation compiles to one closed door

**Every operation in this spec compiles to exactly one outbound primitive:**

```
  ckp.dispatch(verb, kernel_urn, payload, identity) → typed reply
```

the closed four-tuple of CKP v3.9 §2.1. There is no other ingress. A consumer that wants to *create*,
*query*, *verify*, *propose*, *delegate-execute* — anything — names a **verb**, a **kernel URN**, and a
**typed payload**; the substrate supplies the fourth element.

Normative properties of the door (all inherited from CKP v3.9 §2, restated as operations-layer
obligations):

1. **Verb is an exact-match key** into the sealed affordance registry (P3). Unknown verb →
   `{ok:false, error:'unknown_affordance'}` and **nothing further executes**. (The `cklib` facade
   recognizes both `'unknown_affordance'` and `'unknown_verb'` as the same unknown-marker — `ck.js`
   `isUnknownAffordance`.) An operation MUST NOT be expressed by parsing or string-building an action
   URN; it is a table lookup (`cklib` `OP_VERB`; CK-LIB-JS §4.2).
2. **`kernel_urn` is canonical** — `ckp://Kernel#<Name>` (`cklib` `normalizeKernel`). A consumer that
   passes a bare name MUST have it normalized before the door.
3. **`payload` is validated against the affordance's `inShape` BEFORE any value is used** (P4; v3.9
   §2.2 step 4). Violations return the engine's `sh:ValidationReport` mapped to typed
   `violations[]` — **server-decided, never client-faked** (CK-LIB-JS §4.2).
4. **`identity` is server-derived, never client-asserted (MUST).** It is the OIDC-JWT verified at the
   Envoy edge and re-checked at seal-time (CKP v3.9 TR-02 / §2.2 step 3; SPORE-GENESIS F-A). **No
   consumer ever puts identity in the payload.** `cklib`'s transport carries it from the verified
   connection (CK-LIB-JS §4.1); the harness adopts verified-JWT identity the moment F-A lands
   (CK-HARNESS-CL §9). Today (⏳ F-A) identity is asserted from the connection (`requester:null` at the
   relay — see §3.D and the snapshot gap); the operation meaning is unchanged when F-A lands.

> **Wire is below this layer.** Whether the door is reached by the v3.8 per-verb subject grammar
> (`cklib` `dispatchMode:'v3.8'`, the shipped default — reply correlated by `Trace-Id`) or the v3.9
> four-tuple ingress (`dispatchMode:'v3.9'`, opt-in until the deferred CE-B-2 flip) is a **transport
> detail invisible to operations**. The operation's verb, payload, and reply meaning are identical
> across both. (CK-LIB-JS §0 Wire status, §5.)

**The reply envelope is PINNED (Q1, §7): per-verb fields are FINAL for the v3.9 wire.** Each verb returns
its own field (the §7 map); the `cklib` facade keys `normalizeReply` (`REPLY_FIELD` → `.result`) off that
per-verb map as the contract, and its typed cache ingests. A future uniform `.result` would be **additive**
(the per-verb fields stay as the legacy read-path) — not scheduled, a `SPEC.CK-OPERATIONS` candidate, not a
churn. The §3 reply shapes are therefore the contract, not a transient snapshot; where a shape previously
read **PENDING-PIN (Q1)** it is now **pinned per-verb**.

---

## 3. The operation catalog

> **Status note (2026-06-13):** the per-op prose below was written at pgCK **v0.4.7** and still carries
> forward-references like `🔄 … → Tn (v0.4.x)` plus present-tense "today …" descriptions. Read these on the
> **Integrated axis**: "today …" = the behavior of the *deployed bundle* (pgCK **0.4.2**), which is still
> accurate. On the **pgCK axis**, every one of T1–T6 has since **released + attested** (through v0.4.13), so
> each `🔄 → Tn` is *pgCK-done* and merely awaiting the bundle bump (#14) to integrate. The authoritative,
> current, two-axis per-op status is the table in **§8**.

Each operation below is specified as: **canonical verb** (+ aliases, incl. the `task.*`→`instance.*`
window), **plane**, **semantics** (the fact it asserts or reads), **payload shape** (as shipped in
0.4.2 — citing the real shape; Q1/Q2-dependent parts marked PENDING-PIN), **reply shape**,
**lifecycle/provenance**, and **delegation** (whether it is a Tier-2 delegated affordance). Status
markers are per-op.

**Planes (CKP v3.9 §2.2 step 5 + CK-HARNESS-CL §6):**
- **instance** — the typed hot loop; executes on receipt, seals a fact or projects a typed read.
- **governance** — type changes; never executes on receipt, seals a `ckp:Proposal` that waits for
  consensus.
- **agent** — delegated affordances the kernel seals as executed *outside* the database (Tier-2); the
  door routes them out to the kernel's executor (the harness), which answers through `instance.*`.

**Lifecycle/provenance baseline (applies to every write):** a write is a **seal** — SHACL gate → HMAC
→ ledger append → proof mint, one transaction (CKP v3.9 Ring-1 `_seal`; §1.1). A successful write
therefore carries `verified:true` + a `proof_digest` and is independently re-verifiable
(`instance.verify`) and auditable (`instance.provenance`). A transition is additionally gated by the
**sealed transition map** (§3.A.transition). Reads do not seal.

---

### 3.A — Writes (instance plane): create · update · link · transition · retire

#### `instance.create` — assert a new typed instance ✅
- **Canonical verb:** `instance.create`. **Aliases (1 minor):** `task.create` / `kernel.create` /
  `edge.create` (v3.8). **Plane:** instance. **Delegation:** no.
- **Semantics:** seal a new instance of a declared type under the kernel's creation `inShape`. The
  fact asserted is "this instance now exists, typed T, with these properties, created_by this
  identity."
- **Payload shape — PINNED (Q2): the uniform typed body is the contract, shipped in pgCK v0.4.5.**
  `instance.create` accepts `{ type: <class IRI>, …fields }` and routes by `type` server-side against the
  kernel's **declared** creation shape (the `sh:property`/`sh:path` set in `ontology/*.ttl` → the kernel
  graph), via `ckp.create_typed`. The fields map to the type's declared property IRIs and seal through the
  required-props gate, so **`validate ⟺ seal` for any declared type** (not just Task/Goal). The legacy
  payload-key forms (`{task:{…}}` → `task.create`, `{name:…}` → `kernel.create`) remain accepted for
  back-compat during the alias window. **The `cklib` facade drops its transient `type → payload-key` map
  (TE-10)** and passes the clean typed body; the discriminator is a top-level `type` (no `task` sub-object).
- **Reply shape:** flat sealed receipt — `{ ok:true, id, verified:true, proof_digest }` (no instance
  body returned; NOTIFY §2.1, proven: `id=task-1781204803691037000`, `proof_digest=562eba4c…`). A
  consumer that wants the body reads it back (`get`/`query`) or relies on the granted sealed event;
  `cklib` optimistically inserts `{@id, @type, …fields}` into its cache and reconciles by-id on the
  authoritative event (`ck.js` `create`).
- **Lifecycle/provenance:** sealed; `verified:true` + `proof_digest`; emits a granted-scope event.

#### `instance.update` — patch an existing instance ✅
- **Canonical verb:** `instance.update`. **Alias:** `task.update`. **Plane:** instance. **Delegation:** no.
- **Semantics:** seal a patch to a sealed instance's data properties (NOT a lifecycle move — that is
  `transition`). The fact asserted is the new property values, sealed and proof-chained.
- **Payload shape:** `{ id, …patch }` (`ck.js` `update`).
- **Reply shape:** `{ ok, id, verified, proof_digest }` (write-receipt shape).
- **Lifecycle/provenance:** sealed. **Fidelity note — FIXED in pgCK v0.4.3:** the earlier `task.update`
  dropped non-allow-listed patch fields (e.g. `title`) and stringified numbers; v0.4.3 applies the full
  closed task-field patch with `->` type preservation. **🔄 generic per-declared-shape patch is T4
  (v0.4.11):** today the patch is Task-shaped; T4 keys it by the type's declared properties (the
  write-side mirror of generic `create`), re-sealed through the gate. Until then the client patches
  Task/Goal fields and degrades honestly on other types.

#### `instance.link` — assert a typed edge between instances ✅
- **Canonical verb:** `instance.link`. **Alias:** `edge.create`. **Plane:** instance. **Delegation:** no.
- **Semantics:** seal an edge `source —predicate→ target`. `predicate` MUST be in the kernel's
  **declared predicate set** (registry-checked, not parsed — CKP v3.9 §6.2). Object refs are `{"@id"}`
  id-nodes (CK-LIB-JS §4.2).
- **Payload shape:** `{ source, predicate, target: { '@id': target } }` (`ck.js` `link`). `notify`
  (§3.E) is sugar over this verb with `event:true`.
- **Reply shape:** `{ ok, id, verified, proof_digest }`.
- **Lifecycle/provenance:** sealed edge fact; proof-chained.

#### `instance.transition` — sealed-state-machine lifecycle move ✅ (T3 per-kernel sealed map released v0.4.10)
- **Canonical verb:** `instance.transition`. **Alias:** none (new in v3.9). **Plane:** instance. **Delegation:** no.
- **Semantics:** move an instance from one lifecycle state to another **only along an edge in the
  kernel's sealed transition map** (CKP v3.9 §4: the map is a sealed fact / I1; the gate is `_validate`
  inside `_seal`, "there is no application code to get wrong"). An illegal `to_state` resolves
  `{ok:false}` server-side; the consumer cannot move an instance to an illegal state.
- **Payload shape:** `{ id, to_state, evidence? }` (`ck.js` `transition`; reply field `.to`/`.from`).
- **Reply shape:** `{ ok, id, from, to, verified }` (proven Run B: `from:"draft", to:"review",
  verified:true`).
- **Lifecycle/provenance:** sealed transition; proof-chained; evidence per-edge.
- **State-key namespace split — RECONCILED in pgCK v0.4.3 (s37):** the gate now reads the **v3.7**
  `lifecycle_state` first (the IRI `task.create` writes), then a bare `state`, and writes both; the map is
  widened to the real `planned → in_progress → done` lifecycle. Pin for this layer: the lifecycle state
  lives under the **v3.7** IRI for Task/Goal. A freshly-created `planned` task now reads as `planned`
  (not the `draft` fallback).
- **🔄 Per-kernel sealed transition map is T3 (v0.4.10):** today the gate reads **one global
  `ckp.config` map**. T3 makes the transition map a **sealed kernel fact** (`set_transition_map` via the
  governance plane → the kernel graph), so different kernels have independent, governed maps. The client's
  **TE-7** then renders only the legal `to_state`s from the kernel's sealed map.
- **Facade:** `cklib`'s `transition` dispatches `instance.transition` natively (the `instance.update`
  ride is retired now that the verb is governed in-kernel); the handle signature is stable.

#### `instance.retire` — sealed retraction (not a delete) ✅ v0.4.3
- **Canonical verb:** `instance.retire`. **Alias:** none. **Plane:** instance. **Delegation:** no.
- **Semantics:** seal a **retraction** of a sealed instance — *"You cannot unseal a sealed fact. You
  can only seal a retraction"* (VISION §2.1). The instance is not deleted; a `retired:true` fact with
  a `reason` is sealed over it.
- **Payload shape:** `{ id, reason }` (`ck.js` `retire`).
- **Reply shape:** `{ ok, id, retired:true, reason, verified }` (`ckp.retire`).
- **Status:** **✅ shipped in pgCK v0.4.3** (`ckp.retire` + the `affordance_registry` INSERT; test s35).
  `cklib`'s `retire` honest-degrade retires once 0.4.3+ is the pinned bundle.

---

### 3.B — Typed reads (instance plane): get · query · reach · snapshot

> **No query language on the wire (MUST).** Reads are **named, typed, grantable** (CKP v3.9 P9). There
> is no client-side query engine, no SPARQL, no graph query. The only "query" is a **typed filter
> payload** the substrate shape-validates and compiles into a parameterized FILTER server-side. A read
> that cannot be enumerated cannot be granted, so it cannot exist. (CK-LIB-JS §0.1, §4.5.)

#### `instance.get` — fetch one instance by id ✅
- **Plane:** instance. **Delegation:** no. **Alias:** `instance.get` (unchanged).
- **Semantics:** read the current typed body of one instance.
- **Payload:** `{ id }`. **Reply (PENDING-PIN Q1):** field `.instance`/`.instances` (NOTIFY §2.1).
- **Cache discipline:** `cklib` reads cache-first; dispatches on miss; ingests (`ck.js` `get`).

#### `instance.query` — typed filter over a type ✅
- **Plane:** instance. **Delegation:** no. **Aliases:** `instances.list` (v3.8); `k.list` is `k.query`.
- **Semantics:** return instances of a type matching a **QueryShape** — a closed-operator typed filter.
  Operators are a **closed enum**: `eq, neq, lt, lte, gt, gte, contains, in` plus closed
  `order_by`/`limit`/`offset` (CKP v3.9 §6.1). No expression position exists for a caller to occupy.
- **Payload shape (0.4.2-as-shipped):** `{ type: <IRI>, filter: [{op,key,value}], limit?, offset? }`.
  `cklib` resolves bare type names to v3.7 ontology IRIs (`toIri`) and converts the facade filter
  object `{key:{op:val}}` into the `[{op,key,value}]` array with IRI keys (`ck.js` `toFilterArray`).
  A flat/object filter is rejected by the server (`cannot extract elements from an object`); the array
  form is required.
- **Reply shape (pinned per-verb, Q1):** field `.rows` (proven Run B: `rows:[{id,body}]`, count=1).
  `cklib` maps `.rows`→`.result` via `REPLY_FIELD`/`normalizeReply` so its cache ingests.
- **🔄 Derived QueryShape is T1 (v0.4.8):** today filter keys are **regex-validated**, not checked
  against the kernel's *declared* properties. T1 derives the permissible filter keys from the type's
  declared data-properties (`sh:property`/`sh:path`/`sh:datatype` in `ontology/*.ttl` → the kernel graph),
  with the closed operator enum — so an undeclared filter key is rejected server-side. The client's
  **TE-9** then sends only declared keys and **drops the client-side cache-filter fallback**
  (`ck.js` `_filterCache`); until T1 lands it falls back to `instances.list` then the cache filter,
  honestly.

#### `instance.reach` — bounded predicate traversal ✅ v0.4.6 (T2 declared-predicate gate released v0.4.9)
- **Plane:** instance. **Delegation:** no. **Alias:** none (new).
- **Semantics:** bounded traversal from a URN along a predicate. `via` MUST be a **full predicate IRI**;
  `depth ≤ path_max_depth`; modifier limited to `+` transitive (CKP v3.9 §6.2). The full generality of
  SPARQL paths stays in Ring 0.
- **Payload shape:** `{ from, via: <full IRI>, depth?, transitive? }`. **A bare predicate is rejected**
  (`undeclared_predicate`); the IRI form is required.
- **Reply shape (pinned per-verb, Q1):** field `.reached` (+ `.max_depth`).
- **Status:** **✅ traverses participant-created links in pgCK v0.4.6.** `edge.create` now materializes
  the traversable quad `<src> <pred> <tgt>` into `urn:ckp:<project>/edges` (`ckp.materialize_edge`), so
  `reach` follows real participant links transitively (test s40); a non-IRI endpoint seals the edge but is
  honestly `reachable:false`. **🔄 declared-predicate gate is T2 (v0.4.9):** `via` is still namespace-gated
  (`conceptkernel.org/%` / `urn:ckp:%`), not the kernel's *declared* predicate set (from `ontology/*.ttl`).
  The client's **TE-8** uses the declared predicates once T2 lands.

#### `instance.snapshot` — authorized bulk replay ⏳ (0.4.2 gap)
- **Plane:** instance. **Delegation:** no. **Aliases:** `snapshot.board`/`snapshot.bodies`
  (server-side coordination only; the client implements no fallback — CK-LIB-JS §4.2).
- **Semantics:** bulk replay of current state for a scope, **per-requester grant-checked** (closes
  F-E — CKP v3.9 §4). Used at `activate` to hydrate the typed cache (CK-LIB-JS §4.1; closes F-E
  client-side).
- **Payload:** `{ scope? }`. **Reply (PENDING-PIN Q1):** field `.instances`.
- **Status:** **⏳ — returns `snapshot_not_granted`** because the dispatch boundary injects no validated
  identity (`requester:null`). The grant-check **gate is shipped** (pgCK CI-E-3); what is missing is the
  injected requester. This is **F-A → pgCK T8 (v0.4.15)**: SPORE-GENESIS owns the identity-injection
  boundary; pgCK's T8 consumes the injected, validated identity so an authorized caller's snapshot is
  granted. The client's **TE-3** supplies the verified JWT and renders granted bodies once T8 lands;
  `cklib` honest-degrades to `[]` until then.

---

### 3.C — Proof (instance plane): verify · provenance

#### `instance.verify` — re-verify a sealed fact ✅
- **Plane:** instance. **Delegation:** no. **Semantics:** independently re-walk the ledger chain +
  HMAC + digest for an instance and confirm it is sealed and intact (Ring-1 `_verify`).
- **Payload:** `{ id }`. **Reply:** `{ verified, proof_digest, seq }` (`ck.js` `verify` derives
  `verified` from `proof_digest` when the field is absent).
- **Provenance:** this op *is* the proof check; it reads, does not seal.

#### `instance.provenance` — the proof-chain projection ✅
- **Plane:** instance. **Delegation:** no. **Alias:** `provenance`. **Semantics:** project the proof
  chain for an instance — the sealed body, the proof, and the ledger entries (Ring-1 `_ledger_read`).
- **Payload:** `{ id, depth? }`.
- **Reply shape (PENDING-PIN Q1):** **fields are `.body` / `.proof` / `.ledger`, NOT `.result`**
  (NOTIFY §2.1, proven Run B: `proof.digest=7bc5802d…`, `ledger:[2 entries]`, `verified:true`). `cklib`
  returns the raw proof-bearing reply (`ck.js` `provenance` returns `r.result ?? r`); a clean-shape
  projection is optional polish.
- **Status:** ✅ — full derivation-chain trace (entailment) is a deferred pgRDF ask (CKP v3.9 §10
  ask #1); direct-vs-inferred (`instance.explain`) is the shipped slice.

---

### 3.D — Pre-flight (instance plane): validate

#### `instance.validate` — dry-run the seal gate ✅ v0.4.3 (T5 full ValidationReport released v0.4.12)
- **Plane:** instance. **Delegation:** no. **Alias:** `ckp.validate`.
- **Semantics:** ask the substrate whether a candidate body **conforms** to the kernel's `inShape`
  **before** a write — a dry-run of the seal gate's `_validate` step (CKP v3.9 §2.2(4)). Returns the
  engine's `sh:ValidationReport` so a caller (esp. an LLM executor) can self-correct field-by-field
  before the real write (CK-HARNESS-CL §5).
- **Payload:** `{ body }` (`ck.js` `validate`).
- **Reply shape:** `{ conforms, missing_required[] }` today; `{ conforms, violations[] }` (typed) at T5.
- **Status:** **✅ the required-props gate ships in pgCK v0.4.3** (`ckp.validate_instance`): it runs the
  same `sh:minCount≥1` gate `ckp.seal` enforces against the kernel graph, so **`validate ok ⟺ seal
  accepts`** (test s37), returning `{conforms, missing_required[]}`. An unshaped type is valid silence.
  **🔄 the full SHACL `ValidationReport` is T5 (v0.4.12):** plumbing pgRDF's `pgrdf.validate(data,
  shapes)` → typed violations (datatype, cardinality, node-kind, pattern) through the verb. The client's
  **TE-5** surfaces the full report and **drops its boolean-grade local validate** once T5 lands; until
  then it consumes the `conforms`/`missing_required` form.

---

### 3.E — Addressing (instance plane): notify = link + event

#### `notify` — directed sealed edge that also emits an event ✅ (sugar over link)
- **Canonical verb:** **none of its own** — `notify` is **sugar over `instance.link`** with
  `event:true`. **Plane:** instance. **Delegation:** no. **Alias:** `notify` (v3.8 name).
- **Semantics:** "address a fact to another concept" — seal an edge `to —predicate→ …` carrying a body,
  and emit it on the granted event stream so the target's subscribers see it. This is the operations-
  layer meaning of cross-kernel addressing: **`notify` is `link` plus an event**, not a distinct
  primitive (`ck.js` `notify`: `do('instance.link', {source:to, predicate, body, event:true})`;
  CK-LIB-JS §4.2). The harness's cross-kernel link (`<W> —notifies→ <K>`) is exactly this op on the
  wire (CK-HARNESS-CL §4.1).
- **Payload shape:** `{ source: to, predicate, body, event: true }`.
- **Reply shape:** `{ ok, id, verified, proof_digest }` (the underlying `link` receipt).
- **Lifecycle/provenance:** sealed edge + emitted event.
- **PENDING — pgCK (the harness ask):** the canonical mapping of a `notify` `{p,o}` fact to the
  `instance.link {source,predicate,target}` shape at the harness's G3 (CK-HARNESS-CL §12 G3); pin the
  `notify`→`instance.link` reduction in the contract so the harness and `cklib` agree on the shape.

---

### 3.F — Governance plane: propose · vote · apply

> **The governance plane never executes on receipt (P6).** Any write touching the kernel's **type**
> (shapes, transition maps, affordance descriptors, quorum, materialization policy) seals a Proposal
> that waits for Votes and applies only through consensus (CKP v3.9 §5). Proposals and Votes are
> ordinary sealed instances. ✅ — the governance trio round-tripped live (epoch 1→2).

#### `kernel.propose_change` — seal a typed change-proposal ✅
- **Plane:** governance. **Delegation:** no. **Maps from:** `k.propose`.
- **Semantics:** seal a `ckp:Proposal{pending}` carrying a **typed operation set** (`add_class`,
  `add_property`, `modify_shape_constraint`, `add_affordance`, `set_transition_map`, `set_quorum`,
  `set_materialize_policy`) validated by `ProposalShape`. The client never authors Turtle (CKP v3.9
  §5.2 fences the one `raw_ttl` path server-side).
- **Payload shape (0.4.2-as-shipped):** `{ op, requires_quorum, detail }` (`ck.js` `propose`).
- **Reply shape (PENDING-PIN Q1):** field `.proposal_iri` (proven:
  `ckp://Proposal#proposal-1781204804165887000`).

#### `kernel.vote` — seal a vote on a proposal ✅
- **Plane:** governance. **Delegation:** no. **Maps from:** `k.vote`. **Semantics:** a human approval
  is an ordinary sealed `ckp:Vote`, `ckp:about` the proposal.
- **Payload shape (0.4.2):** `{ about: <proposal IRI>, value }` (`ck.js` `vote`).
- **Reply shape (PENDING-PIN Q1):** `{ quorum_met, approvals, … }` (proven: `quorum_met:true,
  approvals:1`).

#### `kernel.apply` — quorum-gated apply ✅ (effect live, v0.4.5)
- **Plane:** governance. **Delegation:** no. **Maps from:** `k.apply`. **Semantics:** apply the
  proposal **only if quorum is satisfied** — one txn: `_graph_apply` + `_recompile` (+ `_materialize`
  per policy), bumping the kernel epoch (CKP v3.9 §5.1, Ring-1 composition).
- **The effect is real (pgCK v0.4.5):** `apply` translates the passed op (`ckp._op_to_ttl`) and
  `copy_graph`s the staged shape into the kernel graph (`ckp.apply_shape_ttl`) **before** the epoch bump —
  so a quorum-approved `add_property` **changes the type**: the next `instance.create` of that type
  requires the new property (test s39). Earlier, apply bumped the epoch + sealed "applied" without a
  shape change; that gap is closed.
- **Payload shape:** `{ about: <proposal IRI> }` (`ck.js` `apply`).
- **Reply shape (pinned per-verb, Q1):** `{ state, epoch, applied:{graph_changed, …} }` (proven:
  `state:"applied", epoch:2`; v0.4.5 adds `applied.graph_changed`).
- **Facade gating:** before CI-D, `cklib` returned `{ok:false, error:'gov_plane_unavailable'}`; the
  plane is now live, signatures unchanged (`ck.js` `_gov`).

---

### 3.G — Discovery (instance plane): affordances

#### `affordances` — enumerate the granted verb set ⏳ (name + projection)
- **Canonical verb:** **`affordances`** (NOT `kernel.affordances`). **Plane:** instance (a read).
  **Delegation:** no.
- **Semantics:** return the kernel's declared affordance descriptors **intersected with the verified
  identity's grants** — the set a tool or LLM agent enumerates to discover what it may do (CKP v3.9 P3;
  CK-LIB-JS §4.2, §6). See §6 for the identity ∩ grants rule.
- **Payload:** `{}` (kernel from the door's `kernel_urn`).
- **Reply shape (PENDING-PIN Q1):** field `.affordances`. **The descriptor shape is server-defined** —
  the consumer passes through whatever pgCK returns, unshaped (`{name, plane, inShape?, granted}` is
  indicative, not client-enforced; CK-LIB-JS §4.2).
- **Status:** ⏳ — `cklib` historically dispatched `kernel.affordances`; the 0.4.2 registry name is
  **`affordances`** (`dispatch.sql`). `cklib` fixes its dispatch name. **PENDING — pgCK:** confirm
  `affordances` is canonical (won't be renamed to a `kernel.`-prefixed form). Per-identity projection
  is the §6 ⏳ item (the projection degrades to the full surface until grants are enforced server-side).

---

### 3.H — Match (instance plane): concept.match (governed query affordance)

#### `concept.match` — ranked label search ✅ (🔄 convert built-in to governed form → T6)
- **Plane:** instance. **Delegation:** no. **Semantics:** the reference **governed query affordance**
  (CKP v3.9 §6.3) — label search across the sealed + pending graphs with ranked candidates. The SPARQL
  text is **authored once, sealed via the governance plane, compiled at apply-time**, exposed under the
  verb with a typed parameter shape. **Callers bind parameters; they never see, choose, or alter the
  query text** — the only sanctioned sense of "SPARQL affordances for clients."
- **Payload shape:** `{ term }` — field is `.term` IN (a flat `{text}` is rejected `invalid_term`).
- **Reply shape (pinned per-verb, Q1):** `{ term, count, candidates }` — field `.candidates` OUT.
- **Status:** **✅ the governed query-affordance MECHANISM ships in pgCK v0.4.7** (`ckp.register_query_affordance`
  compiles a sealed query into `ckp.plans(kernel,verb,epoch)` + a `plane='query'` registry row;
  `ckp.run_query_affordance` binds typed param VALUES into the author's `$name$` placeholders — test s41).
  Any kernel can now declare its own governed query. The built-in `concept.match` returns ranked candidates
  (v0.4.3 fixed the label field), but is **🔄 still a hardcoded label search**: **T6 (v0.4.13)** seeds it as
  a governed query at bootstrap so the built-in runs through the same governed path. The client's **TE-4**
  calls the governed form (typed params, never query text); the `{term}` shape is this affordance's
  instance, not a generic match contract.

---

### 3.I — The `agent.*` delegated catalog (agent plane) — Tier-2 affordances

> **The agent plane is the delegation seam.** These verbs are sealed as **delegated** affordances
> (`ckp:plane = instance` with a sealed delegation fact, per CK-HARNESS-CL §6); `ckp.dispatch` routes
> them **out** to the kernel's Tier-2 executor (the Claude harness), which executes and answers
> **through `instance.*`** (§4). Names are final per CK-HARNESS-CL §6; wire aliases in parentheses.

| Verb | Wire alias | Plane | Status | Semantics |
|---|---|---|---|---|
| `agent.execute` | `execute` | agent (delegated) | ✅ wire / ⏳ registry row | run one task through the Claude executor; answer **typed facts** validated against the declared output shape (SEMANTIC OUT), landed back through `instance.create`/`instance.transition` |
| `agent.presence` | `presence` | agent (delegated) | ✅ wire / ⏳ registry row | participant presence, relayed onto the kernel's event stream (the harness is the kernel's processor; browsers never publish events directly) |
| `agent.say` | `say` | agent (delegated) | ✅ wire / ⏳ registry row | collaboration chat, relayed onto the kernel's event stream |
| `agent.steer` | — | agent (delegated) | ⏳ | queue a guidance turn for the live session |
| `agent.interrupt` | — | agent (delegated) | ⏳ | cancel the in-flight turn (requires the operator grant once F-A lands) |
| `agent.tool_approve` | — | agent (delegated) | ⏳ | resolve a pending ToolCall (§5) |
| `agent.close` | — | agent (delegated) | ⏳ | drain and close the session |

- **Payload typing (SEMANTIC IN/OUT — CK-HARNESS-CL §5):** the input payload is `{id, title, user?,
  context?, expect?}` where `expect` is the **kernel's sealed output shape** (⏳ until `affordances`/
  shape reads bridge; a built-in default ✅ today). The output is `{ok, id, subject, facts:[{p,o}],
  by}` — facts validated against `expect` **before anything lands** (P4). A valid SEMANTIC OUT is *by
  construction* a sealable `instance.create`/`transition` payload.
- **Wire subjects (transport detail, CK-HARNESS-CL §4.1):** task→harness on
  `input.kernel.<K>.action.execute`; lifecycle on `event.kernel.<K>.harness.{online,started,done}`;
  typed result on `result.kernel.<K>.execute`. These are the **four-tuple's wire form** — the
  operations meaning is delegation-routed `ckp.dispatch`.
- **Delegation:** YES — this is the only operation group that routes outward (§4).
- **PENDING — pgCK (the harness ask):** confirm the §6 `agent.*` names are stable and seal the
  registry rows (incl. the delegation facts) for the catalog (CK-HARNESS-CL §12 G6).

---

## 4. Delegation & Tier-2 executors

The delegation seam is a **first-class operations concept**, not an error path.

- **The sealed delegation fact.** A reply `{ok:false, delegate:true}` is **a sealed fact, not a
  failure or a fallthrough** (CKP v3.9 §2.2 step 1; P3; CK-HARNESS-CL §0). It means: "this verb is
  governed by the kernel as executed **outside** the database." A consumer MUST treat `delegate:true`
  as **routing**, never as error (CK-HARNESS-CL §11.2).
- **The route.** When an op is declared delegated, `ckp.dispatch` routes the four-tuple **out** to the
  kernel's per-kernel serverless executor — **the Tier-2 delegate**. For the `agent.*` catalog (§3.I)
  that executor is the **Claude harness** (`ck-harness-cl`): it is not an external client *imitating* a
  participant; it is the **named Tier-2 delegate of its kernel** — the thing pgCK routes a verb to when
  the kernel has sealed the fact that this verb runs outside Ring 1 (CK-HARNESS-CL §0).
- **The answer path.** The executor **answers through `instance.*`** — it lands its result by calling
  `instance.create` (the result instance) + `instance.transition` (the task → `done`, gated by the
  sealed transition map) + `instance.link` (`result —produced_by→ task`) (CK-HARNESS-CL §5). So a
  delegated op's *output* re-enters through the ordinary instance-plane door and is SHACL-gated,
  sealed, proof-chained, and event-emitted like every other fact. **The intelligence lives outside the
  membrane; the meaning stays sovereign.**
- **What a delegate may hold (P8).** The executor holds **no capability beyond `ckp.dispatch` + its
  kernel's topics**. It never sees SPARQL, graph ids, or quads (P1); its results are facts with
  provenance or they are nothing (I2). Even with DB credentials it could only `EXECUTE ckp.dispatch`
  (CKP v3.9 §7).
- **Status (⏳, CK-HARNESS-CL §4.3 / §12):** delegation routing over NATS rides on the dispatcher
  bridge forwarding the full sealed registry (`kernel_urn` from subject, `identity` from connection).
  Until it lands, the harness's live results are **typed messages explicitly marked unsealed**, not
  sealed facts — and the UI says so. The op meanings here are stable across that bridge landing.

---

## 5. Tool-permission as a sealed transition map

Tool-gating is a **governance-of-tools operations pattern**, expressed with the same instance machinery
as everything else (CK-HARNESS-CL §8; CKP v3.9 §4). It is a first-class operations concept because it
is how a delegated executor's *tool calls* are themselves governed.

1. A Claude `tool_use` ⇒ **`instance.create` a `ToolCall` instance in state `pending`** (⏳).
2. The ToolCall's **transition map is a sealed fact on the kernel**: `pending → approved` requires the
   governor grant (or a sealed **auto-approve edge** for a tool class); `pending → denied` likewise;
   `approved → running → ok|error` are executor-driven.
3. The executor **parks the turn until the ToolCall leaves `pending`**. An illegal transition **cannot
   land** — the gate is `_validate` inside `_seal`, not executor code ("there is no application code to
   get wrong").
4. **`--dangerously-skip-permissions` becomes exactly one sealed fact:** an auto-approve edge for `*`
   granted to the operator role — visible in the registry, revocable by a governance-plane proposal
   (§3.F), carried in every proof chain.

The operations-layer consequence: **tool permission is not a flag, it is a transition.** Granting,
revoking, or auditing a tool capability is a `propose`/`vote`/`apply` over the ToolCall transition map
plus the sealed `agent.tool_approve` (§3.I) resolution — entirely inside the contract.

- **Status:** ⏳ — ToolCall instances + the sealed transition map are CK-HARNESS-CL §12 G4 (kernel TTL
  + harness, on the dispatcher bridge). Until then the executor runs tools under an explicit, stated
  operator posture (CK-HARNESS-CL §8).

---

## 6. Identity, grants, affordance discovery

- **Identity is server-derived (MUST).** It is the verified OIDC-JWT at the Envoy edge, re-checked at
  seal-time (TR-02 / F-A). **No consumer ever asserts identity in a payload** (§2). Envoy =
  **authentication**; pgCK = **authorization** (implicit-deny grants checked at seal-time on the
  post-Envoy identity — CKP v3.9 §2.2 step 3, §7; CK-LIB-JS §4.10).
- **Affordance discovery = declared verbs ∩ identity grants (MUST).** `affordances()` (§3.G) returns
  the kernel's declared affordance descriptors **intersected with the verified identity's grants**.
  The consumer enumerates this set to know what it may do; it grows as ontology is governed in, with no
  consumer change.
- **Implicit-deny (MUST).** An ungranted verb is **rejected at the dispatch gate** (`{ok:false}`) —
  normal flow control, not an exception. A read that cannot be enumerated cannot be granted, so it
  cannot exist (P9). There is **no client-side authorization** — hiding an ungranted verb is
  ergonomics, never enforcement; the boundary is structural and server-side (CK-LIB-JS §4.10).
- **No role taxonomy in the consumer.** Consumers carry **no** `owner`/`participant` branch. Roles are
  pgCK-side grant bundles; add a role by issuing a different bundle — **zero consumer change**
  (CK-LIB-JS §4.10).
- **Status (⏳, F-A + CI-A/CI-B + SPORE Phases 0–1):** per-identity grants + sealed affordance routing
  are *specified-not-built*. Until they land, the affordance projection **degrades to the full surface
  — honestly, not silently**: the set is shaped the moment pgCK can answer "what may this identity do
  here?", and not before. Consumers ship the projection mechanism; pgCK supplies the truth it projects.

---

## 7. The contract questions — PINNED (pgCK RESPONSE, 2026-06-12)

These two questions decided whether this operations layer encodes a **stable** contract or a transient
snapshot. They are **now answered** by pgCK's `…wire-contract-pin-operations-RESPONSE.md`; the §3
reply/payload shapes are the **ratified contract**, not a snapshot.

### Q1 — The reply envelope → **PINNED: per-verb fields are FINAL for the v3.9 wire.**

0.4.2 carries **no uniform `.result`**; each verb returns its own field:
`instance.query`→`.rows`, `kernels.list`→`.kernels`, `instance.get`→`.instance`/`.instances`,
`instance.reach`→`.reached`, `concept.match`→`.candidates`, `instance.snapshot`→`.instances`,
`instance.provenance`→`.body`/`.proof`/`.ledger`, `instance.create`→flat `.id`/`.verified`/
`.proof_digest`, governance→`.proposal_iri`/`.quorum_met`/`.state`, `affordances`→`.affordances`.

- **Answer (pinned):** the **per-verb field names are FINAL** for the v3.9 wire — key `normalizeReply`
  off the per-verb map (the verbatim list above) as the contract. A uniform `.result` is **not scheduled**;
  if it ever ships it is **ADDITIVE** (a `.result` mirror alongside the retained per-verb fields), so the
  map never churns.
- **cklib posture (confirmed correct):** `normalizeReply(verb, reply)` fills an **absent** `.result`
  from the `REPLY_FIELD` per-verb map — it **only fills when `.result` is absent**, so it stays correct
  whether or not a future additive `.result` lands. No change required.

### Q2 — `instance.create` routing → **PINNED: the uniform typed body is the target, shipped in v0.4.5.**

Payload-key routing was the *concretion*, not the contract. The **target is a uniform `{type, …fields}`
body routed by `type` server-side** against the kernel's declared creation shape — and it **shipped in
pgCK v0.4.5** (`ckp.create_typed`; §3.A).

- **Answer (pinned):** `instance.create` accepts the uniform typed body now. The legacy `{task:{…}}` /
  `{name:…}` payload-key forms remain accepted for back-compat during the alias window; the discriminator
  is a top-level `type` (no `task` sub-object).
- **cklib action (TE-10):** **drop** the transient `type → payload-key` map — pass the clean typed body.
  The map was tagged INTERNAL/transient for exactly this; its removal is non-breaking (the uniform body is
  additive).

> **Q1/Q2 are pinned; this spec's §3 reply/payload shapes are the ratified contract.** Former
> "PENDING-PIN" shapes are now per-verb-pinned (Q1) or uniform-typed (Q2).

---

## 8. Honesty appendix — per-op status table (two axes, refreshed 2026-06-13)

A verb is "done" only when BOTH axes hold:
- **pgCK** — released + SLSA-attested on pgCK's wire. Floor = **v0.4.13** (GitHub-released sequentially
  through 2026-06-12; `LATEST.md` attested at 0.4.13).
- **Integrated** — carried in a consumable bundle AND live-verified end-to-end. Floor = **pgCK 0.4.2 /
  `ociger-ck-allinone:v0.7.18` / `ck-lib-js:1.5.0`** — unchanged since v1.5.0; the bundle still bakes 0.4.2,
  so everything past it is pgCK-released but **not yet integrated** (bundle gate #14).

Integrated states: **✅ vX** live-verified at that release · **🔨 TE-n** client built-ahead, mock-only
(commits on `ck-lib-js.task.v1.6.0-typed-edge`, not released) · **⏳** released-but-bundle-gated / F-A·F-C.

| Op (canonical verb) | pgCK | Integrated | Evidence / note |
|---|---|---|---|
| `instance.create` | ✅ v0.4.5 typed | 🔨 TE-10 (legacy form ✅ v1.5.0) | uniform `{type,…}`→`create_typed` (s38); Q2 pinned |
| `instance.update` | ✅ v0.4.11 (T4) | 🔨 TE-6 | `{id,patch:{…}}`→`update_typed`; declared-shape patch, undeclared rejected |
| `instance.link` | ✅ v0.4.9 (T2) | ✅ v1.5.0 (client predicate-agnostic, TE-8) | declared predicate set; `{"@id"}` refs |
| `instance.transition` | ✅ v0.4.10 (T3) | 🔨 TE-7 | native per-kernel sealed map (s44); illegal move surfaces `allowed` |
| `instance.retire` | ✅ v0.4.3 | ⏳ bundle-gated | `ckp.retire`+registry (s35); absent from the 0.4.2 bundle |
| `instance.get` | ✅ (field `.instance`) | 🔨 TE-9 (reply-field fix) | v1.5.0 mapped the wrong field (`instances`); TE-9 corrects to `.instance` |
| `instance.query` | ✅ v0.4.8 (T1) | 🔨 TE-9 (legacy read ✅ v1.5.0) | declared QueryShape, short keys, `rows:[{id,body}]` |
| `instance.reach` | ✅ v0.4.9 (T2) | ⏳ bundle-gated | materialized quads (s40); 0.4.6+ absent from the 0.4.2 bundle |
| `instance.snapshot` | ⏳ F-A (T8) | ⏳ F-A | `snapshot_not_granted` — no injected requester |
| `instance.verify` | ✅ | ✅ v1.5.0 | core proof check (live) |
| `instance.provenance` | ✅ | ✅ v1.5.0 | proof-chain projection (live); fields `.body`/`.proof`/`.ledger` pinned |
| `instance.validate` | ✅ v0.4.12 (T5) | 🔨 TE-5 (gate shipped v0.4.3) | full SHACL `ValidationReport`; client surfaces verbatim |
| `notify` (=`link`+event) | ✅ | 🔨 TE-8 (base ✅ v1.5.0) | sugar over `link`; declared predicate |
| `kernel.propose_change` | ✅ | ✅ v1.5.0 | governance trio round-tripped live (epoch 1→2) |
| `kernel.vote` | ✅ | ✅ v1.5.0 | `quorum_met:true, approvals:1` |
| `kernel.apply` | ✅ effect v0.4.5 | ✅ v1.5.0 (epoch); 🔨 type-mutation | `_graph_apply` mutates the type (s39); v1.5.0 verified the epoch bump on 0.4.2 |
| `affordances` | ✅ name | ✅ v1.5.0 (name); ⏳ projection | per-identity ∩ grants projection = F-A/T8 |
| `concept.match` | ✅ v0.4.13 (T6) | ⏳ TE-4 not built | governed query affordance (s41); client adoption pending |
| `agent.execute` | ✅ wire / ⏳ registry | ⏳ | **delegated**; typed-facts round-trip live; registry row pending (G6) |
| `agent.presence` / `agent.say` | ✅ wire / ⏳ registry | ⏳ | **delegated**; relayed; registry row pending |
| `agent.steer`/`interrupt`/`tool_approve`/`close` | ⏳ | ⏳ | **delegated**; session control on the bridge + ToolCall map (G3/G4) |

**Legend:** pgCK ✅ = released + attested on pgCK's wire · ⏳ = not yet handled (F-A/F-C) · ❌ = gap (none).
Integrated ✅ vX = live-verified at that release · 🔨 TE-n = client built-ahead, mock-only · ⏳ = released-
but-bundle-gated. Q1 (per-verb fields) / Q2 (uniform typed create) are **pinned** (§7); the §3 shapes are
the ratified contract.

**Bottom line.** pgCK has released the *entire* T1–T6 typed-edge surface (through v0.4.13, attested). The
client mirrors it built-ahead (TE-10→TE-5, 27/27 mock). **Nothing past pgCK 0.4.2 is integrated or
live-verified** — the single gate is the bundle bump (#14). When `ociger-ck-allinone` carries pgCK ≥0.4.13,
one `verify-v160` pass flips the 🔨/⏳ Integrated column to ✅ and v1.6.0 becomes tag-ready.

---

*End of SPEC.CK-OPERATIONS.v1.6.0.md (tracked on the v1.6.0 branch from 2026-06-13; publish gated on pgCK ratification; grounded in pgCK v0.4.13 + the SPEC.pgCK.ROADMAP.v0.5.0 track set T1–T6 released; integration gated on the bundle bump #14; Q1/Q2 pinned).*
