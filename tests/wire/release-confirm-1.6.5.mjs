// tests/wire/release-confirm-1.6.5.mjs — WHAT EXACTLY IS IN v1.6.5, confirmed over the wire.
//
// One rung per v1.6.5 requirement (R25…R32) AND pgCK PASS-16's T1–T6, exercised THROUGH THE
// RELEASED LIBRARY SURFACE (CK.activate / k.* — the raw door only where the test's point is the
// raw door), against a door serving this exact working tree. Reads only, EXCEPT the CK_BEAT=1
// block (germinate · seal a deliberately wrong Adoption · supersede it · adopt cleanly · T6).
// Three-state honest; expected refusals are passes. Every digest is READ OFF THE DOOR — none is
// typed here (build rule 8).
//
//   CK_DOOR=wss://pgck.localhost/wss CK_KERNEL=ck-lib-js CK_TOKEN=<bearer> [CK_BEAT=1] \
//   node tests/wire/release-confirm-1.6.5.mjs
//
// Exit: 0 GREEN · 44 RED-measured · 1 BROKEN (never climbed / activation failed)
import { CK, VERSION } from '../../ck.js';

const DOOR   = process.env.CK_DOOR   || 'wss://pgck.localhost/wss';
const KERNEL = process.env.CK_KERNEL || 'ck-lib-js';
const TOKEN  = process.env.CK_TOKEN  || null;
const BEAT   = process.env.CK_BEAT === '1';
const CORE   = 'https://conceptkernel.org/ontology/v3.11/core#';
const WAVE   = 'urn:ckp:module:wave';
const LEX    = 'urn:ckp:module:lexicon';

let pass = 0, fail = 0, skip = 0;
const ok = (id, name, c, detail = '') => {
  if (c) { pass++; console.log(`  ✅ ${id} ${name}${detail ? ' — ' + detail : ''}`); }
  else   { fail++; console.log(`  ❌ ${id} ${name}${detail ? ' — ' + detail : ''}`); }
};
const skipped = (id, name, why) => { skip++; console.log(`  ⏭  ${id} ${name} — ${why}`); };
const short = (d) => (d ? String(d).slice(0, 12) + '…' : String(d));
// warm-up: one cold dispatch is not a finding — retry ONCE, reads only, and say so
const read = async (fn) => { try { return await fn(); } catch (e) { if (e.refused || e.localGuard) throw e; console.log('     (cold dispatch faulted; retrying once, read-only)'); return fn(); } };

console.log(`release-confirm v1.6.5 — ${DOOR} · kernel ${KERNEL} · lib VERSION ${VERSION}\n`);
let k = null;
try { k = await CK.activate(KERNEL, { wssEndpoint: DOOR, ...(TOKEN ? { tokenProvider: async () => TOKEN } : {}) }); }
catch (e) { console.log(`BROKEN — activation failed: ${e.message}`); process.exit(1); }

console.log('T1 / R31 — divergence literacy: extversion is the law surface');
try {
  const d = await read(() => k.doorIdentity());
  ok('W1', 'doorIdentity renders lawSurface = extversion, never throws', d.lawSurface === d.extversion && d.extversion != null, `state ${d.state} · extversion ${d.extversion} · version() ${d.version} · build ${d.buildId}`);
  if (d.state === 'diverged') ok('W1b', 'diverged carries the documented lag WITH the cure named (not an error, not 0.4.111)', /restart/.test(d.note ?? '') && d.agreement === false, d.note?.slice(0, 90) + '…');
  else skipped('W1b', 'diverged rendering', `engineIdentity ${d.state} — the lag is not present on this door right now`);
} catch (e) { ok('W1', 'doorIdentity', false, e.message.slice(0, 120)); }

