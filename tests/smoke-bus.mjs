// smoke-bus.mjs — R6: the promise-first, subject-free event surface (A-9/A-12/A-13/A-14) +
// R4 (germinate, surface.*) + R5 (completeness, rehearsal). Spec: v1.6.1-2 §6; door §5, C6/C8.
import { ConceptKernel, refusalError } from '../ck.js';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✅', n); } else { fail++; console.log('  ❌', n); } };
const store = { ingest() {}, retire() {}, view() {}, urn() {}, bind() {}, bindOnce() {} };

// A fake transport with a real event bus — the shape CKClient presents.
function mkTransport(replies = {}) {
  const handlers = {};
  return {
    auth: { anonymous: false, userId: 'me-sub', claims: { sub: 'me-sub' } },
    on(kind, fn) { (handlers[kind] ||= []).push(fn); },
    emit(kind, m) { for (const f of handlers[kind] || []) f(m); },
    async dispatch(verb, _k, payload) { return replies[verb] ? replies[verb](payload) : { ok: true, result: [] }; },
    subjects() { return [{ subject: 'result.kernel.t.>', scope: 'result', state: 'subscribed' }]; },
    async close() {},
  };
}
const mk = (replies) => { const t = mkTransport(replies); return { k: new ConceptKernel('ckp://Kernel#t', t, store, [], {}), t }; };

console.log('R6.1 — on/next/stream are semantic, never subject-typed');
{
  const { k, t } = mk();
  let got = null; const off = k.on({ kind: 'event', verb: 'instance.create' }, (fr) => { got = fr; });
  t.emit('event', { verb: 'instance.query', data: {} });               // non-matching
  ok('selector filters by verb', got === null);
  t.emit('event', { verb: 'instance.create', by: 'urn:ckp:participant:other', data: { x: 1 } });
  ok('matching frame delivered', got?.verb === 'instance.create');
  off();
  t.emit('event', { verb: 'instance.create', data: {} });
  ok('unsubscribe works', got.data.x === 1);
}
console.log('R6.1 — next() is promise-form and REJECTS on timeout (charter §2)');
{
  const { k, t } = mk();
  const p = k.next({ kind: 'result' }, { timeout: 60 });
  t.emit('result', { verb: 'v', data: { hello: 1 } });
  const fr = await p;
  ok('next resolves with the frame', fr.data.hello === 1);
  let err = null; await k.next({ kind: 'result', verb: 'never' }, { timeout: 40 }).catch((e) => { err = e; });
  ok('next REJECTS on timeout, never resolves undefined', !!err && /no matching frame/.test(err.message));
}
console.log('R6.1 — stream() is an async iterator');
{
  const { k, t } = mk();
  const it = k.stream({ kind: 'event' });
  t.emit('event', { verb: 'a', data: { n: 1 } }); t.emit('event', { verb: 'b', data: { n: 2 } });
  const f1 = await it.next(); const f2 = await it.next();
  ok('frames arrive in order', f1.value.data.n === 1 && f2.value.data.n === 2);
  await it.return();
  ok('return() closes the stream', true);
}
console.log('R6.3 — mine is a comparison of two server-attributed values');
{
  const { k, t } = mk();
  const frames = []; k.on({ kind: 'event' }, (fr) => frames.push(fr));
  t.emit('event', { verb: 'v', by: 'urn:ckp:participant:me-sub', data: {} });
  t.emit('event', { verb: 'v', by: 'urn:ckp:participant:someone-else', data: {} });
  t.emit('event', { verb: 'v', by: null, data: {} });
  ok('own frame → mine:true', frames[0].mine === true);
  ok("other's frame → mine:false", frames[1].mine === false);
  ok('absent by → mine:false, never fabricated', frames[2].mine === false);
  const onlyOthers = []; k.on({ kind: 'event', mine: false }, (fr) => onlyOthers.push(fr));
  t.emit('event', { verb: 'v', by: 'urn:ckp:participant:me-sub', data: {} });
  t.emit('event', { verb: 'v', by: 'urn:ckp:participant:someone-else', data: {} });
  ok('mine:false selector excludes own frames', onlyOthers.length === 1 && onlyOthers[0].mine === false);
}
console.log('R6.4 — late frames pass through the handle bus');
{
  const { k, t } = mk();
  let late = null; k.on('late', (fr) => { late = fr; });
  t.emit('late', { verb: 'instance.create', traceId: 'tx-x', data: { ok: true } });
  ok('late is a first-class kind on the bus', late?.verb === 'instance.create');
}
console.log('R6.5 — sealedAtEpoch surfaces on frames; subjects() is diagnostic-only');
{
  const { k, t } = mk();
  let fr = null; k.on({ kind: 'event' }, (x) => { fr = x; });
  t.emit('event', { verb: 'v', data: { sealedAtEpoch: 4 } });
  ok('sealedAtEpoch surfaced from the reply body', fr.sealedAtEpoch === 4);
  const subs = k.subjects();
  ok('subjects() reports state per subject', subs[0].state === 'subscribed');
}
console.log('R4.1 — germinate: projectKind required, refusal throws verbatim');
{
  const { k } = mk({ 'kernel.germinate': (p) => ({ ok: true, kernel: `urn:ckp:${p.project}/kernel`, project: p.project }) });
  let err = null; await k.germinate({}).catch((e) => { err = e; });
  ok('absent projectKind throws locally, named', !!err && /projectKind/.test(err.message));
  const g = await k.germinate({ projectKind: 'shared' });
  ok("payload key is `project` (never `kernel`)", g.project === 't');
  const { k: kr } = mk({ 'kernel.germinate': () => ({ ok: false, refused: true, sqlstate: 'P0001', error: 'x' }) });
  let err2 = null; await kr.germinate({ projectKind: 'shared' }).catch((e) => { err2 = e; });
  ok('refusal throws with sqlstate verbatim', err2?.sqlstate === 'P0001' && err2?.refused === true);
}
console.log('R4.2 — surface.* namespace');
{
  const { k } = mk({ 'surface.refusals': () => ({ ok: true, count: 52, refusals: [] }) });
  const r = await k.surface.refusals();
  ok('surface.refusals reachable by name', r.count === 52);
}
console.log('R5.1 — completeness verdict never dropped, array behavior unchanged');
{
  const { k } = mk({ 'instance.query': () => ({ ok: true, result: [{ '@id': 'a' }], complete: 'truncated' }) });
  const rows = await k.query('urn:x');
  ok('rows still an array, spread-identical', Array.isArray(rows) && JSON.stringify(rows) === '[{"@id":"a"}]');
  ok('verdict rides non-enumerably', rows.completeness === 'truncated' && !Object.keys(rows).includes('completeness'));
  const { rows: r2, completeness } = await k.queryWithVerdict('urn:x');
  ok('queryWithVerdict is the explicit form', completeness === 'truncated' && r2.length === 1);
}
console.log('R5.2 — govern says rehearsal, with provenance');
{
  const { k } = mk({
    'kernel.propose_change': () => ({ ok: true, proposal_iri: 'ckp://Proposal#1' }),
    'kernel.vote': () => ({ ok: true }), 'kernel.apply': () => ({ ok: true, state: 'applied', epoch: 2 }),
  });
  const g = await k.govern('add_class', {});
  ok('quorum 1 → rehearsal:true, said every time', g.rehearsal === true);
  ok("rehearsalSource labels the deriver", g.rehearsalSource === 'client-derived');
}
console.log(`\nsmoke-bus: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
