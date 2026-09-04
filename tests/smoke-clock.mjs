// smoke-clock.mjs — v1.6.3 R11: the clock surface, and the constitutional limit rendered.
// TDD: written FIRST, RED against v1.6.1 (no k.clock namespace; no R-20 rendering).
// Spec: SPEC.CK-LIB-JS.v1.6.3 §3 R11; SPEC.CK-DOOR.v1.6.3 §11.5 (R-20/R-21), C14.
// The law that bounds these verbs predates them: a Score crossing thresholdPromote DRAFTS —
// the tick never seals content, votes, or applies. This suite proves the CLIENT holds that
// line in rendering; the substrate's own half is CK-DOOR §11.7 (wire, blocked on the fleet).
// Run: node tests/smoke-clock.mjs
import { ConceptKernel } from '../ck.js';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✅', n); } else { fail++; console.log('  ❌', n); } };
const store = { ingest() {}, retire() {}, get: () => undefined };
const mkKernel = (replies) => new ConceptKernel('ckp://Kernel#t', {
  async dispatch(verb, _kernel, payload) { return replies(verb, payload); },
}, store, [], {});

console.log('R11.1 — k.clock namespace: next/tick/boundary reach the three verbs, nothing else');
try {
  const calls = [];
  const k = mkKernel((verb) => { calls.push(verb); return { ok: true, epochUnchanged: true }; });
  await k.clock.next(); await k.clock.tick(); await k.clock.boundary({ about: 'urn:x', dwellMillis: 5, events: 1 });
  ok('verbs are orbit.next / score.tick / signal.boundary', JSON.stringify(calls) === '["orbit.next","score.tick","signal.boundary"]');
} catch (e) { ok(`k.clock exists and dispatches (threw: ${e.message})`, false); }

console.log('R11.2 — no_orbit_declared is a REFUSAL, never a zero shaped like a time');
try {
  const k = mkKernel(() => ({ ok: false, refused: true, sqlstate: '42704', error: 'no_orbit_declared', hint: 'this kernel declares no orbitPeriodSeconds/orbitAnchor — no orbit is a real answer, not a zero.' }));
  let err = null; const v = await k.clock.next().catch((e) => { err = e; return undefined; });
  ok('throws with the clause verbatim ("this kernel keeps no clock")', !!err && err.reply?.error === 'no_orbit_declared' && err.sqlstate === '42704');
  ok('no zero/null/fabricated time escapes', v === undefined);
} catch (e) { ok(`no_orbit_declared path (threw: ${e.message})`, false); }

console.log('R11.3 — never_saw is ok:true and renders as the SUCCESS it is');
try {
  const k = mkKernel(() => ({ ok: true, sealed: false, reason: 'never_saw', hint: 'the never-saw state is the absence of a Signal, which is correctly free — nothing seals' }));
  const r = await k.clock.boundary({ about: 'urn:x' });
  ok('returns (no throw): sealed:false + reason verbatim — absence of a Signal is correctly free', r.ok === true && r.sealed === false && r.reason === 'never_saw');
} catch (e) { ok(`never_saw path (threw: ${e.message})`, false); }

console.log('R11.0 — the constitutional limit: epochUnchanged:false is a DOOR VIOLATION, said, not rendered');
try {
  const k = mkKernel(() => ({ ok: true, kernel: 't', epoch: 3, epochUnchanged: false, scores: [], drafted: [] }));
  let err = null; await k.clock.tick().catch((e) => { err = e; });
  ok('tick() throws naming CK-DOOR R-20 when the tick moved the epoch', !!err && /R-20/.test(err.message));
} catch (e) { ok(`R-20 rendering (threw: ${e.message})`, false); }
try {
  const k = mkKernel(() => ({ ok: true, kernel: 't', epoch: 3, epochUnchanged: true,
    scores: [{ about: 'urn:c', score: 1.2 }], drafted: [{ proposal: 'proposal-draft-1', about: 'urn:c', score: 1.2 }],
    law: { weightAssent: 1.0, thresholdPromote: 1.0, defaultsNote: 'values absent from the sealed Kernel are the NAMED substrate defaults, never invented per call' },
    note: 'the tick may DRAFT only — no vote sealed, nothing applied, no epoch advanced' }));
  const r = await k.clock.tick();
  ok('a lawful tick returns verbatim — scores, drafted, law with defaultsNote, the note', r.epochUnchanged === true && r.drafted.length === 1 && /NAMED substrate defaults/.test(r.law.defaultsNote) && /DRAFT only/.test(r.note));
} catch (e) { ok(`lawful tick pass-through (threw: ${e.message})`, false); }