console.log('R25 — recorded(): the loader record BEFORE adoption, read off the door');
let recWave = null;
try {
  const r = await read(() => k.adoption.recorded(WAVE));
  recWave = r.sourceRecorded;
  if (r.reference === null) ok('W2', 'this door has NO reference band — recorded() says so by name (pre-0.4.112)', /R-34/.test(r.note ?? ''), r.note?.slice(0, 80));
  else ok('W2', 'recorded(wave) answers sourceRecorded pre-adoption (R-34 met through the PRE band)', /^[0-9a-f]{64}$/.test(r.sourceRecorded ?? '') && r.moduleResolves === true, `sourceRecorded ${short(r.sourceRecorded)}`);
  const l = await read(() => k.adoption.recorded(LEX));
  ok('W2b', 'recorded(lexicon) answers too — a second module, same read', l.reference === null || /^[0-9a-f]{64}$/.test(l.sourceRecorded ?? ''), `sourceRecorded ${short(l.sourceRecorded)}`);
  const row = await read(() => k.adoption.row(WAVE));
  ok('W2c', 'row(wave) is null-honest until this seat adopts (payload-blind adoption.check, filtered client-side)', row === null || typeof row === 'object', row ? `already adopted: loads ${row.sourceLoads}` : 'null');
} catch (e) { ok('W2', 'recorded()', false, e.message.slice(0, 120)); }

console.log('T2 / T3 / T4 / R30 — validate(): the PRE band, verbatim, two bands never folded');
try {
  const s = await read(() => k.surface.check());
  const base = { type: `${CORE}Adoption`, adopts: WAVE, intoProject: `urn:ckp:project:${KERNEL}`, intoEpoch: s.epoch };
  const t2 = await read(() => k.validate({ ...base, sourceDigest: '9'.repeat(64) }));
  ok('W3', 'T2 — wrong digest: conforms:true (shape-only) AND reference.sourceDigestMatch === false', t2.conforms === true && t2.reference?.sourceDigestMatch === false, `sourceRecorded ${short(t2.reference?.sourceRecorded)}`);
  ok('W3b', 'T2 — exactly one check-keyed warning, check:"sourceDigestMatch"', t2.referenceWarnings?.length === 1 && t2.referenceWarnings[0].check === 'sourceDigestMatch');
  if (recWave) {
    const t3 = await read(() => k.validate({ ...base, sourceDigest: recWave }));
    ok('W3c', 'T3 — the recorded digest (read in W2, never typed): all three reference fields true, ZERO check-keyed warnings', t3.reference?.sourceDigestMatch === true && t3.reference.moduleResolves === true && t3.reference.targetHasGraphs === true && t3.referenceWarnings?.length === 0);
  } else skipped('W3c', 'T3 clean control', 'no recorded digest to read (pre-band door or unrecorded load)');
  const t4 = await read(() => k.validate({ ...base, intoProject: 'urn:ckp:project:cklib-t4-nowhere', sourceDigest: '9'.repeat(64) }));
  ok('W3d', 'T4 — dangling target: reference.targetHasGraphs === false with its own warning', t4.reference?.targetHasGraphs === false && t4.referenceWarnings?.some((w) => w.check === 'targetHasGraphs'));
  const n = await read(() => k.validate({ type: `${CORE}Kernel`, label: 'x' }));
  ok('W3e', 'NEGATIVE CONTROL — a non-Adoption body carries reference:null (the band is type-scoped)', n.reference === null);
} catch (e) { ok('W3', 'validate bands', false, e.message.slice(0, 120)); }

