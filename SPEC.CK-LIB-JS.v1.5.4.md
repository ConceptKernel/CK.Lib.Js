# SPEC.CK-LIB-JS.v1.5.4 — CK.Lib.Js Normative Specification

| Field | Value |
|---|---|
| Version | v1.5.4 |
| Date | 2026-07-10 |
| Status | **Released — SLSA-attested + byte-verified (2026-07-06)** |
| Protocol | **CKP v3.9.1 "Critical Isolation"** |
| Grounding | `ck-lib-js:1.5.4` (attested) · pgCK **v0.4.21** · pgRDF **v0.6.19** · `ociger-ck-allinone` **v0.7.2x** |
| Supersedes | `SPEC.CK-LIB-JS.v1.5.1` (kept for history) |
| Next (roadmap) | GitHub project board + release milestones |

**What v1.5.4 is:** the dispatch-only concept-kernel client for **CKP v3.9.1**, live-verified against
the aligned `ck-allinone v0.7.2x` runtime. Adds the **scoring-loop read surface** — `doFresh` +
`isRecomputing` (honest `recompute_in_progress` handling over pgCK's `plane='derived'` verb, pgCK#4
contract) — and folds in the server-side fixes that resolved v1.5.1's open items (reach id-form,
enforcement graph, lifecycle-state namespace). No new architecture; the dispatch-only floor is
unchanged from v1.5.0.

> **Not in v1.5.4:** Concept Kernel Notation (CKN) and any `ckn`/notation surface. **Notation is a
> v3.10 draft/roadmap exercise, not a v3.9.1 feature** — see §6. This client advertises v3.9.1 only.

---

## 0. Critical alignment

CK.Lib.Js does not run alone. It is the JavaScript client of a **three-part, version-locked system**;
each release is verified against a specific `ck-allinone` bundle before it ships:

| Component | Repo | Aligned version (v1.5.4) | Role |
|---|---|---|---|
| **CK.Lib.Js** (this) | `ConceptKernel/CK.Lib.Js` | `1.5.4` | JS client — authenticate + dispatch |
| **pgCK** | `styk-tv/pgCK` | `0.4.21` | substrate — governed verbs, seal, ledger |
| **pgRDF** | `styk-tv/pgRDF` | `0.6.19` | engine — RDF/SPARQL/SHACL under pgCK |
| **ck-allinone bundle** | `sporaxis-com/oci-germination` | **v0.7.2x** | the runnable substrate the client verifies against |

**Rule:** a cklib release is "shipped" only after its surface is live-verified over real NATS-WSS
against the aligned `ck-allinone v0.7.2x` bundle. The three move together — the client never advertises
a capability the aligned substrate does not serve.

---

## 1. Floor (unchanged from v1.5.0)

**Dispatch-only, no RDF, no quad store, no SPARQL, no query engine.** The client authenticates and
dispatches typed payloads over NATS-WSS; nothing else crosses. App code names URNs and typed
instances — never NATS subjects, codec tokens, graph ids, or query strings.

Three zero-dependency, vendored/air-gapped modules:

| Module | Layer | Role |
|---|---|---|
| `ck.js` | L2 | `CK` factory + `ConceptKernel` handle — the only surface app code touches |
| `ck-client.js` | L0 | NATS-WSS dispatch transport + Trace-Id correlation + Keycloak JWT |
| `ck-store.js` | L1 | Typed-instance cache (`CKStore`) + reactive reads (`CKView`, `ckBind`) |

Vendored: `./vendor/nats.ws.js` + `./vendor/msgpack.js`. No runtime CDN. Air-gapped since v1.4.2.

**Identity (v3.9.1 δ / TR-02):** identity is **server-derived, never client-asserted.** The browser
holds the OIDC JWT (**EdDSA / Ed25519** in the aligned deployment); the client presents it on the
upgraded NATS-WSS connection (`login()` → token → reconnect) and sends only `{verb, kernel_urn,
payload}` per message. pgCK appends identity as the 4th element of `ckp.dispatch(verb, urn, payload,
identity)`. Changing identity = re-login (new JWT) → reconnect → new granted verb set.

---

## 2. Activate a kernel