console.log('R11.7 — proposalState draft never faults the client (pass-3 law)');
try {
  const k = mkKernel(() => ({ ok: true, result: [{ '@id': 'ckp://Proposal#d1', proposalState: 'draft' }] }));
  const rows = await k.query('urn:ckp:t/type/Proposal');
  ok('a draft row passes through untouched — a suggestion, never a fault', rows.length === 1 && rows[0].proposalState === 'draft');
} catch (e) { ok(`draft handling (threw: ${e.message})`, false); }

console.log('R13 — germination stamps pass through; NEITHER spelling is read as live epoch');
try {
  const KURN = 'urn:ckp:t/kernel';
  const body = { '@id': KURN, 'https://conceptkernel.org/ontology/v3.11/core#germinatedAtEpoch': 0 };
  const k = mkKernel(() => ({ ok: true, result: body }));
  const g = await k.get(KURN);
  ok('germinatedAtEpoch passes through uninterpreted (0 is a birth fact, not a live epoch)', g['https://conceptkernel.org/ontology/v3.11/core#germinatedAtEpoch'] === 0);
  const old = { '@id': KURN, 'https://conceptkernel.org/ontology/v3.11/core#epoch': 2 };
  const k2 = mkKernel(() => ({ ok: true, result: old }));
  const g2 = await k2.get(KURN);
  ok('pre-rename ckp:epoch also passes through (fenced history; emitter follows the LOADED law)', g2['https://conceptkernel.org/ontology/v3.11/core#epoch'] === 2);
} catch (e) { ok(`germination stamp pass-through (threw: ${e.message})`, false); }

console.log('R23 (v1.6.4) — signal.boundary\'s payload contract is written down, and NOT enforced locally');
try {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('../ck.js', import.meta.url), 'utf8');
  const doc = src.slice(src.indexOf('signal.boundary — ONE hash-chained'), src.indexOf('boundary: this._nsCall'));
  ok('the doc names all three keys: about · dwellMillis · events (PASS-14 §6 documented the semantics without them)',
     doc.length > 0 && /\babout\b/.test(doc) && /\bdwellMillis\b/.test(doc) && /\bevents\b/.test(doc));
} catch (e) { ok(`boundary contract documented (threw: ${e.message})`, false); }
try {
  const calls = [];
  const k2 = new ConceptKernel('ckp://Kernel#t', {
    async dispatch(verb) { calls.push(verb); return { ok: false, refused: true, sqlstate: '22004', error: 'missing_param', hint: 'signal.boundary needs {about: <concept IRI>, dwellMillis, events}' }; },
  }, store, [], {});
  let err = null; await k2.clock.boundary({}).catch((e) => { err = e; });
  ok('an incomplete payload is DISPATCHED, not locally pre-empted — the substrate hint beats any the client would invent',
     calls.length === 1 && calls[0] === 'signal.boundary');
  ok('the substrate hint reaches the caller verbatim', !!err && /about.*dwellMillis.*events/.test(err.reply?.hint ?? ''));
} catch (e) { ok(`no local requiredness check (threw: ${e.message})`, false); }

console.log(`\nsmoke-clock: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