console.log('R26 — dryRun(): the door does the checking, the client names the census verdicts');
try {
  const bad = await read(() => k.adoption.dryRun({ adopts: 'urn:ckp:module:doesnotexist' }));
  ok('W4', 'NEGATIVE CONTROL — a nonexistent IRI ⇒ module_absent (refuse) carrying the door\'s malformed prose', bad.ok === false && bad.findings.some((f) => f.code === 'module_absent' && /malformed/i.test(f.message)));
  const dr = await read(() => k.adoption.dryRun({ adopts: WAVE }));
  console.log(`     wave: ok=${dr.ok} · digest.source=${dr.digest.source} · derived ${short(dr.digest.derived)} · findings ${dr.findings.map((f) => `${f.severity}:${f.code}`).join(' ') || 'none'}`);
  ok('W4b', 'dryRun(wave) composed a body with intoProject derived from the seat and intoEpoch from surface.check', dr.body ? (dr.body.intoProject === `urn:ckp:project:${KERNEL}` && Number.isInteger(dr.body.intoEpoch)) : dr.findings.some((f) => f.code === 'digest_underivable'), dr.body ? `epoch ${dr.body.intoEpoch}` : 'no body (underivable, stated)');
  const wrong = await read(() => k.adoption.dryRun({ adopts: WAVE, sourceDigest: '9'.repeat(64), transcribed: true }));
  ok('W4c', 'a WRONG digest is refused as digest_disagrees even with transcribed:true — a record beats a transcription', wrong.ok === false && wrong.findings.some((f) => f.code === 'digest_disagrees'));
} catch (e) { ok('W4', 'dryRun()', false, e.message.slice(0, 120)); }

console.log('R28 — create() on core#Adoption takes the ladder (a wrong digest never leaves the seat)');
try {
  let err = null;
  await k.create(`${CORE}Adoption`, { adopts: WAVE, sourceDigest: '9'.repeat(64) }).catch((e) => { err = e; });
  ok('W5', 'create(Adoption, wrong digest) REFUSED LOCALLY — refused:false, sqlstate:null, localGuard R25, no seal', !!err && err.refused === false && err.sqlstate === null && err.localGuard === 'R25', err?.findings?.map((f) => f.code).join(',') ?? 'sealed?!');
} catch (e) { ok('W5', 'create routing', false, e.message.slice(0, 120)); }

console.log('R29 — the downstream rung, facaded');
try {
  const c = await read(() => k.adoption.census());
  ok('W6', 'census() routes to fleet.adoptions', Array.isArray(c.adoptions) && typeof c.malformedCount === 'number', `${c.adoptions.length} adoptions · malformed ${c.malformedCount} · orphaned ${c.orphanedCount}`);
  const i = await read(() => k.integrity());
  ok('W6b', 'integrity() routes to integrity.check', typeof i.healthy === 'boolean' && Array.isArray(i.findings), `healthy ${i.healthy} · ${i.findings.length} findings`);
} catch (e) { ok('W6', 'facades', false, e.message.slice(0, 120)); }