```js
import { CK } from './ck.js';

const k = await CK.activate('pgCK.Task', {
  wssEndpoint: 'wss://host/wss',   // required in non-browser contexts (derived from origin in a browser)
  realm: 'myrealm',                 // required for login()
  clientId: 'ck-browser',           // default
  dispatchMode: 'v3.8',             // default; 'v3.9' opt-in (§8)
  gov: 'pgCK',                      // governance kernel name (default)
  hydrate: true,                    // attempt snapshot on activate (default)
  dispatchTimeout: 15000,           // per-dispatch reply timeout (ms)
  transport: null,                  // injectable for testing/harnesses
});
```

`CK.activate(kernel, opts?)` returns a live `ConceptKernel` handle. On activate: construct L0
transport + connect → construct L1 store → fetch affordances (`'affordances'` verb) → subscribe the
granted result + event scope (short + long-form, plus `result.kernel.<GOV>.>` for gov-door replies)
→ attempt `snapshot()` hydrate → return the handle. `affordances = declared rows ∩ the identity's
grants` — the handle can invoke nothing else.

---

## 3. Operation → verb table

```js
const OP_VERB = {
  create:     'instance.create',
  update:     'instance.update',
  transition: 'instance.transition',
  link:       'instance.link',
  query:      'instance.query',   list: 'instance.query',
  get:        'instance.get',
  reach:      'instance.reach',
  verify:     'instance.verify',
  provenance: 'instance.provenance',
  snapshot:   'instance.snapshot',
  validate:   'instance.validate',
  retire:     'instance.retire',
  propose:    'kernel.propose_change',
  vote:       'kernel.vote',
  apply:      'kernel.apply',
  match:      'concept.match',
};
```

Derived reads (`doFresh`) dispatch a **consumer-sealed verb** (e.g. `concept.score`) resolved by
pgCK's `plane='derived'` affordance — not in `OP_VERB`; the client is verb-generic (§4.4).

Reply-field normalisation (REPLY_FIELD → `.result`, per SPEC.CK-OPERATIONS §7): `instance.query`→`rows`,
`instances.list`→`instances`, `instance.get`→`instance`, `instance.reach`→`reached`,
`concept.match`→`candidates`, `instance.snapshot`→`instances`.

---

## 4. Handle methods

### 4.1 Write operations

#### `k.create(type, body?)` → `{ok, id, proof_digest, seq}`

```js
await k.create('urn:ckp:demo/type/Ship', { name: 'Endurance', status: 'active' })
```

Uniform `{type, …fields}` — no task/name nesting. pgCK routes to `ckp.create_typed`, sealed against
the kernel's own declared SHACL shape. `type` MUST be the full declared class IRI (a bare name is
rejected `type_must_be_iri`). All caller fields pass through (the client never strips shape-required
fields — v1.5.2). Optimistic cache insert on `{ok, id}`; the authoritative sealed event reconciles
by id.

#### `k.update(id, patch)` → `{ok, id, proof_digest, seq}`

Sends `{id, patch:{…}}` — pgCK re-seals against the type's declared properties; undeclared keys are
rejected.

#### `k.transition(id, toState, evidence?)` → `{ok, id, proof_digest}` · illegal → `{ok:false, error, allowed?}`

```js
await k.transition('urn:ckp:demo/task/1234', 'closed')   // → { ok:true, id, proof_digest }
```

Dispatches natively against the kernel's sealed per-type transition map. An illegal move returns
`{ok:false, error:'invalid_transition', allowed?}` — `allowed` (the legal targets) is surfaced when
the substrate provides it. (Lossless `{from, to, source}` on the success reply is Layer 1a — see §6.)

> **Initial state (pgCK 0.4.21):** `create_typed` now files a bare core lifecycle key
> (`lifecycle_state`) under the v3.7 core namespace the transition gate reads, so
> `create({…, lifecycle_state:'pending'}) → transition('sealed')` succeeds. The client is transparent
> here — it forwards the field and never re-namespaces it.

#### `k.link(source, predicate, target)` → `{ok, id, proof_digest, seq}`

`target` is a **plain IRI string** (not `{'@id':…}`). `predicate` must be a declared IRI.

