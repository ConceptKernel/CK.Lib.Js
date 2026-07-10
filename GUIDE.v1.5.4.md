# CK.Lib.Js — Client Guide (v1.5.4)

A hands-on walkthrough of every capability in **CK.Lib.Js v1.5.4**, the JavaScript client for a
**Concept Kernel** (CKP **v3.9.1** "Critical Isolation") over NATS-WSS.

- **Normative reference:** [`SPEC.CK-LIB-JS.v1.5.4.md`](./SPEC.CK-LIB-JS.v1.5.4.md) · **Transport:** [`COMPLIANCE.md`](./COMPLIANCE.md)
- **Aligned runtime:** `ck-allinone v0.7.2x` — pgCK **0.4.21** · pgRDF **0.6.19**. The client is
  verified against this bundle; pin the two together.
- **Not in this guide:** Concept Kernel Notation (CKN). Notation is a **v3.10 draft/roadmap** exercise,
  not a v3.9.1 feature — this guide advertises v3.9.1 only.

> **The one rule to internalize:** *the client authenticates and dispatches; the server governs and
> seals.* Every method here compiles to one governed dispatch — `ckp.dispatch(verb, urn, payload,
> identity)`. There is no RDF, quad store, or query engine on the client, and it holds no authority of
> its own. If a call is rejected or returns empty, that is the kernel's decision, surfaced honestly.

---

## 0. Attach & identity

```js
import { CK } from '@conceptkernel/cklib';   // or  '/cklib/ck.js'  from the mounted OCI bundle

const k = await CK.activate('Tasks');        // attach — that is the whole setup
```

`activate` connects, authenticates, and subscribes the granted scope, returning a live handle. What
the handle can do is `declared affordances ∩ your identity's grants` — nothing else is callable.

**You never pass identity.** Identity is derived from the verified JWT on the connection (EdDSA/Ed25519
in prod): the browser holds the token, the client presents it once at connect, and the server stamps
`created_by` on every fact. To act as someone else you re-login and reconnect — there is no "set user"
on the client.

```js
// non-browser (Node) needs the endpoint + realm explicitly; a same-origin browser derives them:
const k = await CK.activate('Tasks', { wssEndpoint: 'wss://host/wss', realm: 'myrealm' });
await k.login('alice', '••••••');   // Keycloak → JWT → reconnect with the token
```

---

## 1. Write facts

Every write is validated against the kernel's sealed shape, sealed with a proof, and emitted as an
event — one transaction, no exceptions.

```js
// create — {type, …fields} flat; `type` is the full declared class IRI
const c = await k.create('urn:ckp:demo/type/Task', { title: 'Review Q3 draft', assignee: 'ana' });
// → { ok: true, id: 'task-…', verified: true, proof_digest: '9202c6…' }
const id = c.id;

// update — re-seals against the type's declared properties (undeclared keys rejected)
await k.update(id, { status: 'in_progress' });

// transition — gated by the kernel's sealed per-type state machine
const t = await k.transition(id, 'closed');
// legal   → { ok: true, id, proof_digest }
// illegal → { ok: false, error: 'invalid_transition', allowed: ['in_progress','blocked'] }
if (!t.ok) console.log('legal moves are:', t.allowed);

// link — a declared edge; `target` is a plain IRI string
await k.link(id, 'urn:ckp:demo/prop/blocks', 'urn:ckp:demo/task/5678');

// notify — a sealed fact that is also a delivered event (messaging with provenance)
await k.notify(id, 'urn:ckp:demo/prop/mentions', 'urn:ckp:participant/ana', { text: 'deadline moved' });

// retire — a sealed retraction (not a delete); a proof-chained `retired:true` fact
await k.retire(id, 'superseded');
```

> **Initial lifecycle state:** pass `lifecycle_state` in `create` and the kernel files it where the
> transition gate reads it — so `create({…, lifecycle_state:'pending'})` then `transition('sealed')`
> works. The client forwards the field verbatim; the server owns the namespace.

---

## 2. Read, typed — no query language

There is no query string on this surface (and none to inject). Reads are named, typed, and grantable.

```js
const one  = await k.get(id);                                   // cache-first; dispatches on miss
const many = await k.query('urn:ckp:demo/type/Task', {          // filter keys are SHORT localnames…
  status: 'active', limit: 20,                                   // …pgCK resolves them to declared IRIs
});
// { key: value }         → equality
// { key: { gt: value } } → operator form
const edges = await k.reach(id, 'urn:ckp:demo/prop/blocks');    // bounded predicate traversal
const hits  = await k.match('endurance');                       // governed token/full-text match
```

An undeclared filter key is rejected by the kernel (not silently ignored). No rows, or a rejection,
returns an **honest empty array** — never a fabricated result.

---

## 3. Prove & pre-flight

```js
await k.verify(id);            // → { verified: true, proof_digest: '9202c6…' }
await k.provenance(id);        // → the derivation chain: who did what, in what order
await k.validate({ type: 'urn:ckp:demo/type/Task', title: 'x' });
// → { conforms: false, violations: [{ path, message, severity }] }   (full W3C SHACL report, verbatim)
```

