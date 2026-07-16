# SPEC.CK-LIB-JS.v1.5.5 — CK.Lib.Js Normative Specification

| Field | Value |
|---|---|
| Version | v1.5.5 |
| Date | 2026-07-16 |
| Status | **Released — SLSA-attested + byte-verified** |
| Protocol | **CKP v3.9.1 "Critical Isolation"** |
| Grounding | `ck-lib-js:1.5.5` · pgCK **v0.4.22 (pg18)** · pgRDF **v0.6.20 (pg18)** · first **pg18 / trixie** `ck-allinone` bundle |
| Supersedes | `SPEC.CK-LIB-JS.v1.5.4` (kept for history) |

**What v1.5.5 is:** the dispatch-only client for **CKP v3.9.1**, aligned to the **first pg18 substrate**
(pgCK 0.4.22 / pgRDF 0.6.20). Two additions over v1.5.4:
1. **Client ergonomics (Layer 1a)** — typed `Ref` (`.urn`/`.local` + callable), lossless `transition`,
   single-actor `govern`/`setTransitionMap`. Reduce the code an app writes; pure client sugar over the
   same dispatch — no new verb, no new authority.
2. **`msg.by` / `msg.seq`** — the client surfaces the **server-attributed sender** (pgCK F4) on every
   delivered event, read-only. The client never asserts, verifies, or derives identity.

No new architecture; the dispatch-only floor is unchanged from v1.5.0.

> **Not in v1.5.5:** Concept Kernel Notation (CKN) / any `ckn` surface — a **v3.10 draft/roadmap**
> exercise, not a v3.9.1 feature (§6). This client advertises v3.9.1 only.

---

## 0. Critical alignment

CK.Lib.Js is the JS client of a **version-locked** system; each release is verified against a specific
substrate before it ships:

| Component | Repo | Aligned version (v1.5.5) | Role |
|---|---|---|---|
| **CK.Lib.Js** (this) | `ConceptKernel/CK.Lib.Js` | `1.5.5` | JS client — authenticate + dispatch |
| **pgCK** | `styk-tv/pgCK` | `0.4.22` (**pg18-only**) | substrate — governed verbs, seal, ledger, server-derived identity |
| **pgRDF** | `styk-tv/pgRDF` | `0.6.20` (pg18) | engine — RDF/SPARQL/SHACL under pgCK |
| **ck-allinone bundle** | `sporaxis-com/oci-germination` | first **pg18 / trixie** (glibc ≥ 2.38) | the runnable substrate the client verifies against |

The pg18 substrate requires a glibc ≥ 2.38 base (trixie/noble) — a **pgRDF/pgCK native** requirement.
CK.Lib.Js ships **`FROM scratch`** (`ckp:static`: vendored JS only, no native code, no glibc), so the
base is transparent to the client. A cklib release is "shipped" only after its surface is live-verified
over real NATS-WSS against the aligned substrate.

---

## 1. Floor (unchanged from v1.5.0)

**Dispatch-only, no RDF, no quad store, no SPARQL, no query engine.** The client authenticates and
dispatches typed payloads over NATS-WSS; nothing else crosses. Three zero-dependency, vendored,
air-gapped modules: `ck.js` (L2 facade), `ck-client.js` (L0 NATS-WSS transport + JWT), `ck-store.js`
(L1 typed cache + reactive reads). Vendored `./vendor/{nats.ws,msgpack}.js`; no runtime CDN.

**Identity (v3.9.1 δ / TR-02):** identity is **server-derived, never client-asserted.** The browser
holds the OIDC JWT; the client presents it on the upgraded NATS-WSS connection (`login()` → token →
reconnect) and sends only `{verb, kernel_urn, payload}` per message — **there is no identity field to
set.** The server derives the requester from the verified token and stamps `created_by`; a forged
payload identity is ignored. (The verification mechanism is operator/substrate — out of scope here.)

---

## 2. Activate a kernel

```js
import { CK } from './ck.js';
const k = await CK.activate('pgCK.Task', { wssEndpoint: 'wss://host/wss', realm: 'myrealm', gov: 'pgCK', hydrate: true });
```

Constructs the L0 transport + connects → L1 store → fetches affordances (`'affordances'`) → subscribes
the granted result + event scope (incl. `result.kernel.<GOV>.>` for gov-door replies) → hydrate →
returns the handle. `affordances = declared rows ∩ the identity's grants`; nothing else is callable.

---

## 3. Operation → verb table

```js
const OP_VERB = { create:'instance.create', update:'instance.update', transition:'instance.transition',
  link:'instance.link', query:'instance.query', list:'instance.query', get:'instance.get',
  reach:'instance.reach', verify:'instance.verify', provenance:'instance.provenance',
  snapshot:'instance.snapshot', validate:'instance.validate', retire:'instance.retire',
  propose:'kernel.propose_change', vote:'kernel.vote', apply:'kernel.apply', match:'concept.match' };
```
`doFresh` dispatches a **consumer-sealed** derived verb (§4.4); `govern`/`setTransitionMap` compose
`propose`/`vote`/`apply` (§4.5) — neither is a new verb.

---

## 4. Handle methods

### 4.1 Write operations

#### `k.create(type, body?)` → typed `Ref`
Returns a **callable Ref**: data fields `{ok, id, urn, local, verified, proof_digest, seq}` **plus** bound
methods `.transition/.update/.link/.verify/.get` so you operate on the new instance without juggling its id.
`.urn` = full IRI when the reply carries one, else falls back to `.id`; `.local` = bare local part
(no `bare()` surgery). Non-breaking: existing consumers reading `.ok`/`.id` are unaffected.
```js
const t = await k.create('urn:ckp:demo/type/Task', { title: 'Ship v1' });
await t.transition('sealed');    // routes to k.transition(t.id, 'sealed')
```

