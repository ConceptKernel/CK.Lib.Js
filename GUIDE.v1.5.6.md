# CK.Lib.Js — Client Guide (v1.5.6)

A hands-on walkthrough of **CK.Lib.Js v1.5.6**, the JavaScript client for a **Concept Kernel** (CKP
**v3.9.2**) over NATS-WSS — aligned to the pg18 substrate with **broker-owned identity admittance**.

- **Normative:** [`SPEC.CK-LIB-JS.v1.5.6.md`](./SPEC.CK-LIB-JS.v1.5.6.md) · **Transport:** [`COMPLIANCE.md`](./COMPLIANCE.md)
- **Aligned runtime:** `ck-allinone v0.7.32` — pgCK **0.4.24** · pgRDF **0.6.20**. Pin them together.
- **v3.9.2** is an *omission-restoration* of v3.9.1 — same behaviour, restored teleology + named harness
  contact point (this client). **Not here:** CKN notation — a v3.10 draft/roadmap exercise.

> **The one rule:** *the client authenticates and dispatches; the server governs, seals, and attributes
> identity.* The client holds no authority of its own — not even over who you are.

---

## 0. Attach & identity — who you are is decided for you

```js
import { CK } from '@conceptkernel/cklib';
const k = await CK.activate('Tasks');        // attach — the whole setup
await k.login('ana', '••••••');              // → a verified connection
```

You never put identity in a message — there is no field for it. Once you `login()`, the client presents
your token on the connection and the **broker admits you under your own id**. From then on, **your
dispatches are attributed to you automatically**: the client publishes them on the broker-enforced
identity-scoped subject, so every fact you seal records *you* as `created_by` and every event others
receive carries `by: urn:ckp:participant:<you>`.

You do nothing to make this happen, and — importantly — you **cannot fake it**: publishing as someone you
haven't been admitted as is denied by the broker and never seals. Anonymous (not logged in) still works
for reads and for dispatches that seal anonymously. To act as someone else you re-login; never by editing
a message.

---

## 1. Write facts — with a live handle

```js
const t = await k.create('urn:ckp:demo/type/Task', { title: 'Review Q3', assignee: 'ana' });
// → Ref { ok:true, id, urn, local, verified:true, proof_digest:'9202c6…' }  — created_by: ana (verified)

await t.update({ status: 'in_progress' });                 // t.update → k.update(t.id, …)
const sealed = await t.transition('sealed');               // lossless: { ok, from:'pending', to:'sealed', source:'kernel' }
if (!sealed.ok) console.log('legal moves:', sealed.allowed);
await k.link(t.id, 'urn:ckp:demo/prop/blocks', 'urn:ckp:demo/task/5678');
await k.retire(t.id, 'superseded');                        // sealed retraction, not a delete
```
No `bare()` surgery, no id juggling — the Ref carries `.urn`/`.local` and routes its own methods.

## 2. Change the rules — governance in one call

```js
await k.setTransitionMap('urn:ckp:demo/type/Task', { pending: ['sealed', 'discarded'] });
const applied = await k.govern('add_property', {
  path: 'urn:ckp:demo/prop/due', targetClass: 'urn:ckp:demo/type/Task', minCount: 0, datatype: 'xsd:date',
});   // → { ok:true, proposal:'ckp://Proposal#…', state:'applied', epoch:3 }
```
For a real multi-party quorum, drive `propose` / `vote` / `apply` directly (`propose()` returns a stable
`.iri`). Not granted governance? Every call returns `{ ok:false, error:'gov_plane_unavailable' }`.

## 3. Read, typed — no query language

```js
const one  = await k.get(t.id);
const many = await k.query('urn:ckp:demo/type/Task', { status: 'active', limit: 20 });  // short keys → declared IRIs
const hits = await k.match('endurance');
```
Undeclared filter keys are rejected; no rows → an honest `[]`, never fabricated.

## 4. Prove & derived reads

```js
await k.verify(t.id);            // { verified:true, proof_digest:'9202c6…' }
await k.provenance(t.id);        // the derivation chain
await k.validate({ type:'urn:ckp:demo/type/Task', title:'x' });   // full W3C SHACL report

import { isRecomputing } from '@conceptkernel/cklib';
const r = await k.doFresh('concept.score', { concept: t.id });    // consumer-sealed verb; verb-generic
isRecomputing(r) ? showSpinner() : render(r.value);               // re-polls while recomputing; fresh-only
```

## 5. React + who-said-what — `msg.by`

```js
k.bind('urn:ckp:demo/type/Task', (inst) => board.render(inst));   // reactive, by URN pattern

ck.on('event', (msg) => {
  // msg.by  → 'urn:ckp:participant:ana'   (server-attributed, verified end-to-end; the client never asserts it)
  // msg.seq → ledger Ck-Seq
  chat.line(msg.by, msg.data);
});
```
A multi-party session shows who sent what at volume with **no per-client identity logic** — the client
reads `msg.by`; the server derived it (and as of pgCK 0.4.24 it's cryptographically un-forgeable).
`msg.by` is `null` when absent (never fabricated).

## 6. Honest degrades

| Reply | Meaning | Handle |
|---|---|---|
| `[]` from a read | no rows / rejected shape | show empty; check filter keys are declared |
| `{ok:false, error:'invalid_transition', allowed}` | illegal move | offer `allowed` |
| `{ok:true, recompute_in_progress:true}` | value materializing | `doFresh` polls; show "recomputing" |
| `{ok:false, error:'gov_plane_unavailable'}` | governance not granted | hide the governance UI |
| `msg.by === null` | no verified sender attributed | render anonymously |

## 7. Putting it together

```js
import { CK, isRecomputing } from '@conceptkernel/cklib';

const k = await CK.activate('Tasks', { wssEndpoint: 'wss://host/wss', realm: 'demo' });
await k.login('ana', '••••••');                                    // verified → your dispatches are id-scoped

await k.setTransitionMap('urn:ckp:demo/type/Task', { pending: ['sealed'] });
const t = await k.create('urn:ckp:demo/type/Task', { title: 'Ship v1', lifecycle_state: 'pending' });
k.bind(`ckp://Instance#${t.id}`, (i) => board.render(i));

const sealed = await t.transition('sealed');                       // sealed as ana
const score  = await k.doFresh('concept.score', { concept: t.id });
board.badge(t.id, isRecomputing(score) ? 'scoring…' : score.value);

await k.close();
```

Attach, log in, and everything you seal is provably *yours* — no NATS subjects, no query strings, no
client-side authority, and no way to be anyone but who the broker admitted you as. That is CK.Lib.Js v1.5.6.

---

## Reference
[`SPEC.CK-LIB-JS.v1.5.6.md`](./SPEC.CK-LIB-JS.v1.5.6.md) · [`COMPLIANCE.md`](./COMPLIANCE.md) ·
[`README.md`](./README.md) · [`CHANGELOG.md`](./CHANGELOG.md) · [pgCK](https://github.com/styk-tv/pgCK) ·
[oci-germination](https://github.com/sporaxis-com/oci-germination)