#### `k.notify(from, predicate, to, body?)` → `{ok, id, proof_digest, seq}`

Sugar over `instance.link` with `event:true` — a sealed fact that is also a delivered event.

#### `k.retire(id, reason?)` → `{ok, id, proof_digest, seq}`

Sealed retraction (not a delete) — a `retired:true` fact with a proof chain.

### 4.2 Read operations

#### `k.get(id)` → typed instance or null
Cache-first; dispatches `instance.get {id}` on miss; ingests + returns the typed instance.

#### `k.query(type, filter?)` → typed instance array
```js
await k.query('urn:ckp:demo/type/Task', { status: 'active', limit: 20 })
// filter keys are SHORT localnames — pgCK resolves them to declared property IRIs; undeclared rejected.
// { key:{op:value} } → [{op,key,value}];  { key:value } → [{op:'eq',key,value}]
```
No client-side cache-filter fallback. Degrades to the `instances.list` alias if `instance.query` is
not an affordance. `k.list` is an alias.

#### `k.reach(from, via, opts?)` → typed instance array
Bounded predicate traversal. **Resolved (pgCK 0.4.14):** `from` accepts a bare instance id or a full
`@id` (`ckp._resolve_ref`). Returns `[]` honestly if the affordance is unavailable.

#### `k.snapshot(scope?)` → typed instance array
Cache-hydration read; called automatically on `activate`. Returns `[]` honestly when the
verified-identity snapshot path is not yet granted.

#### `k.match(term)` → candidates array
Governed `concept.match` — token/full-text match against the kernel's declared concept index; returns
`r.result` (from `.candidates`) or `[]`.

### 4.3 Validation & proof

#### `k.validate(body)` → `{conforms, violations[]}`
Sends flat `{type, …fields}`; receives the full W3C SHACL ValidationReport verbatim — no boolean
reduction.

#### `k.verify(id)` → `{verified, proof_digest, seq}`
Proof-digest re-verification against the ledger.

#### `k.provenance(id, depth?)` → derivation chain
The proof derivation chain to `depth`.

### 4.4 Derived reads — the scoring loop (v1.5.4)

pgCK v0.4.19+ serves a generic, role-floor-reachable **`plane='derived'`** verb. A consumer seals a
`{formula, scope}` affordance under its own verb name (e.g. `concept.score`); the substrate returns a
**band-less envelope** and the client stays verb-generic — it reads `ok` / `value` /
`recompute_in_progress`; declared extras (`scored`, `freshness`, `net`/`volume`) pass through untouched.
**No consumer math, formula, or band ever enters the client.**

#### `isRecomputing(reply)` → boolean
Recognizes the substrate's honest degrade `{ok:true, recompute_in_progress:true}`.

