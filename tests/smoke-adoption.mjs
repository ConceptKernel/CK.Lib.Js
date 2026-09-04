// smoke-adoption.mjs — v1.6.4 R17: adoption.check, and the verify-then-load gate.
// TDD: written FIRST, RED against v1.6.3 (`grep -c adoption ck.js` == 0 — the verb had no facade).
// Spec: SPEC.CK-LIB-JS.v1.6.4 §3 R17; SPEC.CK-DOOR.v1.6.4 §13.1 (R-26).
//
// WHAT IS MEASURED vs SYNTHESISED. The verb ROUTES — measured 2026-09-04 on pgck.localhost,
// answering {drifted:false, modules:[], completeness:{verdict:"complete for recorded loads"}}.
// Its VERDICTS are not measured: that seat has no adoptions, so modules[] is empty. The
// three-value logic below runs against synthesised replies and is honest about it (§13.6).
// Run: node tests/smoke-adoption.mjs
import { ConceptKernel } from '../ck.js';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✅', n); } else { fail++; console.log('  ❌', n); } };
const store = { ingest() {}, retire() {}, get: () => undefined };
const mkKernel = (replies) => {
  const calls = [];
  const k = new ConceptKernel('ckp://Kernel#t', {
    async dispatch(verb, _kernel, payload) { calls.push(verb); return replies(verb, payload); },
  }, store, [], {});
  return { k, calls };
};

console.log('R17.1 — k.adoption.check reaches the verb through the SAME _nsCall as surface/clock');
try {
  const { k, calls } = mkKernel(() => ({ ok: true, drifted: false, modules: [] }));
  await k.adoption.check();
  ok('dispatches adoption.check', JSON.stringify(calls) === '["adoption.check"]');
  ok('k.adoption === k.adoption (memoized, like its siblings)', k.adoption === k.adoption);
} catch (e) { ok(`k.adoption exists and dispatches (threw: ${e.message})`, false); }
try {
  const { k } = mkKernel(() => ({ ok: false, refused: true, sqlstate: '42704', error: 'unknown_affordance' }));
  let err = null; await k.adoption.check().catch((e) => { err = e; });
  ok('a refusal THROWS verbatim — the contract cannot drift from surface.*',
     !!err && err.refused === true && err.sqlstate === '42704' && err.reply?.error === 'unknown_affordance');
} catch (e) { ok(`refusal contract (threw: ${e.message})`, false); }

console.log('R17.2 — three values, three meanings, never collapsed to a boolean');
const mod = (over) => ({ module: 'urn:ckp:module:wave', sourceLoads: 1, ...over });
try {
  const { k } = mkKernel(() => ({ ok: true }));
  ok('true  → verified', k.adoption.loadable(mod({ sourceDigestMatch: true })).verdict === 'verified');
  ok('false → refused (the claim is WRONG — a finding, always)',
     k.adoption.loadable(mod({ sourceDigestMatch: false })).verdict === 'refused');
  ok('null  → unknown, NOT fine and NOT false-y-collapsed',
     k.adoption.loadable(mod({ sourceDigestMatch: null })).verdict === 'unknown');
  ok('the raw value survives on the verdict object (never coerced)',
     k.adoption.loadable(mod({ sourceDigestMatch: null })).sourceDigestMatch === null);
} catch (e) { ok(`three-value split (threw: ${e.message})`, false); }

console.log('R17.3 — the code-loading gate: verified requires match===true AND sourceLoads===1');
try {
  const { k } = mkKernel(() => ({ ok: true }));
  ok('sourceLoads 2 with a TRUE match is REFUSED for code (a graph loaded twice matches its LAST load)',
     k.adoption.loadable(mod({ sourceDigestMatch: true, sourceLoads: 2 })).verdict === 'refused');
  const r = k.adoption.loadable(mod({ sourceDigestMatch: true, sourceLoads: 2 }));
  ok('the reason names the re-load, not a generic failure', r.reasons.some((s) => /sourceLoads/.test(s)));
  const u = k.adoption.loadable(mod({ sourceDigestMatch: null }));
  ok('unknown carries the pgRDF#120 coverage limit — "treat null exactly like false" for code',
     u.reasons.some((s) => /null/.test(s) && /false/.test(s)));
} catch (e) { ok(`load gate (threw: ${e.message})`, false); }

console.log('R17.3 NEGATIVE CONTROL — loadable() must not rubber-stamp');
try {
  const { k } = mkKernel(() => ({ ok: true }));
  ok('a report missing sourceLoads entirely is NOT verified', k.adoption.loadable(mod({ sourceDigestMatch: true, sourceLoads: undefined })).verdict !== 'verified');
  ok('an empty report is NOT verified', k.adoption.loadable({}).verdict !== 'verified');
  ok('loadable() invents no fact — it reports only flags the substrate sent',
     k.adoption.loadable(mod({ sourceDigestMatch: true })).sourceLoads === 1);
} catch (e) { ok(`negative control (threw: ${e.message})`, false); }

console.log('R17.4 — drifted and the substrate note are rendered, never interpreted');
try {
  const NOTE = "drifted:true means an adopted module's graph no longer matches its first-composition pin";
  const { k } = mkKernel(() => ({ ok: true, drifted: true, note: NOTE, modules: [mod({ sourceDigestMatch: true })],
    completeness: { verdict: 'complete for recorded loads' } }));
  const r = await k.adoption.check();
  ok('drifted passes through untouched', r.drifted === true);
  ok('the substrate note survives verbatim', r.note === NOTE);
  ok('the SCOPED completeness verdict is not flattened to "complete"', r.completeness.verdict === 'complete for recorded loads');
} catch (e) { ok(`drift rendering (threw: ${e.message})`, false); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
