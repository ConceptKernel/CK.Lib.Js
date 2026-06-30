// smoke-ck-store.mjs — local verification of the typed-instance cache (no quads).
// Run: node tests/smoke-ck-store.mjs
import CKStore, { CKSubject, CKView, ckBind, instanceEdges } from '../ck-store.js';

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log('  ✅', name); } else { fail++; console.log('  ❌', name); } };
const tick = () => new Promise((r) => setTimeout(r, 0)); // let the microtask flush run

console.log('CKStore typed-instance cache — smoke');

// 1. ingest a single instance + get
const s = new CKStore();
s.ingest({ '@id': 'ckp://Instance#t1', '@type': 'Task', title: 'A', seq: 1 });
ok('ingest instance → get', s.get('ckp://Instance#t1')?.title === 'A');
ok('has()', s.has('ckp://Instance#t1') === true && s.has('nope') === false);
ok('size', s.size === 1);

// 2. ingest a dispatch reply envelope { ok, result }
s.ingest({ ok: true, id: 'ckp://Instance#t2', result: { '@id': 'ckp://Instance#t2', type: 'Task', title: 'B' } });
ok('ingest reply envelope → cached', s.get('ckp://Instance#t2')?.title === 'B');
ok('ok:false envelope ignored', s.ingest({ ok: false, result: { '@id': 'x' } }) === 0);

// 3. ingest array
ok('ingest array', s.ingest([{ '@id': 'a' }, { '@id': 'b' }]) === 2 && s.has('a') && s.has('b'));

// 4. dedup-by-seq
s.ingest({ '@id': 'ckp://Instance#t1', title: 'A-stale', seq: 0 });
ok('dedup-by-seq drops stale (seq 0 < 1)', s.get('ckp://Instance#t1').title === 'A');
s.ingest({ '@id': 'ckp://Instance#t1', '@type': 'Task', title: 'A2', seq: 5 });
ok('newer seq updates', s.get('ckp://Instance#t1').title === 'A2');

// 5. replace-by-id (default true)
ok('replace-by-id replaces (no merge of old keys)', s.get('ckp://Instance#t1').title === 'A2');

// 6. urn() → CKSubject
const sub = s.urn('ckp://Instance#t2');
ok('urn() returns CKSubject', sub instanceof CKSubject && sub.exists() && sub.get().title === 'B');
ok('urn() null for missing', s.urn('missing') === null);
ok('CKSubject.type()', sub.type() === 'Task');

// 7. edges (id-node refs)
s.ingest({ '@id': 'ckp://Instance#g1', '@type': 'Goal', owner: { '@id': 'ckp://Instance#t2' }, tags: [{ '@id': 'x' }, { '@id': 'y' }] });
ok('instanceEdges finds id-node refs', JSON.stringify(instanceEdges(s.get('ckp://Instance#g1')).sort()) === JSON.stringify(['ckp://Instance#t2', 'x', 'y']));

// 8. reactive view + change event (microtask-batched, edge delta)
const v = s.view('ckp://Instance#g1');
let changeEvt = null;
v.on('change', (e) => { changeEvt = e; });
s.ingest({ '@id': 'ckp://Instance#g1', '@type': 'Goal', owner: { '@id': 'ckp://Instance#t2' }, tags: [{ '@id': 'y' }, { '@id': 'z' }] });
await tick();
ok('CKView change fires after microtask', changeEvt !== null);
ok('CKView change reports added edges', changeEvt && changeEvt.added.includes('z'));
ok('CKView change reports removed edges', changeEvt && changeEvt.removed.includes('x'));
ok('CKView.get() reflects update', v.get().tags.length === 2);

// 9. bind patterns
let starHits = 0, instHits = 0, onceHits = 0;
s.bind('*', () => { starHits++; });
s.bind('ckp://Instance#z1', () => { instHits++; });
s.bindOnce('*', () => { onceHits++; });
s.ingest({ '@id': 'ckp://Instance#z1', '@type': 'Task' });
s.ingest({ '@id': 'ckp://Instance#z2', '@type': 'Task' });
await tick();
ok("bind('*') fires for each ingest", starHits === 2);
ok('bind(exact-urn) fires only for match', instHits === 1);
ok('bindOnce fires once', onceHits === 1);

// 10. unbind
const unbind = s.bind('*', () => { starHits++; });
unbind();
const before = starHits;
s.ingest({ '@id': 'ckp://Instance#z3' });
await tick();
ok('unbind() stops callback', starHits === before + 1); // only the original '*' bind, not the unbound one

// 11. recent ring bounded
const r = new CKStore({ recentCapacity: 3 });
for (let i = 0; i < 6; i++) r.ingest({ '@id': 'r' + i });
ok('recent() bounded to capacity', r.recent().length === 3 && r.size === 6);

// 12. NOT an RDF store — no quad/triple surface
ok('no toQuads/toRdfJs/quads on CKStore', !('toQuads' in s) && !('toRdfJs' in s) && !('quads' in s));

// 13. dispose
v.dispose();
s.dispose();
ok('dispose clears cache', s.size === 0);

console.log(`\n${fail === 0 ? '✅ PASS' : '❌ FAIL'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
