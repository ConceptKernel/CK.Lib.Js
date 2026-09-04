// smoke-surface.mjs — v1.6.4 R18–R22: capability honesty, the `shaped` collision, seat scope,
// the only honest cache keys, and the dual query shape.
// TDD: written FIRST, RED against v1.6.3.
// Spec: SPEC.CK-LIB-JS.v1.6.4 §3 R18–R22; SPEC.CK-DOOR.v1.6.4 §13.1–§13.3 (R-27…R-31).
// Every reply below uses key names MEASURED on pgck.localhost 2026-09-04, not guessed:
//   surface.check    → {…, surface, composed_nodeshapes, engineIdentity:{state,version,build_id,agreement,extversion}}
//   surface.refusals → {count, planes, refusals, registryDigest}
//   surface.typecheck→ {shaped, surface, admitted, surfaceDigest}
// Run: node tests/smoke-surface.mjs
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

console.log('R18 — an empty affordances[] is NOT "no capabilities"; the sibling unsealed is the other half');
try {
  // measured shape: 0 sealed, 40 routed, on a kernel germinated after the last boot
  const { k } = mkKernel(() => ({ ok: true, epoch: 0, kernel: 't', affordances: [], unsealed: ['instance.get', 'instance.query', 'kernel.germinate'] }));
  const c = await k.capabilities();
  ok('declared is the SEALED array (empty here — the ledger really is empty)', Array.isArray(c.declared) && c.declared.length === 0);
  ok('unsealed survives instead of being dropped on the floor', c.unsealed.length === 3);
  ok('routed = declared ∪ unsealed — what will actually answer', c.routed.length === 3);
  ok('gap is the #56 declared/routed distance, as a number', c.gap === 3);
} catch (e) { ok(`k.capabilities() (threw: ${e.message})`, false); }
try {
  const { k } = mkKernel(() => ({ ok: true, affordances: ['instance.get'], unsealed: ['instance.query'] }));
  const c = await k.capabilities();
  ok('a sealed affordance is not double-counted into routed', c.routed.length === 2 && c.gap === 1);
} catch (e) { ok(`capabilities union (threw: ${e.message})`, false); }
console.log('R18 NEGATIVE CONTROL — a genuinely empty kernel must read as empty, not as a gap');
try {
  const { k } = mkKernel(() => ({ ok: true, affordances: [], unsealed: [] }));
  const c = await k.capabilities();
  ok('0 declared / 0 routed / gap 0 — no gap invented where none exists', c.routed.length === 0 && c.gap === 0);
} catch (e) { ok(`empty-kernel control (threw: ${e.message})`, false); }

console.log('R19 — `shaped` means two things; the client stops repeating the ambiguity');
try {
  const { k } = mkKernel(() => ({ ok: true, result: [{ '@id': 'urn:a' }], shaped: false, complete: 'complete' }));
  const rows = await k.query('urn:t/type/X');
  ok('instance.query\'s shaped is surfaced under an UNAMBIGUOUS name', rows.filterKeysConstrained === false);
  ok('it is NOT re-exposed as `shaped` (that word is the gate\'s, not the reader\'s)', rows.shaped === undefined);
  ok('it is non-enumerable — spread/JSON/for..of are byte-identical to before',
     JSON.stringify(rows) === JSON.stringify([{ '@id': 'urn:a' }]) && Object.keys(rows).length === 1);
  ok('completeness still rides beside it, unbroken', rows.completeness === 'complete');
} catch (e) { ok(`filterKeysConstrained (threw: ${e.message})`, false); }

console.log('R20 — surface.* is SEAT-scoped: the cache key carries surfaceDigest or there is no key');
try {
  const { k } = mkKernel(() => ({ ok: true }));
  const reply = { ok: true, kernel: 't', shaped: false, admitted: false, surface: 'urn:ckp:t/shapes/composed', surfaceDigest: 'b62f4618b181fed2' };
  ok('the key binds kernel AND surfaceDigest — never the door alone', k.surface.key(reply) === 't|b62f4618b181fed2');
  let err = null; try { k.surface.key({ ok: true, kernel: 't' }); } catch (e) { err = e; }
  ok('a reply with NO surfaceDigest yields NO key — it throws rather than key on the door',
     !!err && /surfaceDigest/.test(err.message));
} catch (e) { ok(`surface.key (threw: ${e.message})`, false); }
console.log('R20 NEGATIVE CONTROL — two seats on ONE door must not collide');
try {
  const { k } = mkKernel(() => ({ ok: true }));
  const a = k.surface.key({ kernel: 'ck-lib-js', surfaceDigest: 'b62f4618' });
  const b = k.surface.key({ kernel: 'pgck', surfaceDigest: '6c3fd018' });
  ok('different seats on one door produce different keys', a !== b);
} catch (e) { ok(`seat collision control (threw: ${e.message})`, false); }

