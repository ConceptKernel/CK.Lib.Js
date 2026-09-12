// tests/wire/foundation-1.6.5.mjs — THE FOUNDATION, HELD TO FROM THE SEAT.
//
// One rung per row of SPEC.CK-FOUNDATION.v1.6.5 that a consumer can measure with its own instrument
// and its own kernels: the seven mechanisms, the opportunity registry (O1/O6/O8/O9/O10), the cold-
// plane traps now warm (T1/T4/R-20), the identity rows (mechanism 3, ownedBy). Every duration is two
// clock reads (T17); every digest is read off the door (R-36.6); every act is on kernels this seat
// germinated (ck-lib-js-alpha PERSONAL · ck-lib-js-beta SHARED) and cleans up after itself.
//
//   CK_DOOR=wss://pgck.localhost/wss CK_TOKEN=<bearer> CK_BEAT=1 node tests/wire/foundation-1.6.5.mjs
//
// DESTRUCTIVE (it seals, governs, supersedes) — CK_BEAT=1 guarded; breakable benches only.
// Idempotent where the door allows: germinate-if-absent, bind-if-absent, declare-orbit-if-absent.
// Exit: 0 GREEN · 44 RED-measured · 1 BROKEN (activation failed / never climbed)
import { CK, VERSION } from '../../ck.js';

if (process.env.CK_BEAT !== '1') { console.log('foundation: DESTRUCTIVE — refusing without CK_BEAT=1'); process.exit(1); }
const DOOR  = process.env.CK_DOOR  || 'wss://pgck.localhost/wss';
const TOKEN = process.env.CK_TOKEN || null;
const ALPHA = process.env.CK_ALPHA || 'ck-lib-js-alpha', BETA = process.env.CK_BETA || 'ck-lib-js-beta', SEAT = process.env.CK_KERNEL || 'ck-lib-js';
const CORE = 'https://conceptkernel.org/ontology/v3.11/core#', WAVE = 'urn:ckp:module:wave', LEX = 'urn:ckp:module:lexicon';
const RUN = Date.now();

let pass = 0, fail = 0, skip = 0;
const ok = (id, name, c, detail = '') => { (c ? pass++ : fail++); console.log(`  ${c ? '✅' : '❌'} ${id} ${name}${detail ? ' — ' + detail : ''}`); };
const skipped = (id, name, why) => { skip++; console.log(`  ⏭  ${id} ${name} — ${why}`); };
const short = (d) => (d ? String(d).slice(0, 12) + '…' : String(d));
const act = (k, opts = {}) => CK.activate(k, { wssEndpoint: DOOR, ...(TOKEN ? { tokenProvider: async () => TOKEN } : {}), ...opts });
const govern = async (k, about, op, detail) => {   // quorum-1 REHEARSAL on a personal kernel; the door labels it
  const p = await k.do('kernel.propose_change', { op, requires_quorum: 1, about, detail });
  if (!p.ok) return { ok: false, stage: 'propose', reply: p };
  const v = await k.do('kernel.vote', { about: p.proposal_iri, value: 'approve' });
  if (!v.ok) return { ok: false, stage: 'vote', reply: v };
  const ap = await k.do('kernel.apply', { about: p.proposal_iri });
  return { ok: ap.ok === true, stage: 'apply', reply: ap, proposal: p.proposal_iri };
};

console.log(`foundation v1.6.5 — ${DOOR} · seat ${SEAT} · kernels ${ALPHA} (personal) / ${BETA} (shared) · lib ${VERSION}\n`);
let seat, a, b, a2;
try { seat = await act(SEAT); } catch (e) { console.log(`BROKEN — activation as ${SEAT} failed: ${e.message}`); process.exit(1); }

console.log('M1/M2 — one door, roster union, germination IS existence');
try {
  const s = await seat.surface.check();
  const union = s.roster?.union ?? [];
  const need = [ALPHA, BETA].filter((k) => !union.includes(k));
  for (const k of need) {
    const g = await seat.do('kernel.germinate', { project: k, projectKind: k === ALPHA ? 'personal' : 'shared', label: `CK.Lib.Js FOUNDATION test kernel (${k === ALPHA ? 'personal' : 'shared'})` });
    ok('W1', `germinate ${k} from seat ${SEAT}`, g.ok === true && String(g.ownedBy).includes(seat._transport?.auth?.claims?.sub ?? '∅'), `ownedBy ${short(g.ownedBy)}`);
  }
  if (!need.length) skipped('W1', 'germinate test kernels', 'both already in the roster union');
  if (need.length) await new Promise((r) => setTimeout(r, 8000));
  a = await act(ALPHA); a2 = await act(ALPHA); b = await act(BETA);
  const sa = await a.surface.check();
  ok('W1b', 'the new names route within the bgworker window and answer as themselves', sa.kernel === ALPHA && sa.state === 'germinated', `union ${sa.roster?.union?.length} · alpha epoch ${sa.epoch}`);
} catch (e) { console.log(`BROKEN — test kernels: ${e.message}`); process.exit(1); }

