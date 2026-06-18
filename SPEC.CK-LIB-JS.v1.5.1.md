# SPEC.CK-LIB-JS.v1.5.1 — CK.Lib.Js Normative Specification

| Field | Value |
|---|---|
| Version | v1.5.1 |
| Date | 2026-06-18 |
| Status | **In progress — built, not yet tagged/released** |
| Grounding | `ck-lib-js:1.5.0` shipped base · pgCK `v0.4.13` (T1–T6 attested) · `ociger-ck-allinone:v0.7.19` |
| Supersedes | `SPEC.CK-LIB-JS.v1.5.0` (kept for history) |
| Next (future) | `SPEC.CK-LIB-JS.v1.6.0-FUTURE.md` |

**What v1.5.1 is:** typed-edge forms built-ahead on the task branch, now ready to ship. Adds
TE-10 → TE-4 (kernel-derived typed operations, live-verified vs v0.7.19/pgCK 0.4.13), three
client-code bug fixes (FIX-A/B/TE-4), the gov-door routing fix (G5a), and the canonical NATS
wire-contract spec. No new architecture. The dispatch-only floor is unchanged from v1.5.0.

---

## 0. Floor (unchanged from v1.5.0)

**Dispatch-only, no RDF, no quad store, no SPARQL, no query engine.** The client authenticates
and dispatches typed payloads over NATS-WSS; nothing else crosses. App code names URNs and typed
instances — never NATS subjects, codec tokens, graph ids, or query strings.

Three zero-dependency, vendored/air-gapped modules:

| Module | Layer | Role |
|---|---|---|
| `ck.js` | L2 | `CK` factory + `ConceptKernel` handle — the only surface app code touches |
| `ck-client.js` | L0 | NATS-WSS dispatch transport + Trace-Id correlation + Keycloak JWT |
| `ck-store.js` | L1 | Typed-instance cache (`CKStore`) + reactive reads (`CKView`, `ckBind`) |

Vendored: `./vendor/nats.ws.js` + `./vendor/msgpack.js`. No runtime CDN. Air-gapped since v1.4.2.

---

## 1. Activate a kernel

```js
import { CK } from './ck.js';

const k = await CK.activate('pgCK.Task', {
  wssEndpoint: 'wss://host/wss',   // required in non-browser contexts
  realm: 'myrealm',                 // required for login()
  clientId: 'ck-browser',           // default
  dispatchMode: 'v3.8',             // default; 'v3.9' opt-in (§7)
  gov: 'pgCK',                      // governance kernel name (default)
  hydrate: true,                    // attempt snapshot on activate (default)
  transport: null,                  // injectable for testing/harnesses
});
```

`CK.activate(kernel, opts?)` returns a live `ConceptKernel` handle. `kernel` is a name
(`'pgCK.Task'`) or URN (`'ckp://Kernel#pgCK.Task'`); both are normalised internally.

On activate:
1. Constructs `CKClient` (L0) and connects to NATS.
2. Constructs `CKStore` (L1) wired to the transport.
3. Fetches affordances (dispatches `'affordances'` verb — FIX-B corrected from `'kernel.affordances'`).
4. Subscribes the kernel's granted result + event scope (both short + long-form subjects).
5. Subscribes `result.kernel.<GOV>.>` when `gov ≠ kernel` (G5a — gov-door routing fix).
6. Attempts `snapshot()` to hydrate the cache (`opts.hydrate !== false`).
7. Returns the handle.

---

## 2. Operation → verb table

```js
const OP_VERB = {
  create:     'instance.create',
  update:     'instance.update',
  transition: 'instance.transition',
  link:       'instance.link',
  list:       'instance.query',      // alias
  query:      'instance.query',
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
  match:      'concept.match',        // TE-4 (v1.5.1)
};
```

Reply-field normalisation (REPLY_FIELD → `.result`, pinned per SPEC.CK-OPERATIONS §7):

| Verb | Field | Notes |
|---|---|---|
| `instance.query` | `rows` | flattened to `{'@id',…body}` |
| `instances.list` | `instances` | v3.8 alias, retires with AL-1 |
| `instance.get` | `instance` | |
| `instance.reach` | `reached` | |
| `concept.match` | `candidates` | |
| `instance.snapshot` | `instances` | |

---

## 3. Handle methods

### 3.1 Write operations

#### `k.create(type, body?)` → `{ok, id, proof_digest, seq}` ✅ TE-10

```js
k.create('urn:ckp:demo/type/Ship', { name: 'Endurance', status: 'active' })
```

Uniform `{type, …fields}` — no task/name key nesting. pgCK routes to `ckp.create_typed` sealed
against the kernel's own declared SHACL shape. `type` MUST be the full declared class IRI.
Optimistic cache insert on `{ok, id}` reply; authoritative sealed event reconciles via
replace-by-id.

#### `k.update(id, patch)` → `{ok, id, proof_digest, seq}` ✅ TE-6

```js
k.update('urn:ckp:demo/task/1234', { status: 'done' })
```