console.log('R21 — registryDigest is the only honest cache key; build_id joins version');
try {
  const { k } = mkKernel(() => ({ ok: true }));
  const r65 = { ok: true, count: 65, registryDigest: 'a6241916879c67e9' };
  const r64 = { ok: true, count: 64, registryDigest: '92709cb1' };
  ok('the key is the digest', k.surface.refusalsKey(r65) === 'a6241916879c67e9');
  ok('two doors at ONE version with different install histories key differently',
     k.surface.refusalsKey(r65) !== k.surface.refusalsKey(r64));
  ok('the COUNT never appears in the key (65 vs 64 is a coincidence, not an identity)',
     !k.surface.refusalsKey(r65).includes('65'));
  let err = null; try { k.surface.refusalsKey({ ok: true, count: 65 }); } catch (e) { err = e; }
  ok('no digest ⇒ no key, rather than silently keying on the count', !!err && /registryDigest/.test(err.message));
} catch (e) { ok(`refusalsKey (threw: ${e.message})`, false); }
try {
  const { k } = mkKernel(() => ({ ok: true, epoch: 0, kernel: 't',
    engineIdentity: { state: 'agree', version: '0.4.109', build_id: 'v0.4.108-1-g1e5ff13', agreement: true, extversion: '0.4.109' } }));
  const d = await k.doorIdentity();
  ok('buildId is surfaced — it is the ONLY thing distinguishing two doors at one version', d.buildId === 'v0.4.108-1-g1e5ff13');
  ok('version and extversion both survive (a disagreement between them is the finding)', d.version === '0.4.109' && d.extversion === '0.4.109');
  ok('agreement passes through verbatim', d.agreement === true);
} catch (e) { ok(`doorIdentity (threw: ${e.message})`, false); }
console.log('R21 NEGATIVE CONTROL — absent identity must read null, never be invented');
try {
  const { k } = mkKernel(() => ({ ok: true, epoch: 0 }));
  const d = await k.doorIdentity();
  ok('a door that sends no engineIdentity reads null across the board, not a guess',
     d.version === null && d.buildId === null && d.agreement === null);
} catch (e) { ok(`doorIdentity null-honesty (threw: ${e.message})`, false); }

// R22 IS A PIN, NOT A CHANGE. normalizeReply()/flattenRow() (ck.js) already map instance.query's
// `rows` to the flat {'@id', ...body} form, and only when `result` is absent. These assertions
// passed on the FIRST run, before any v1.6.4 edit — they are recorded as a regression pin for
// behaviour PASS-14 §6 flagged as a silent-undefined risk, and NOT claimed as new work.
console.log('R22 [PIN — already correct at v1.6.3] dual query shape; the rows form hides @id inside body');
try {
  const { k } = mkKernel(() => ({ ok: true, rows: [{ id: 'urn:a', body: { '@id': 'urn:a', label: 'A' } }], complete: 'complete' }));
  const rows = await k.query('urn:t/type/X');
  ok('a reply carrying ONLY rows[] is not silently dropped to []', rows.length === 1);
  ok('it is normalised to the FLAT form — @id where a caller expects it', rows[0]['@id'] === 'urn:a' && rows[0].label === 'A');
  ok('the raw {id, body} wrapper never reaches the caller', rows[0].body === undefined);
} catch (e) { ok(`rows normalisation (threw: ${e.message})`, false); }
console.log('R22 [PIN] NEGATIVE CONTROL — result[] stays the preferred form when present');
try {
  const { k } = mkKernel(() => ({ ok: true, result: [{ '@id': 'urn:r' }], rows: [{ id: 'urn:x', body: { '@id': 'urn:x' } }] }));
  const rows = await k.query('urn:t/type/X');
  ok('result[] wins when both are present — one form, chosen deliberately', rows.length === 1 && rows[0]['@id'] === 'urn:r');
} catch (e) { ok(`result precedence (threw: ${e.message})`, false); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
