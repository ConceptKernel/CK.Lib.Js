# CK.Lib.Js — Client Guide (v1.5.5)

A hands-on walkthrough of **CK.Lib.Js v1.5.5**, the JavaScript client for a **Concept Kernel** (CKP
**v3.9.1**) over NATS-WSS — aligned to the first **pg18** substrate.

- **Normative:** [`SPEC.CK-LIB-JS.v1.5.5.md`](./SPEC.CK-LIB-JS.v1.5.5.md) · **Transport:** [`COMPLIANCE.md`](./COMPLIANCE.md)
- **Aligned runtime:** first pg18 / trixie `ck-allinone` — pgCK **0.4.22** · pgRDF **0.6.20**. Pin them together.
- **Not here:** Concept Kernel Notation (CKN) — a **v3.10 draft/roadmap** exercise, not a v3.9.1 feature.

> **The one rule:** *the client authenticates and dispatches; the server governs, seals, and attributes
> identity.* Every method compiles to one governed dispatch. There is no RDF, quad store, or query
> engine on the client, and it holds no authority of its own — not even over who you are.

---

## 0. Attach & identity — you can't lie about who you are

```js
import { CK } from '@conceptkernel/cklib';
const k = await CK.activate('Tasks');        // attach — the whole setup
```

Identity is derived from the verified JWT on the connection. The client sends only `{verb, kernel_urn,
payload}` — **there is no identity field to set**, by design. The server stamps `created_by` from the
verified token; a forged identity in a payload is ignored. To act as someone else you re-login and
reconnect — never by editing a message.

---

## 1. Write facts — now with a live handle

`create` returns a **callable Ref**: operate on the new instance without tracking its id.

```js
const t = await k.create('urn:ckp:demo/type/Task', { title: 'Review Q3', assignee: 'ana' });
// → Ref { ok:true, id:'task-…', urn, local, verified:true, proof_digest:'9202c6…' }

await t.update({ status: 'in_progress' });                 // t.update → k.update(t.id, …)
await t.link('urn:ckp:demo/prop/blocks', 'urn:ckp:demo/task/5678');

const sealed = await t.transition('sealed');               // LOSSLESS — no dropping to raw do()
// legal   → { ok:true, from:'pending', to:'sealed', source:'kernel' }
// illegal → { ok:false, error:'invalid_transition', allowed:['in_progress'] }
if (!sealed.ok) console.log('legal moves:', sealed.allowed);

await k.notify(t.id, 'urn:ckp:demo/prop/mentions', 'urn:ckp:participant/ana', { text: 'ready' });
await k.retire(t.id, 'superseded');                        // sealed retraction, not a delete
```

No `bare()` surgery, no `c.id || c.iri` guessing, no id juggling — the Ref carries `.urn`/`.local` and
routes its own methods.

## 2. Change the rules — governance in one call

```js
// single-actor (quorum 1): propose → vote → apply, collapsed
await k.setTransitionMap('urn:ckp:demo/type/Task', { pending: ['sealed', 'discarded'] });
const applied = await k.govern('add_property', {
  path: 'urn:ckp:demo/prop/due', targetClass: 'urn:ckp:demo/type/Task', minCount: 0, datatype: 'xsd:date',
});
// → { ok:true, proposal:'ckp://Proposal#…', state:'applied', epoch:3 }
```

For a real multi-party quorum, drive `propose` / `vote` / `apply` directly — `propose()` now hands back a
stable `.iri` so there's no reply-field guessing. Not granted governance? Every call returns
`{ ok:false, error:'gov_plane_unavailable' }`.

## 3. Read, typed — no query language

```js
const one  = await k.get(t.id);
const many = await k.query('urn:ckp:demo/type/Task', { status: 'active', limit: 20 });  // short keys → declared IRIs
const hits = await k.match('endurance');
```
Undeclared filter keys are rejected by the kernel; no rows → an honest `[]`, never fabricated.

## 4. Prove & pre-flight

```js
await k.verify(t.id);            // { verified:true, proof_digest:'9202c6…' }
await k.provenance(t.id);        // the derivation chain
await k.validate({ type:'urn:ckp:demo/type/Task', title:'x' });   // full W3C SHACL report
```

## 5. Derived reads — the scoring loop

```js
import { isRecomputing } from '@conceptkernel/cklib';
const r = await k.doFresh('concept.score', { concept: t.id });   // consumer-sealed verb; verb-generic
isRecomputing(r) ? showSpinner() : render(r.value);
```
`doFresh` re-polls with backoff while the server answers the honest `recompute_in_progress`; a re-dispatch
**joins** the in-flight build; a watermark advance yields the **updated** value — never stale. It decides
*when* to ask again, never *what* the value is.

## 6. React + who-said-what — `msg.by`

Addressing a URN *is* the subscription. And every delivered event carries the **server-attributed
sender** — read-only.

```js
k.bind('urn:ckp:demo/type/Task', (inst) => board.render(inst));   // reactive, by URN pattern

// the raw event stream carries the sender the server verified:
ck.on('event', (msg) => {
  // msg.by  → 'urn:ckp:participant:alice'   (server-derived, verified; the client never asserts it)
  // msg.seq → ledger Ck-Seq
  chat.line(msg.by, msg.data);
});
```

A multi-party session shows who sent what at volume with **no per-client identity logic** — the client
reads `msg.by`; the server derived it. `msg.by` is `null` when absent (never fabricated).

## 7. Honest degrades — what each shape means

| Reply | Meaning | Handle |
|---|---|---|
| `[]` from a read | no rows / kernel rejected the shape | show empty; check filter keys are declared |
| `{ok:false, error:'invalid_transition', allowed}` | illegal move | offer `allowed` |
| `{ok:true, recompute_in_progress:true}` | a value is materializing | `doFresh` polls; show "recomputing" |
| `{ok:false, error:'gov_plane_unavailable'}` | governance not granted | hide the governance UI |
| `msg.by === null` | no sender attributed | render anonymously |

## 8. Putting it together

```js
import { CK, isRecomputing } from '@conceptkernel/cklib';

const k = await CK.activate('Tasks', { wssEndpoint: 'wss://host/wss', realm: 'demo' });
await k.login('ana', '••••••');

await k.setTransitionMap('urn:ckp:demo/type/Task', { pending: ['sealed'] });
const t = await k.create('urn:ckp:demo/type/Task', { title: 'Ship v1', lifecycle_state: 'pending' });
k.bind(`ckp://Instance#${t.id}`, (i) => board.render(i));

const sealed = await t.transition('sealed');                       // { ok, from:'pending', to:'sealed' }
if (sealed.ok) console.log('proof:', (await k.verify(t.id)).proof_digest);

const score = await k.doFresh('concept.score', { concept: t.id });
board.badge(t.id, isRecomputing(score) ? 'scoring…' : score.value);

await k.close();
```

Attach, seal a fact through a live Ref, govern in one call, read a governed score, and see who did each
of it — no NATS subjects, no query strings, no client-side authority, and no way to assert an identity
that isn't yours. That is CK.Lib.Js v1.5.5.

---

## Reference

[`SPEC.CK-LIB-JS.v1.5.5.md`](./SPEC.CK-LIB-JS.v1.5.5.md) · [`COMPLIANCE.md`](./COMPLIANCE.md) ·
[`README.md`](./README.md) · [`CHANGELOG.md`](./CHANGELOG.md) · [pgCK](https://github.com/styk-tv/pgCK) ·
[oci-germination](https://github.com/sporaxis-com/oci-germination)