`validate` is a dry-run against the sealed shape *before* you write — it seals nothing.

---

## 4. Derived reads — the scoring loop

A **derived read** asks the kernel for a computed value (e.g. a score) that the server materializes
from sealed evidence. You dispatch a **consumer-sealed verb** (its name, formula, and any bands are the
consumer's sealed facts — never the client's). The client is verb-generic: it reads `ok` / `value` /
`recompute_in_progress`; extra fields (`scored`, `freshness`) pass through untouched.

```js
import { isRecomputing } from '@conceptkernel/cklib';

const r = await k.doFresh('concept.score', { concept: 'urn:ckp:demo/topic/42' });
// fresh → { ok: true, value: 1.5, scored: true, freshness: {…} }

// While the server is materializing over budget it answers honestly:
//   { ok: true, recompute_in_progress: true }
// doFresh re-dispatches with backoff (safe — a re-dispatch JOINS the in-flight build) until the value
// returns; on budget exhaustion it hands back the honest recomputing reply — never a stale/guessed one.
if (isRecomputing(r)) showSpinner();     // recognise the honest degrade
else render(r.value);
```

Tune the poll if you need to: `k.doFresh(verb, payload, { attempts, delayMs, factor, maxDelayMs,
onRecomputing })`. It decides *when* to ask again, **never *what* the value is.**

---

## 5. Change the rules — governance

The schema and verb set evolve by **consensus**, not migration. A change is a proposal that is voted
and applied; every step is sealed.

```js
const prop = await k.propose('add_property', {
  path: 'urn:ckp:demo/prop/due', targetClass: 'urn:ckp:demo/type/Task', minCount: 0, datatype: 'xsd:date',
});
const proposal = prop.about ?? prop.id;         // the proposal's URN, from the reply
await k.vote(proposal, 'approve');
await k.apply(proposal);                          // → { ok: true, graph_changed: true, epoch: 3 }
```

> Use `minCount` (integer; default `1` = required, `0` = optional), **not** `required` (silently
> ignored). If governance isn't granted, all three return `{ ok:false, error:'gov_plane_unavailable' }`.

*(v1.5.5 will add single-actor sugar — `k.setTransitionMap(type, map)` / `k.govern(op, detail)` — that
collapses propose→vote→apply into one call. See the roadmap.)*

---

## 6. React — live, by URN

Addressing a URN *is* the subscription. Things that don't exist yet are valid addresses; the handler
fires when they come to be.

```js
const off  = k.bind('urn:ckp:demo/type/Task', (inst) => render(inst));   // every Task change
const off1 = k.bindOnce(`ckp://Instance#${id}`, (inst) => toast(inst));  // one-shot
const view = k.view(id);            // CKView — emits 'change' on updates
const now  = k.urn(id);             // sync cache read; null on miss
off();                              // unbind
```

Patterns: an exact URN, a type wildcard (`…/type/Task` matches all its instances), or a bare string
matched against `@id`/`@type`. The `@ckOn(urn)` decorator + `wireCkOn(obj, k)` wire class methods to
binds.

---

## 7. Honest degrades — what "empty" means

The client never fabricates. Each honest state has a distinct, checkable shape:

| Reply | Meaning | Handle it by |
|---|---|---|
| `[]` from a read | no rows, or the kernel rejected the shape | show empty; check filter keys are declared |
| `{ ok:false, error:'invalid_transition', allowed }` | illegal state move | offer `allowed` targets |
| `{ ok:true, recompute_in_progress:true }` | a derived value is materializing | `doFresh` polls; show "recomputing" |
| `{ ok:false, error:'gov_plane_unavailable' }` | governance not granted here | hide the governance UI |

None of these are exceptions to swallow — they are the kernel telling you the truth.

---

## 8. Putting it together

```js
import { CK, isRecomputing } from '@conceptkernel/cklib';

const k = await CK.activate('Tasks', { wssEndpoint: 'wss://host/wss', realm: 'demo' });
await k.login('ana', '••••••');

const c = await k.create('urn:ckp:demo/type/Task', { title: 'Ship v1', lifecycle_state: 'pending' });
k.bind(`ckp://Instance#${c.id}`, (inst) => board.render(inst));   // live-track it

const t = await k.transition(c.id, 'sealed');
if (t.ok) console.log('sealed, proof:', (await k.verify(c.id)).proof_digest);

const score = await k.doFresh('concept.score', { concept: c.id });
board.badge(c.id, isRecomputing(score) ? 'scoring…' : score.value);

await k.close();
```

Attach, write a fact, watch it live, seal it, prove it, read a governed score — the whole surface, no
NATS subjects, no query strings, no client-side authority. That is CK.Lib.Js v1.5.4.

---

## Reference

[`SPEC.CK-LIB-JS.v1.5.4.md`](./SPEC.CK-LIB-JS.v1.5.4.md) (normative) ·
[`COMPLIANCE.md`](./COMPLIANCE.md) (transport) · [`README.md`](./README.md) (overview) ·
[`CHANGELOG.md`](./CHANGELOG.md) · [pgCK](https://github.com/styk-tv/pgCK) ·
[oci-germination](https://github.com/sporaxis-com/oci-germination)
