// smoke-ownership.mjs — v1.6.4 R24: the ownership pre-flight and the attribution render.
// TDD: written FIRST, RED against v1.6.3 (no ownedBy in writeResult; no pre-flight; no crossOwner).
// Spec: SPEC.CK-LIB-JS.v1.6.4 §3 R24 + §4; SPEC.CK-DOOR.v1.6.4 §13.4 (R-33).
//
// WHAT THIS SUITE IS AND IS NOT. It proves the CLIENT renders an exposure and refuses to
// ORIGINATE a foreign-row write. It proves nothing about the door: measured 2026-09-04, the
// write SUCCEEDS server-side and rewrites createdBy to the patcher. This is a pattern guard,
// never a control (R24.5). The negative controls below are what stop it becoming a lie.
// Run: node tests/smoke-ownership.mjs
import { ConceptKernel } from '../ck.js';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✅', n); } else { fail++; console.log('  ❌', n); } };
const store = { ingest() {}, retire() {}, get: () => undefined };

// Synthetic fixtures. Offline tests exercise CLIENT logic against fabricated replies —
// real realm participant ids would add nothing and put private-realm identifiers in a public repo.
const MINE  = '11111111-1111-4111-8111-111111111111';
const OTHER = 'urn:ckp:participant:22222222-2222-4222-8222-222222222222';
const P = 'https://conceptkernel.org/ontology/v3.11/core#';

// A handle whose transport records every dispatch, and whose auth carries a verified sub.
const mkKernel = (replies, { sub = MINE, st = store } = {}) => {
  const calls = [];
  const k = new ConceptKernel('ckp://Kernel#t', {
    auth: { claims: { sub } },
    async dispatch(verb, _kernel, payload) { calls.push({ verb, payload }); return replies(verb, payload); },
  }, st, [], {});
  return { k, calls };
};
// instance.get reply for a row created by `by`
const rowBy = (by) => ({ ok: true, instance: { id: 'urn:ckp:pgck/kernel', body: { '@id': 'urn:ckp:pgck/kernel', [P + 'createdBy']: by } } });

console.log('R24.1 — every write reply surfaces ownedBy beside the other four stamps');
try {
  const { k } = mkKernel(() => ({ ok: true, id: 'organ-1', verified: true,
    createdBy: 'urn:ckp:participant:' + MINE, producedBy: 'urn:ckp:t/kernel/ck',
    sealedAtEpoch: 0, conformsToShape: P + 'OrganShape',
    ownedBy: 'urn:ckp:participant:00000000-0000-0000-0000-000000000000' }));
  const w = await k.create(P + 'Organ', { label: 'x' });
  ok('ownedBy is surfaced verbatim (measured: it is the ONE stamp a client can forge)',
     w.ownedBy === 'urn:ckp:participant:00000000-0000-0000-0000-000000000000');
} catch (e) { ok(`ownedBy surfaced (threw: ${e.message})`, false); }
try {
  const { k } = mkKernel(() => ({ ok: true, id: 'organ-1', verified: true }));
  const w = await k.create(P + 'Organ', { label: 'x' });
  ok('absent ownedBy reads null — never invented, never true', w.ownedBy === null);
} catch (e) { ok(`ownedBy null-honest (threw: ${e.message})`, false); }

console.log('R24.2 — update/retire/transition refuse to ORIGINATE a write against a foreign row');
for (const [name, run] of [
  ['update',     (k) => k.update('urn:ckp:pgck/kernel', { label: 'x' })],
  ['retire',     (k) => k.retire('urn:ckp:pgck/kernel', 'reason')],
  ['transition', (k) => k.transition('urn:ckp:pgck/kernel', 'retired')],
]) {
  try {
    const { k, calls } = mkKernel((verb) => verb === 'instance.get' ? rowBy(OTHER) : { ok: true, id: 'x' });
    let err = null; await run(k).catch((e) => { err = e; });
    ok(`${name}() throws on a row created by another participant`, !!err);
    ok(`${name}() names the door rule that permits it (CK-DOOR R-33)`, !!err && /R-33/.test(err.message));
    ok(`${name}() dispatched NO write — only the pre-flight read`, calls.every((c) => c.verb === 'instance.get'));
  } catch (e) { ok(`${name} foreign-row guard (threw: ${e.message})`, false); }
}