// ═══ CK_BEAT=1 — T5 (AT + repair) · the clean adoption · T6 ═══
if (!BEAT) skipped('W7–W10', 'germinate · T5 wrong-digest seal + supersede · clean adopt · T6', 'CK_BEAT=1 not set — writes stay off');
else {
  console.log('T5 / R27 / R32 — AT + repair, then the clean loop (DESTRUCTIVE)');
  try {
    const s0 = await read(() => k.surface.check());
    if (s0.state !== 'germinated') {
      const g = await k.germinate({ projectKind: 'shared', label: 'CK.Lib.Js — release-confirm 1.6.5' });
      ok('W7', 'germinated the seat', g?.ok === true, `ownedBy ${short(g?.ownedBy)}`);
      await new Promise((r) => setTimeout(r, 6000));        // union build: germination routes in ~5s
    } else skipped('W7', 'germinate', 'seat already germinated');
    const s1 = await read(() => k.surface.check());
    // bench hygiene, read BEFORE the wrong seal: adoption.check reports the LATEST Adoption's claim and is
    // blind to Supersession (measured 2026-09-04 — Q-6), so reading it after W8 sees the wrong claim.
    const priorCensus = await read(() => k.adoption.census());
    const priorClean = priorCensus.adoptions.some((x) => x.intoProject === `urn:ckp:project:${KERNEL}` && x.adopts === WAVE && x.malformed === false && x.orphaned === false);
    // T5 — the RAW door on purpose: the facade makes a wrong digest unconstructible, so proving the
    // AT band needs the one path that bypasses it (R28: k.do is the raw door, said so).
    const raw = await k.do('instance.create', { type: `${CORE}Adoption`, adopts: WAVE, intoProject: `urn:ckp:project:${KERNEL}`, intoEpoch: s1.epoch, sourceDigest: '9'.repeat(64) });
    ok('W8', 'T5 — raw seal of a WRONG digest: ok:true AND reference.sourceDigestMatch:false in the SAME reply (the seal stands, B4)', raw?.ok === true && raw?.reference?.sourceDigestMatch === false, `id ${raw?.id} · warnings ${raw?.warnings?.length}`);
    const wrongId = raw?.result?.['@id'] ?? raw?.id ?? null;
    if (wrongId) {
      let modErr = null; await k.adoption.supersede(WAVE).catch((e) => { modErr = e; });
      ok('W8b', 'supersede(MODULE IRI) refused locally by name (SPORE §5.1b)', modErr?.localGuard === 'R32');
      const sup = await k.adoption.supersede(wrongId);          // a bare receipt id: the facade completes it (E-5)
      ok('W8c', 'T5 repair — supersede(the receipt id) reads the sealed @id off the door and cites it verbatim (the census joins on that exact string)', sup?.ok === true && sup?.supersedes === `ckp://Adoption#${wrongId}`, sup?.ok ? `id ${sup.id} · supersedes ${sup.supersedes}` : `${sup?.error?.slice(0, 120)}`);
      const census = await read(() => k.adoption.census());
      ok('W8d', 'the census no longer lists the superseded Adoption', !census.adoptions.some((a) => a.adoption === wrongId), `${census.adoptions.filter((a) => a.intoProject === `urn:ckp:project:${KERNEL}`).length} live adoptions into ${KERNEL}`);
    } else skipped('W8b/c', 'supersede', 'no id on the raw seal reply');
    const a = await k.adoption.adopt({ adopts: WAVE });
    ok('W9', 'adopt(wave) with NO digest: derived off the door, sealed, AT band on the receipt', a.ok === true && a.digestSource === 'recorded' && a.reference?.sourceDigestMatch === true, `id ${a.id} · derived ${short(a.dryRun.digest.derived)} · warnings ${a.warnings?.length ?? 'null'}`);
    ok('W9b', 'confirmation: adoption.check row → R17.3 verdict', a.check ? ['verified', 'refused', 'unknown'].includes(a.check.verdict) : typeof a.checkError === 'string', a.check ? `match=${a.check.sourceDigestMatch} loads=${a.check.sourceLoads} → ${a.check.verdict}` : a.checkError?.slice(0, 80));
    const row = await read(() => k.adoption.row(WAVE));
    ok('W9c', 'row(wave) is now the seat\'s adoption row', row !== null && row.sourceDigestMatch === true, `recorded ${short(row?.sourceRecorded)} loads ${row?.sourceLoads}`);
    if (priorClean && a.ok && a.id) {
      // PASS-16 §3: "supersede your leftovers". A clean adoption already stood; this run's is a duplicate
      // and is superseded so the bench keeps exactly ONE live adoption of wave into this seat.
      const hy = await k.adoption.supersede(a.id);
      ok('W9d', 'leftover hygiene — a prior clean adoption stood, so this run\'s duplicate is superseded (census keeps one)', hy?.ok === true && hy.supersedes === `ckp://Adoption#${a.id}`, `id ${hy?.id}`);
    } else skipped('W9d', 'leftover hygiene', 'this run\'s adoption is the first clean one — left as the working state');
    const t6 = await k.propose('adopt_module', { about: WAVE }, 2).catch((e) => e);
    const t6r = t6?.reply ?? t6;
    ok('W10', 'T6 — kernel.propose_change {op:"adopt_module"} refused op_has_no_projector with a hint routing to core#Adoption + instance.validate', (t6r?.error === 'op_has_no_projector' || t6?.refused === true) && /core#Adoption/.test(t6r?.hint ?? '') && /instance\.validate/.test(t6r?.hint ?? ''), t6r?.hint?.slice(0, 80));
  } catch (e) { ok('W7', 'beat block', false, e.message.slice(0, 200)); }
}

await k.close().catch(() => {});
console.log(`\n${pass} passed, ${fail} failed, ${skip} skipped`);
process.exit(fail ? 44 : 0);