Sends `{id, patch:{…}}` — pgCK re-seals against the type's declared properties. Undeclared keys
are rejected.

#### `k.transition(id, toState, evidence?)` → `{ok, id, proof_digest, allowed?}` ✅ TE-7

```js
k.transition('urn:ckp:demo/task/1234', 'closed')
```

Dispatches natively against the kernel's sealed per-type transition map. An illegal move returns
`{ok:false, error:'invalid_transition', from, to, allowed:[…]}` — `allowed` lists the legal
targets from the current state.

#### `k.link(source, predicate, target)` → `{ok, id, proof_digest, seq}` ✅ TE-8

```js
k.link('urn:ckp:demo/task/1234', 'urn:ckp:demo/prop/blocks', 'urn:ckp:demo/task/5678')
```

`target` is a **plain IRI string** (not `{'@id':…}` — that triggers a turtle-parse error).
`predicate` must be a declared IRI in the kernel's property set.

#### `k.notify(from, predicate, to, body?)` → `{ok, id, proof_digest, seq}` ✅ FIX-A

```js
k.notify('urn:ckp:csvc/topic/42', 'urn:ckp:csvc/prop/notifies', 'urn:ckp:demo/task/1234', { msg: 'ready' })
```

Sugar over `instance.link` with `event:true`. Carries `{source:from, predicate, target:to, body,
event:true}`. **Breaking from v1.5.0:** argument order changed — was `notify(to, predicate, body)`,
now `notify(from, predicate, to, body?)`. `predicate` must be declared on the source kernel.

#### `k.retire(id, reason?)` → `{ok, id, proof_digest, seq}`

Sealed retraction — not a delete. A `retired:true` fact with a proof chain is minted.

### 3.2 Read operations

#### `k.get(id)` → typed instance or null

Cache-first; dispatches `instance.get {id}` on miss; ingests reply; returns the typed instance.

#### `k.query(type, filter?, opts?)` → typed instance array ✅ TE-9

```js
k.query('urn:ckp:demo/type/Task', { status: 'active', limit: 20 })
// filter keys are SHORT localnames; pgCK resolves to declared property IRIs
// object filter: { key: { op: value } }  →  [{op, key, value}]
// scalar filter: { key: value }          →  [{op:'eq', key, value}]
```

Sends derived QueryShape keys — pgCK rejects undeclared keys. No client-side cache-filter fallback
(TE-9 dropped it). Degrades to `instances.list` alias if `instance.query` is not an affordance.

#### `k.list(type, filter?)` → typed instance array

Alias for `query`.

#### `k.reach(from, via, opts?)` → typed instance array ⚠️ FIX-C pending

Bounded predicate traversal. Returns `[]` honestly if unavailable.
**Known bug (FIX-C):** `from` must be a full IRI; bare instance-id (without IRI prefix) triggers
a SPARQL invalid-IRI error in pgCK. Fix pending pgCK NOTIFY response.

#### `k.snapshot(scope?)` → typed instance array ⏳ F-A gated

Returns `[]` until pgCK T8 (F-A / `instance.snapshot` with verified JWT) lands. Called
automatically on `activate` (hydrate) — silently returns `[]` when not yet granted.

#### `k.match(term)` → candidates array ✅ TE-4

```js
k.match('endurance')  // → [{ id, label, score, … }]
```

Governed `concept.match` — full-text / token match against the kernel's declared concept index.
Returns `r.result` (normalised from `.candidates`), or `[]` on miss/error.

### 3.3 Validation

#### `k.validate(body)` → `{conforms, violations[]}` ✅ TE-5

```js
k.validate({ type: 'urn:ckp:demo/type/Task', title: 'fix bug', status: 'active' })
// → { conforms: true, violations: [] }
// → { conforms: false, violations: [{ path, message, severity }] }
```

Sends flat `{type, …fields}`; receives the full W3C SHACL ValidationReport. No boolean-grade
reduction — the report is surfaced verbatim.

#### `k.verify(id)` → `{verified, proof_digest, seq}`

Proof-digest re-verification against the ledger.

#### `k.provenance(id, depth?)` → derivation chain or raw reply

Returns the proof derivation chain to `depth`. Full trace gated on pgRDF T10.

### 3.4 Governance plane

```js
await k.propose('add_property', { path: 'urn:ckp:demo/prop/label', targetClass: 'urn:ckp:demo/type/Task', minCount: 0 })
// → { ok, id, about }

await k.vote('urn:ckp:demo/gov/proposal/42', 'approve')
// → { ok, epoch? }

await k.apply('urn:ckp:demo/gov/proposal/42')
// → { ok, graph_changed, epoch }
```

- `propose(op, detail, requires_quorum?)` — `kernel.propose_change`
- `vote(proposalIri, value)` — `kernel.vote`
- `apply(proposalIri)` — `kernel.apply`