#### `k.doFresh(verb, payload, opts?)` → reply
```js
const r = await k.doFresh('concept.score', { concept: 'urn:ckp:demo/topic/42' },
  { attempts: 8, delayMs: 250, factor: 2, maxDelayMs: 4000, onRecomputing: (n, reply) => showRecomputing() });
// fresh:      { ok:true, value: 1.5, scored:true, freshness:{…} }
// recomputing:{ ok:true, recompute_in_progress:true }  → re-dispatched with backoff, then the value
```
Dispatches the derived read and, while the reply is the honest `recompute_in_progress` degrade,
re-dispatches with exponential backoff. Safe: a re-dispatch **joins** the substrate's in-flight build
(per-scope dedup — pgCK#4). It decides *when* to ask again, **never *what* the value is** — on budget
exhaustion the last honest reply is returned verbatim, never a stale, cached, or interpolated value.

> **Freshness (verify-don't-assert, live pgCK 0.4.21):** a new sealed signal advances the evidence
> watermark; the next `doFresh` returns the **updated** value — never a stale one.

### 4.5 Governance plane

```js
await k.propose('add_property', { path:'urn:ckp:demo/prop/label', targetClass:'urn:ckp:demo/type/Task', minCount:0 })
await k.vote('urn:ckp:demo/gov/proposal/42', 'approve')
await k.apply('urn:ckp:demo/gov/proposal/42')   // → { ok, graph_changed, epoch }
```

- `propose(op, detail, requires_quorum?)` — `kernel.propose_change`
- `vote(proposalIri, value)` — `kernel.vote`
- `apply(proposalIri)` — `kernel.apply`

> **`add_property` detail contract:** use `minCount` (integer, default 1 = required), NOT `required`
> (boolean — silently ignored). `minCount:0` = optional. Fields: `path`, `targetClass`, `minCount`,
> `datatype`, `maxCount`.

All three degrade to `{ok:false, error:'gov_plane_unavailable'}` if governance is not an affordance.

### 4.6 Discovery & escape hatch

- `k.affordances()` → the affordance rows fetched at activate (declared ∩ granted). `[]` if not exposed.
- `k.do(verb, payload?, opts?)` → raw reply. Generic dispatch for any verb (incl. agent-plane verbs
  not yet surfaced as sugar). `doFresh` is `do` + honest-fresh polling.

### 4.7 Reactive reads (L1)

```js
const view = k.view('urn:ckp:demo/task/1234');            // CKView — 'change' on updates
const inst = k.urn('urn:ckp:demo/task/1234');             // sync cache read; null on miss
const off  = k.bind('urn:ckp:demo/type/Task', (i) => {}); // pattern subscription (exact URN / type wildcard / bare)
const off1 = k.bindOnce('urn:ckp:demo/task/1234', (i) => {});
```

`@ckOn(urn)` decorator + `wireCkOn(obj, handle)` wire decorated methods to binds.

### 4.8 Lifecycle
`await k.close()` — disconnect + cleanup; `k.dispose()` aliases it.

---

## 5. Exports summary

**`ck.js`:** `CK` (default + named), `ConceptKernel`, `normalizeKernel`, `isRecomputing`, `ckOn`,
`wireCkOn`

**`ck-store.js`:** `CKStore` (default), `CKView`, `CKSubject`, `ckBind`, `instanceUrn`, `instanceType`,
`instanceEdges`

**`ck-client.js`:** `CKClient` (named) — L0 transport; consumed by `CK.activate`; usable standalone.

---

## 6. What is NOT in v1.5.4

**Concept Kernel Notation (CKN) / `ckn` — NOT a v3.9.1 feature.** Notation is a **v3.10 draft/roadmap
exercise**; any notation compiler is explicitly out of the advertised v1.5.4 surface. This client
speaks the governed verb surface only. See the roadmap for the v3.10 direction.

Other post-v1.5.4 items (roadmap / trunk):

- **Client ergonomics (Layer 1a)** — typed `Ref` (`.urn`/`.local`), lossless `transition`, single-actor
  `govern`/`setTransitionMap`, callable `Ref`. Built on trunk, **not in the v1.5.4 release**; documents
  in the next version.
- **Identity attribution surface** — `msg.by` on delivered messages + handle-interning (governed vs
  ephemeral lanes). Gated on the substrate attaching the server-derived sender.
- Per-session result routing; affordance projection tightening; `dispatchMode:'v3.9'` as default;
  `task.*` alias retirement; minified build + TypeScript declarations.

---

## 7. Known items

| ID | Item | Status |
|---|---|---|
| FIX-C | `k.reach()` bare-id id-form | ✅ **resolved** (pgCK 0.4.14 `_resolve_ref`) |
| BLK-1 | enforcement graph (`/kernel/board` vs `/kernel/ck`) | ✅ **resolved** (pgCK 0.4.14 `adopt_kernel_ttl`) |
| lifecycle_state | initial state filed under the gate-read core NS | ✅ **resolved** (pgCK 0.4.21) |
| snapshot | verified-identity cache hydration | ⏳ honest-degrade (`[]`) until granted |

---

## 8. Transport reference

Full NATS subject grammar, headers, codec, and dispatch modes: **`SPEC.CK-OPERATIONS.v1.5.1.md`**.
Key points: dispatch default `v3.8`; governed verbs → `input.kernel.<GOV>.action.<verb>`;
agent/delegated → `input.kernel.<TARGET>.action.<verb>`; headers `Trace-Id`, `Ck-Verb`, `Ck-Kernel`,
`Ck-Seq`, `Content-Encoding`; codec JSON default / MsgPack.