console.log('O9 / R-19 — the quorum floor as a lattice join (shared refuses 1; personal accepts 1 as REHEARSAL)');
try {
  const pb = await b.do('kernel.propose_change', { op: 'add_proof_obligation', requires_quorum: 1, about: `urn:ckp:${BETA}/kernel/ck`, detail: { check: 'no-warnings', obligation: 'floor-probe', targetType: `${CORE}Adoption` } });
  ok('W2', 'SHARED beta refuses quorum 1 by name, floor 2 carried', pb.ok === false && pb.error === 'invalid_requires_quorum' && pb.floor === 2, pb.sqlstate);
} catch (e) { ok('W2', 'R-19', false, e.message.slice(0, 120)); }

console.log('O6 / F3 — the AFTER rung, turned ON for this kernel (bind-if-absent), and what it does and does not refuse');
let boundNow = 0;
try {
  const props = await a.do('instance.query', { type: `${CORE}Proposal` });
  const rows = (props.rows ?? []).map((r) => r.body ?? r);
  const has = (name) => rows.some((r) => r[`${CORE}about`] === `urn:ckp:${ALPHA}/kernel/ck` && r.proposalDetail?.obligation === name && r[`${CORE}proposalState`] === 'applied');
  for (const [check, name] of [['digest-match', 'digest-match-on-adoption'], ['adopts-resolves', 'adopts-resolves-on-adoption'], ['no-warnings', 'no-warnings-on-adoption']]) {
    if (has(name)) { skipped(`W3:${check}`, 'bind obligation', 'already applied on alpha'); continue; }
    const g = await govern(a, `urn:ckp:${ALPHA}/kernel/ck`, 'add_proof_obligation', { check, obligation: name, targetType: `${CORE}Adoption` });
    boundNow++;
    ok(`W3:${check}`, `bind ${name} (quorum 1 — the DOOR labels it rehearsal)`, g.ok && g.reply.applied?.obligation_active === 'true' && g.reply.rehearsal === true, `epoch ${g.reply.epoch}`);
  }
  const e = (await a.surface.check()).epoch;
  const na = await a.do('instance.create', { type: `${CORE}Adoption`, adopts: `urn:ckp:module:doesnotexist-${RUN}`, intoProject: `urn:ckp:project:${ALPHA}`, intoEpoch: e, sourceDigest: '8'.repeat(64) });
  ok('W4', 'adopts-resolves REFUSES a nonexistent module at the seal (the obligation named in the refusal)', na.ok === false && /adopts-resolves/.test(na.error ?? ''), `${na.sqlstate} · ${(na.error ?? '').slice(0, 60)}…`);
  const wa = await a.do('instance.create', { type: `${CORE}Adoption`, adopts: WAVE, intoProject: `urn:ckp:project:${ALPHA}`, intoEpoch: e, sourceDigest: '9'.repeat(64) });
  ok('W5', 'MEASURED GAP — a wrong sourceDigest SEALS with all three obligations ON (no registered check judges the claim); AT band says false', wa.ok === true && wa.reference?.sourceDigestMatch === false, `id ${wa.id}`);
  if (wa.ok && wa.id) { const s = await a.adoption.supersede(wa.id); ok('W5b', 'hygiene — the wrong seal is superseded citing the door-read @id', s.ok === true && /^ckp:\/\//.test(s.supersedes)); }
} catch (e) { ok('W3', 'obligations', false, e.message.slice(0, 160)); }

console.log('R-36 / O6 client rung — the only rung that refuses the incident, and the clean path');
try {
  let err = null; await a.adoption.adopt({ adopts: WAVE, sourceDigest: '9'.repeat(64) }).catch((x) => { err = x; });
  ok('W6', 'adopt(wrong digest) is refused LOCALLY before the wire (digest_disagrees)', err?.localGuard === 'R25' && err.findings.some((f) => f.code === 'digest_disagrees'));
  const row = await a.adoption.row(LEX);
  if (row) skipped('W7', 'clean ladder adoption of lexicon', 'already adopted on alpha — census live');
  else {
    const t0 = Date.now(); const heard = a2.next('event', { timeout: 15000 }).then((fr) => ({ at: Date.now(), fr })).catch((x) => ({ err: x.message }));
    const re = await a.adoption.adopt({ adopts: LEX }); const t1 = Date.now();
    ok('W7', 'clean ladder adoption: derived off the door, AT band all-true, confirmation verified', re.ok && re.digestSource === 'recorded' && re.reference?.sourceDigestMatch === true && re.check?.verdict === 'verified', `id ${re.id}`);
    const h = await heard;
    ok('W8', 'O10 — a SECOND socket seated on the same kernel heard the sealed event (two clock reads)', !!h.fr && h.fr.verb === 'sealed', h.fr ? `${h.at - t0} ms after dispatch · reply ${t1 - t0} ms` : h.err);
  }
} catch (e) { ok('W6', 'client rung', false, e.message.slice(0, 160)); }

console.log('Mechanism 3 — five stamps server-derived; ownedBy the odd one');
try {
  const e = (await a.surface.check()).epoch;
  const rec = await a.adoption.recorded(LEX);
  const lexRow = await a.adoption.row(LEX);
  if (lexRow) { const s = await a.adoption.supersede(lexRow.sourceDigest ? (await a.adoption.census()).adoptions.find((x) => x.intoProject === `urn:ckp:project:${ALPHA}` && x.adopts === LEX)?.adoption : null).catch(() => null); if (!s?.ok) skipped('W9-pre', 'supersede prior lexicon adoption', 'none live or refused'); }
  const f = await a.do('instance.create', { type: `${CORE}Adoption`, adopts: LEX, intoProject: `urn:ckp:project:${ALPHA}`, intoEpoch: e, sourceDigest: rec.sourceRecorded,
    createdBy: 'urn:ckp:participant:00000000-forged', producedBy: 'urn:ckp:forged/kernel/ck', sealedAtEpoch: 999, conformsToShape: 'urn:forged:Shape', onBehalfOf: 'urn:ckp:participant:00000000-onbehalf', ownedBy: 'urn:ckp:participant:00000000-owned' });
  const g = await a.do('instance.get', { id: f.id }); const fb = g.instance?.body ?? g.instance ?? g.result ?? {};
  ok('W9', 'createdBy/producedBy/sealedAtEpoch/conformsToShape forged → STRIPPED (server values sealed)', f.ok && !String(fb[`${CORE}createdBy`]).includes('forged') && !String(fb[`${CORE}producedBy`]).includes('forged') && fb[`${CORE}sealedAtEpoch`] !== 999 && !String(fb[`${CORE}conformsToShape`]).includes('forged'));
  ok('W9b', 'onBehalfOf forged → ABSENT (absence is the signal: acted directly)', f.ok && fb[`${CORE}onBehalfOf`] === undefined);
  ok('W9c', 'MEASURED GAP (R-33.1) — ownedBy forged is sealed VERBATIM', f.ok && fb[`${CORE}ownedBy`] === 'urn:ckp:participant:00000000-owned', 'client-assertable, one bearer suffices to show it');
  if (f.ok) { const s = await a.adoption.supersede(f.id); ok('W9d', 'hygiene — forged-stamp specimen superseded', s.ok === true); }
} catch (e) { ok('W9', 'stamps', false, e.message.slice(0, 160)); }

console.log('T1 / T4 / R-20 — the clock: orbit as governed law, a score a stranger recomputes, a tick that drafts only');
try {
  let n = await a.clock.next().catch((x) => x);
  if (n?.refused) {
    ok('W10', 'no orbit → no_orbit_declared 42704 (a real answer, not a zero)', n.sqlstate === '42704');
    const g1 = await govern(a, `urn:ckp:${ALPHA}/kernel/ck`, 'set_kernel_policy', { field: 'orbitPeriodSeconds', value: 60 });
    const g2 = await govern(a, `urn:ckp:${ALPHA}/kernel/ck`, 'set_kernel_policy', { field: 'orbitAnchor', value: new Date().toISOString() });
    ok('W10b', 'orbit declared through propose→vote→apply (law, not assertion)', g1.ok && g2.ok, `epochs ${g1.reply.epoch}, ${g2.reply.epoch}`);
    n = await a.clock.next();
  } else skipped('W10', 'no-orbit refusal', 'alpha already keeps a clock');
  ok('W11', 'clock.next carries its METHOD string — re-derivable from sealed law alone', typeof n.method === 'string' && /anchor/.test(n.method) && !!n.nextCrossing, `period ${n.periodSeconds}s · next ${n.nextCrossing}`);
  const dwells = [1500, 3000, 4500];
  for (const d of dwells) { const bd = await a.clock.boundary({ about: `urn:ckp:${ALPHA}/kernel`, dwellMillis: d, events: 2 }); if (!bd.sealed) ok('W12', `boundary dwell ${d}`, false, JSON.stringify(bd).slice(0, 80)); }
  const e0 = (await a.surface.check()).epoch;
  const t1 = await a.clock.tick(); const s1 = t1.scores?.find((x) => x.about === `urn:ckp:${ALPHA}/kernel`)?.score ?? null;
  const e1 = (await a.surface.check()).epoch;
  ok('W12', 'tick reports epochUnchanged:true AND the epoch measured before/after did not move (R-20)', t1.epochUnchanged === true && e0 === e1, `epoch ${e0}→${e1} · drafted ${t1.drafted?.length}`);
  ok('W13', 'the law object names every symbol; thresholdPromote null ⇒ nothing drafts', t1.law && 'tauImplicitMillis' in t1.law && 'weightImplicit' in t1.law && t1.law.thresholdPromote === null && (t1.drafted?.length ?? 0) === 0);
  ok('W14', 'T1 MEASURED OPEN — the law carries NO decay constant; the score is an undecayed sum', !Object.keys(t1.law ?? {}).some((k) => /lambda|decay|halfLife/i.test(k)), `score ${s1}`);
  for (const d of [6000]) await a.clock.boundary({ about: `urn:ckp:${ALPHA}/kernel`, dwellMillis: d, events: 2 });
  const t2 = await a.clock.tick(); const s2 = t2.scores?.find((x) => x.about === `urn:ckp:${ALPHA}/kernel`)?.score ?? null;
  ok('W15', 'monotone: one more boundary, the score only grows (Hawkes at λ=0)', s1 != null && s2 != null && s2 > s1, `${s1} → ${s2}`);
  const w = (d) => t2.law.weightImplicit * (1 - Math.exp(-d / t2.law.tauImplicitMillis));
  const delta = w(6000);
  ok('W16', 'T4 CLOSED, verified by a stranger: the increment recomputes from the reply\'s own law — weightImplicit·(1−e^(−dwell/τ₀))', Math.abs((s2 - s1) - delta) < 0.0005, `Δ measured ${(s2 - s1).toFixed(4)} · recomputed ${delta.toFixed(4)}`);
} catch (e) { ok('W10', 'clock', false, e.message.slice(0, 160)); }

console.log('O1 — "same" as a labelled two-plane verdict');
try {
  const s = await a.surface.same(WAVE, LEX);
  ok('W17', 'wave vs lexicon: DIFFERENT is PROOF (unequal structural digests)', s.verdict === 'DIFFERENT' && s.proof === true);
  const t = await a.surface.same(WAVE, WAVE);
  ok('W17b', 'a graph vs itself: ISOMORPHIC_LIKELY, never "identical" (evidence, not proof — the door\'s own asymmetry text carried)', t.verdict === 'ISOMORPHIC_LIKELY' && t.proof === false && typeof t.verdictAsymmetry === 'string');
} catch (e) { ok('W17', 'same()', false, e.message.slice(0, 160)); }

console.log('O8 — refusals are registry rows with sqlstates');
try {
  const r = await a.surface.refusals();
  ok('W18', 'registryDigest present (the only cache key), count informational', /^[0-9a-f]{16,}/.test(r.registryDigest ?? ''), `${short(r.registryDigest)} · ${r.count ?? (r.codes?.length ?? '?')} codes`);
} catch (e) { ok('W18', 'refusals', false, e.message.slice(0, 120)); }

for (const k of [seat, a, a2, b]) await k?.close?.().catch(() => {});
console.log(`\n${pass} passed, ${fail} failed, ${skip} skipped`);
process.exit(fail ? 44 : 0);