> **`add_property` detail contract:** use `minCount` (integer, default 1 = required), NOT
> `required` (boolean — silently ignored, defaults to `minCount:1`). Use `minCount:0` for
> optional. Key fields: `path` (IRI), `targetClass` (IRI), `minCount`, `datatype`, `maxCount`.

All three degrade to `{ok:false, error:'gov_plane_unavailable'}` if the governance plane is not
an affordance.

### 3.5 Discovery

#### `k.affordances()` → affordance descriptor array ✅ FIX-B

Returns the affordance rows fetched at `activate` time (dispatches `'affordances'`, not
`'kernel.affordances'` — FIX-B). Degrades to `[]` if the verb is not exposed.

#### `k.do(verb, payload?, opts?)` → raw reply

Generic escape hatch — dispatches any verb directly. Use for agent-plane verbs
(`agent.execute`, `agent.presence`, etc.) not yet surfaced as handle sugar.

### 3.6 Reactive reads (L1)

```js
const view = k.view('urn:ckp:demo/task/1234');      // CKView — fires 'change' on updates
view.on('change', ({ added, removed }) => { … });

const inst = k.urn('urn:ckp:demo/task/1234');        // sync cache read; null on miss

const unbind = k.bind('urn:ckp:demo/type/Task', (inst) => { … });   // pattern subscription
const unbind2 = k.bindOnce('urn:ckp:demo/task/1234', (inst) => { … }); // one-shot
```

Patterns supported by `bind` / `bindOnce`:
- Exact URN: `'urn:ckp:demo/task/1234'`
- Type wildcard: `'urn:ckp:demo/type/Task'` (matches all instances of that type)
- Bare string: matched against `@id` prefix or `@type`

#### `@ckOn(urn)` decorator + `wireCkOn(obj, handle)`

```js
class TaskView {
  @ckOn('urn:ckp:demo/type/Task')
  onTask(inst) { /* called on every Task change */ }
}
const view = new TaskView();
wireCkOn(view, k);   // wires all @ckOn decorators; returns combined unbind()
```

### 3.7 Lifecycle

```js
await k.close()    // disconnect, cleanup subscriptions and pending dispatches
k.dispose()        // alias for close()
```

---

## 4. Exports summary

**`ck.js`:** `CK` (default + named), `ConceptKernel`, `normalizeKernel`, `ckOn`, `wireCkOn`

**`ck-store.js`:** `CKStore` (default), `CKView`, `CKSubject`, `ckBind`, `instanceUrn`,
`instanceType`, `instanceEdges`

**`ck-client.js`:** `CKClient` (named) — L0 transport; consumed by `CK.activate` internally;
also usable standalone for lower-level NATS access.

---

## 5. Known open items

| ID | Item | Status |
|---|---|---|
| **FIX-C** | `k.reach()` — bare instance-id → SPARQL invalid-IRI error in pgCK | ⏳ awaiting pgCK NOTIFY response |
| **BLK-1** | Enforcement vacuous on demo — SHACL shapes in `/kernel/board`, pgCK reads `/kernel/ck` | ⏳ awaiting pgCK reconcile → oci-germination v0.7.20 |
| **snapshot** | Returns `[]` until pgCK T8 (F-A / verified JWT identity) | ⏳ gated on pgCK T8 |

FIX-C and BLK-1 do not block the v1.5.1 tag — they are server-side issues. The client code is
correct; the operations degrade honestly.

---

## 6. What is NOT in v1.5.1 (→ FUTURE)

See `SPEC.ROADMAP.v1.6.0-FUTURE.CHECKLIST.md` for the complete post-v1.5.1 roadmap:

- `instance.snapshot` with verified JWT + cache hydration (TE-3 / pgCK T8 F-A)
- Per-session result routing on `session.{project}.{id}` (TE-2 / pgCK T9 F-C)
- Affordance projection — intersect granted rows vs identity (AP-1/AP-2 / SPORE F-A)
- `dispatchMode: 'v3.9'` as default (CE-B-2 — awaiting pgCK CI-B confirmation)
- `task.*` alias retirement (AL-1)
- Node.js binding / `ck-harness` surface (ND-1)
- Minified build + TypeScript declarations (MB-1)
- CK.Lib.Xr extraction (XR-1)
- Base `ckp:notifies` predicate (PD-1)
- Handle sugar for agent plane (`k.execute`, `k.say`, etc.) — currently via `k.do()`

---

## 7. Transport reference

Full NATS subject grammar, headers, codec, and dispatch modes:
**`SPEC.CK-OPERATIONS.v1.5.1.md`** — the canonical wire-contract reference for v1.5.1.

Key points:
- Dispatch mode default: `v3.8` (per-verb subject shim)
- Governed verbs → `input.kernel.<GOV>.action.<verb>`
- Agent/delegated verbs → `input.kernel.<TARGET-K>.action.<verb>`
- Headers: `Trace-Id`, `Ck-Verb`, `Ck-Kernel`, `Ck-Seq`, `Content-Encoding`
- Codec: JSON default / MsgPack (`Content-Encoding: msgpack`)