#### `k.transition(id, toState, evidence?)` → `{ok, id, from, to, source, allowed?, proof_digest}`
**Lossless** — surfaces `{from, to, source}` verbatim on success; an illegal move returns
`{ok:false, error:'invalid_transition', allowed?}` (`allowed` when the substrate provides it). No
dropping to raw `do()` to read the from-state.

#### `k.update / k.link / k.notify / k.retire`
`update(id, patch)` re-seals declared props; `link(source, predicate, target)` — `target` is a plain IRI;
`notify(from, predicate, to, body?)` — a sealed fact that is also a delivered event; `retire(id, reason?)`
— a proof-chained sealed retraction.

### 4.2 Read operations
`k.get(id)` (cache-first) · `k.query(type, filter?)` (short-localname filter keys → declared IRIs;
undeclared rejected; honest `[]`) · `k.reach(from, via)` (bare id or `@id` — pgCK 0.4.14) ·
`k.snapshot()` · `k.match(term)`.

### 4.3 Validation & proof
`k.validate(body)` → full W3C SHACL report · `k.verify(id)` → `{verified, proof_digest}` ·
`k.provenance(id, depth?)` → derivation chain.

### 4.4 Derived reads — the scoring loop
A consumer seals a `{formula, scope}` verb over pgCK's generic `plane='derived'`; the client is
verb-generic (reads `ok`/`value`/`recompute_in_progress`; `scored`/`freshness`/`net`/`volume` pass
through). **No consumer math/formula/band enters the client.**
- `isRecomputing(reply)` → recognizes the honest `{ok:true, recompute_in_progress:true}` degrade.
- `k.doFresh(verb, payload, opts?)` → dispatches; while recomputing, re-dispatches with backoff (a
  re-dispatch **joins** the in-flight build — pgCK#4); returns the value fresh-only. On budget
  exhaustion the last honest reply is returned verbatim — never a stale/cached/interpolated value.

### 4.5 Governance plane
`propose(op, detail, quorum?)` · `vote(iri, value)` · `apply(iri)`. `propose()` normalizes the proposal
handle to a stable `.iri` (no reply-field guessing). **Single-actor sugar:**
- `k.govern(op, detail, opts?)` → `propose → vote(approve) → apply` at quorum 1 (default), returning
  `{ok, proposal, state, epoch}`. For a real multi-party quorum, use `propose`/`vote`/`apply` directly.
- `k.setTransitionMap(targetClass, map, opts?)` → seals a type's transition map in one governed act.

`add_property` detail uses `minCount` (integer; `0` = optional), NOT `required`. All degrade to
`{ok:false, error:'gov_plane_unavailable'}` when governance isn't granted.

### 4.6 Discovery & escape hatch
`k.affordances()` (declared ∩ granted) · `k.do(verb, payload?, opts?)` (generic dispatch).

### 4.7 Reactive reads + the sender surface (L1 + transport)
```js
k.bind('urn:ckp:demo/type/Task', (inst) => render(inst));   // pattern subscription (exact / type / bare)
k.bindOnce(urn, fn); k.view(urn); k.urn(urn);               // one-shot / CKView / sync cache read
```
Delivered events/results carry a **read-only sender surface** (pgCK **F4**):
- **`msg.by`** — the **server-attributed sender** (`urn:ckp:participant:<id>`), read from the delivered
  event's `by` header. `null` when absent (never fabricated). The client **only reads** it — it never
  asserts, verifies, or derives identity; the sealed instance's `created_by` matches `by`.
- **`msg.seq`** — the ledger `Ck-Seq` on the event.

This is how a multi-party session shows who-said-what at volume with **no per-client identity logic.**

### 4.8 Lifecycle
`await k.close()` / `k.dispose()`.

---

## 5. Exports

**`ck.js`:** `CK`, `ConceptKernel`, `normalizeKernel`, `isRecomputing`, `ckOn`, `wireCkOn`
**`ck-store.js`:** `CKStore`, `CKView`, `CKSubject`, `ckBind`, `instanceUrn`, `instanceType`, `instanceEdges`
**`ck-client.js`:** `CKClient` (L0 transport)

---

## 6. What is NOT in v1.5.5

**Concept Kernel Notation (CKN) / `ckn` — NOT a v3.9.1 feature.** A **v3.10 draft/roadmap** exercise;
any notation compiler is out of the advertised v1.5.5 surface. This client speaks the governed verb
surface only.

Roadmap: `dispatchMode:'v3.9'` default · `task.*` alias retirement · minified build + TypeScript
declarations · genome-derived enums (declared states/verbs) once pgCK exposes the declared genome.

---

## 7. Known items

| ID | Item | Status |
|---|---|---|
| lifecycle_state | initial state under the gate-read core NS | ✅ resolved (pgCK 0.4.21) |
| server-derived identity | verified requester on seal + `by` on events | ✅ shipped (pgCK 0.4.22 F-group); client reads `msg.by` |
| snapshot | verified-identity cache hydration | ⏳ honest-degrade (`[]`) until granted |

---

## 8. Transport reference

Full NATS subject grammar, headers, codec, dispatch modes: **`SPEC.CK-OPERATIONS.v1.5.1.md`**.
Governed verbs → `input.kernel.<GOV>.action.<verb>`; events → `event.kernel.<K>.<entity>.<verb>`;
headers `Trace-Id`, `Ck-Verb`, `Ck-Kernel`, `Ck-Seq`, `by`, `Content-Type`; codec JSON / MsgPack.