console.log('R24.2 NEGATIVE CONTROL — the guard must NOT fire on my own row');
for (const [name, run] of [
  ['update', (k) => k.update('urn:ckp:pgck/kernel', { label: 'x' })],
  ['retire', (k) => k.retire('urn:ckp:pgck/kernel', 'reason')],
]) {
  try {
    const { k, calls } = mkKernel((verb) => verb === 'instance.get'
      ? rowBy('urn:ckp:participant:' + MINE) : { ok: true, id: 'urn:ckp:pgck/kernel', verified: true });
    const w = await run(k);
    ok(`${name}() on my OWN row proceeds (a guard that fires always is not a guard)`, w.ok === true);
    ok(`${name}() actually dispatched the write`, calls.some((c) => c.verb !== 'instance.get'));
  } catch (e) { ok(`${name} own-row negative control (threw: ${e.message})`, false); }
}

console.log('R24.2a — the guard stands down when it cannot KNOW, and the write proceeds');
try {
  const { k } = mkKernel((verb) => verb === 'instance.get'
    ? { ok: false, refused: true, sqlstate: '42704', error: 'no instance resolves' } : { ok: true, id: 'x' });
  const w = await k.update('urn:ckp:pgck/kernel', { label: 'x' });
  ok('a REFUSED pre-flight read does not substitute for the write refusal', w.ok === true);
} catch (e) { ok(`pre-flight refusal stands down (threw: ${e.message})`, false); }
try {
  const { k } = mkKernel((verb) => verb === 'instance.get' ? rowBy(OTHER) : { ok: true, id: 'x' }, { sub: null });
  const w = await k.update('urn:ckp:pgck/kernel', { label: 'x' });
  ok('an undeterminable own-sub stands down rather than guessing', w.ok === true);
} catch (e) { ok(`unknown-sub stands down (threw: ${e.message})`, false); }

console.log('R24.3 — { crossOwner: true } is the explicit, per-call opt-out');
try {
  const { k, calls } = mkKernel((verb) => verb === 'instance.get' ? rowBy(OTHER) : { ok: true, id: 'x', verified: true });
  const w = await k.update('urn:ckp:pgck/kernel', { label: 'x' }, { crossOwner: true });
  ok('crossOwner:true proceeds to the write', w.ok === true && calls.some((c) => c.verb === 'instance.update'));
} catch (e) { ok(`crossOwner opt-out (threw: ${e.message})`, false); }

console.log('R24.4 — the local throw is NOT dressed as a wire verdict');
try {
  const { k } = mkKernel((verb) => verb === 'instance.get' ? rowBy(OTHER) : { ok: true, id: 'x' });
  let err = null; await k.update('urn:ckp:pgck/kernel', { label: 'x' }).catch((e) => { err = e; });
  ok('refused is false — no server refused this; the client declined to send', !!err && err.refused === false);
  ok('sqlstate is null — a local refusal carries no substrate class', !!err && err.sqlstate === null);
  ok('no `reply` is attached — there is no reply, and inventing one would be the lie', !!err && err.reply === undefined);
} catch (e) { ok(`local-throw shape (threw: ${e.message})`, false); }

console.log('R24.5 — the guard says out loud that it is a pattern, not a control');
try {
  const { k } = mkKernel((verb) => verb === 'instance.get' ? rowBy(OTHER) : { ok: true, id: 'x' });
  let err = null; await k.update('urn:ckp:pgck/kernel', { label: 'x' }).catch((e) => { err = e; });
  ok('the message states the write WOULD SUCCEED (it does — that is the finding)', !!err && /would\s+SUCCEED/i.test(err.message));
  ok('the message names the attribution rewrite', !!err && /createdBy/.test(err.message));
  ok('the message names the escape hatch', !!err && /crossOwner/.test(err.message));
} catch (e) { ok(`guard honesty text (threw: ${e.message})`, false); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
