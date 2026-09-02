// tests/wire/door-beat.mjs — the BEAT gate: DESTRUCTIVE transactional TDD against a real door.
//
// Named for the bench it targets (the operator's "break-and-beat" dev instance): unlike
// door-suite.mjs (read-only observer), this suite WRITES — it germinates a kernel, runs a
// governed change to completion, seals facts, gathers proofs, and exercises the v3.12 module
// surface (recon · wave · lex) in addition to core. Every rung is three-state honest
// (RESULT / REFUSED / FAULT) and an EXPECTED refusal is a PASS (negative controls).
//
// GUARD: refuses to run without CK_BEAT=1 — this suite mutates the bench's permanent record.
//   CK_BEAT=1 NODE_EXTRA_CA_CERTS=... [CK_DOOR=wss://pgck.localhost/wss] node tests/wire/door-beat.mjs
//
// The ladder (stops climbing when a prerequisite rung faults; later rungs report SKIPPED):
//   W1  dispatch answers at all            (surface.check — any verdict proves the reply axis)
//   W2  state read                          (surface.check state/digest — cited by digest)
//   W3  GERMINATE  kernel.germinate ck-lib-js (projectKind supplied — 0.4.81 stopped guessing)
//   W4  GOVERN     propose add_class → vote → apply (quorum 1 = REHEARSAL, said in the seal)
//   W5  SEAL       instance.create of the governed type → FOUR STAMPS, conformsToShape non-null
//   W6  PROVE      instance.verify (HMAC chain) + instance.provenance (proof rows, ledger seq)
//   W7  NEGATIVE   bare-name type must refuse; undeclared type must refuse (the gate speaks)
//   W8  ADOPT      wave + recon by digest (named requester needed — an identity refusal here is
//                  the HONEST boundary on an anonymous shell, recorded not hidden)
//   W9  RECON      recon:Chunk positive (text+section) → sealed, M4 = ChunkShape;
//                  negative (no section) → REFUSED MinCount — the reference spore's own pair
//   W10 WAVE       wave.signals / wave.oracle — unknown_affordance or module-not-adopted until
//                  adoption + the v3.12 executor; whichever answers is recorded verbatim
//   W11 LEX        a lexicon read — same honesty
//   ── v1.6.3 FLOOR RUNGS (CK-DOOR v1.6.3 §11.7; pgCK obligations settled 0.4.94→109) ──
//   W12 IDENTITY   engineIdentity read — divergence REPORTED, never restarted away (C-17/R-24)
//   W13 ID FORMS   R-22: every emitted id form resolves; a nonexistent id REFUSES 42704 —
//                  never a confident null (E-5, 0.4.102)
//   W14 5th STAMP  R-16: direct seal ⇒ onBehalfOf ABSENT (acted directly); a payload claiming
//                  it is STRIPPED or refused — never sealed with the forged claim (C-7, 0.4.107)
//   W15 QUORUM     R-19: SHARED scratch project refuses quorum 1 at propose; accepts quorum 2 —
//                  the accept half is the control: a floor that refuses everything is a wall (C-1)
//   W16 VIRGIN     R-23: a fresh personal kernel's FIRST apply is an honest 0 → 1 (the phantom
//                  epoch is retired; the quorum pair on the success path is printed as evidence)
//   W17 TICK       R-20: score.tick may DRAFT only — epochUnchanged:true and the epoch held,
//                  measured before/after (a tick that moves the epoch = ledger regression)
//   W18 BOUNDARY   R-11.3: never-saw seals NOTHING and is a SUCCESS; a real dwell head seals
//                  ONE chained Signal (C-8, 0.4.109)
//   W19 ORBIT      R-11.2: no declared orbit REFUSES by name — never a zero shaped like a time
//   W20 ROLES      R-25: SKIPPED here — needs Memberships + a second seated identity (the
//                  two-party pass on pgck-mcp / ck-dev seats)
import CKClient from '../../ck-client.js';
import { outcomeOf } from '../../ck.js';

if (process.env.CK_BEAT !== '1') {
  console.log('door-beat: DESTRUCTIVE suite — refusing without CK_BEAT=1 (it writes to the bench\'s permanent record).');
  process.exit(1);   // fleet protocol: not-run = BROKEN, never GREEN
}

const DOOR   = process.env.CK_DOOR   || 'wss://pgck.localhost/wss';
const KERNEL = process.env.CK_KERNEL || 'ck-lib-js';
const TOKEN  = process.env.CK_TOKEN  || null;
const WAIT   = Number(process.env.CK_WAIT_MS || 6000);
const RUN    = 'beat-' + Date.now().toString(36);            // stamped into everything we create

// namespaces are TEST-supplied (the client hardcodes none — that rule is why this block exists)
const CKP   = 'https://conceptkernel.org/ontology/v3.11/core#';      // v3.12 root keeps the v3.11 core ns (measured in core.ttl)
const RECON = 'https://conceptkernel.org/ontology/v3.12/recon#';
const NOTE  = `urn:ckp:${KERNEL}/type/BeatNote`;
// Module digests are PER-DEPLOYMENT declarations (A-8/R2.5 — env-only, NO kit constants; a baked
// digest is guaranteed to go false-RED when a module revision lands). Undeclared ⇒ rung SKIPPED.
const DIGESTS = {
  ...(process.env.CK_WAVE_SHA  ? { wave:  process.env.CK_WAVE_SHA }  : {}),
  ...(process.env.CK_RECON_SHA ? { recon: process.env.CK_RECON_SHA } : {}),
};

const ladder = [];
const rung = (id, name, r, expected = null) => {
  const o = r?.__timeout ? 'fault' : outcomeOf(r);        // one case, one vocabulary (was: 'FAULT'
  const pass = expected ? (o === expected) : (o !== 'fault');   // vs 'fault' — faults passed as ✅)
  ladder.push({ id, name, outcome: o, pass, expected,
    detail: r?.__timeout ? `no reply in ${WAIT}ms` : (r?.error ?? null),
    keys: r && !r.__timeout ? Object.keys(r).slice(0, 10) : [] });
  console.log(`  ${pass ? '✅' : '❌'} ${id} ${name} → ${o}${expected ? ` (expected ${expected})` : ''}${r?.error ? ' — ' + String(r.error).slice(0, 140) : ''}`);
  return { outcome: o, pass, r };
};
const skip = (id, name, why) => { ladder.push({ id, name, outcome: 'SKIPPED', why }); console.log(`  ⏭  ${id} ${name} — ${why}`); };

// v1.6.1 (R0.8): claimSub is DELETED — every door verifies the bearer, and the id-form
// segment is the connection's own verified sub. CK_TOKEN is required in practice.
const c = new CKClient({ kernel: KERNEL, gov: KERNEL, wssEndpoint: DOOR,
  ...(TOKEN ? { tokenProvider: async () => TOKEN } : {}) });
await c.connect();
const _sub = c.auth?.claims?.sub ?? c.auth?.userId ?? 'UNVERIFIED';
console.log(`door-beat — ${DOOR} · kernel ${KERNEL} · run ${RUN} · verified sub ${String(_sub).slice(0,14)}…\n`);
const dp = (verb, payload) => Promise.race([
  c.dispatch(verb, `ckp://Kernel#${KERNEL}`, payload),
  new Promise((res) => setTimeout(() => res({ __timeout: true }), WAIT)),
]);
// v1.6.3: an IN-CONTEXT seat for a scratch kernel — governance law (quorum floor, epoch bump)
// binds in the DISPATCHING kernel's context, so measuring another project's law means sitting
// in that project's own seat. Cross-context dispatch is the case-07 seam, probed separately.
const seats = [];
async function seatFor(kernel) {
  const sc = new CKClient({ kernel, gov: kernel, wssEndpoint: DOOR,
    ...(TOKEN ? { tokenProvider: async () => TOKEN } : {}) });
  await Promise.race([sc.connect(), new Promise((_, rej) => setTimeout(() => rej(new Error(`connect as ${kernel} timed out`)), 15000))]);
  seats.push(sc);
  return (verb, payload) => Promise.race([
    sc.dispatch(verb, `ckp://Kernel#${kernel}`, payload),
    new Promise((res) => setTimeout(() => res({ __timeout: true }), WAIT)),
  ]);
}

// W1/W2 — the reply axis, and the state cited by digest.
// The ONE sanctioned retry (CK-DOOR §2): a first dispatch within ~10s of restart/idle may
// warm-up-timeout — retry once, reads only, and say so. door-beat was the only gate without it.
let w1r = await dp('surface.check', {});
if (w1r?.__timeout) { console.log('  … W1 warm-up timeout — the sanctioned single retry (read)'); w1r = await dp('surface.check', {}); }
const w1 = rung('W1', 'dispatch answers (surface.check)', w1r);
if (w1.outcome === 'fault') {
  skip('W2..W11', 'everything transactional', 'the reply axis is dead — nothing beyond W1 is measurable');
  finish();
}
const state = w1.r?.state ?? w1.r?.result?.state ?? null;
console.log(`     state=${state} digest=${String(w1.r?.surface?.actual ?? w1.r?.digest ?? '').slice(0, 16)}`);

// W3 — germinate (idempotence honest: a refusal naming an existing kernel also proves the axis)
const w3 = rung('W3', `germinate ${KERNEL} (projectKind personal — supplied, never guessed)`,
  await dp('kernel.germinate', { project: KERNEL, projectKind: 'personal', label: `CK.Lib.Js beat ${RUN}` }));

// W4 — one governed act to completion (quorum 1 IS REHEARSAL and the seal says so)
let applied = false;
if (w3.outcome !== 'fault') {
  const prop = await dp('kernel.propose_change', { op: 'add_class', about: `urn:ckp:${KERNEL}/kernel`,
    detail: { class: NOTE, label: 'BeatNote', comment: `door-beat ${RUN}: quorum 1 is rehearsal, stated here` } });
  const pr = rung('W4a', 'propose add_class BeatNote', prop);
  // 0.4.83 contract, taught by the wire itself: vote/apply read {about: <ckp://Proposal#…>}
  const pid = prop?.proposal_iri ?? prop?.id ?? prop?.proposal ?? prop?.result?.['@id'] ?? null;
  if (pr.outcome === 'result' && pid) {
    rung('W4b', 'vote approve (self — REHEARSAL, said in the seal)', await dp('kernel.vote', { about: pid, value: 'approve' }));
    const ap = rung('W4c', 'apply (epoch should advance)', await dp('kernel.apply', { about: pid }));
    applied = ap.outcome === 'result';
  } else skip('W4b/W4c', 'vote/apply', 'no proposal id came back');
} else skip('W4', 'governed change', 'germination faulted');

// W5/W6 — seal, then prove
let sealId = null, sealReply = null;                       // captured for the v1.6.3 floor rungs
if (applied) {
  const seal = await dp('instance.create', { type: NOTE, label: `sealed by door-beat ${RUN}` });
  const s = rung('W5', 'seal a BeatNote (five stamps expected — onBehalfOf ABSENT = acted directly)', seal);
  if (s.outcome === 'result') {
    const stamps = ['createdBy', 'sealedAtEpoch', 'producedBy', 'conformsToShape', 'onBehalfOf']
      .map((k) => `${k}=${seal[k] ?? seal[k.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase())] ?? 'ABSENT'}`);
    console.log(`     ${stamps.join(' · ')}`);
    const id = seal.id ?? seal.result?.['@id'];
    sealId = id; sealReply = seal;
    rung('W6a', 'verify (HMAC chain, verbatim)', await dp('instance.verify', { id }));
    rung('W6b', 'provenance (proof rows + ledger seq)', await dp('instance.provenance', { id }));
  } else skip('W6', 'proofs', 'the seal did not land');
} else skip('W5/W6', 'seal + prove', 'no applied epoch to seal under');

// W7 — the gate must speak (negative controls: a refusal IS the pass)
rung('W7a', 'bare-name type must refuse', await dp('instance.create', { type: 'NotAnIri', probe: RUN }), 'refusal');
rung('W7b', 'undeclared type must refuse', await dp('instance.create', { type: `urn:ckp:${KERNEL}/type/NeverDeclared${RUN}`, probe: RUN }), 'refusal');

// W8 — module adoptions. L-9 resolution (PASS-7 §5): AdoptionShape requires intoProject · sourceDigest
// · intoEpoch (the old payload omitted intoEpoch → MinCount refusal we misread as a substrate fault).
const curEpoch = (await dp('surface.check'))?.epoch ?? 0;
if (!Object.keys(DIGESTS).length) skip('W8', 'module adoptions', 'no CK_WAVE_SHA/CK_RECON_SHA declared — digests are per-deployment, never kit constants');
for (const [mod, digest] of Object.entries(DIGESTS)) {
  rung(`W8:${mod}`, `adopt ${mod} by digest ${digest.slice(0, 12)}… (intoEpoch ${curEpoch})`,
    await dp('instance.create', { type: `${CKP}Adoption`, adopts: `urn:ckp:module:${mod}`,
      intoProject: `urn:ckp:project:${KERNEL}`, intoEpoch: curEpoch, sourceDigest: digest }));
}

// W9 — the reference spore's own positive/negative pair (SPORE spec §9: the half that matters)
rung('W9a', 'recon:Chunk positive (text+section)',
  await dp('instance.create', { type: `${RECON}Chunk`, text: `beat ${RUN}`, section: 'intro' }));
rung('W9b', 'recon:Chunk negative — NO section must refuse MinCount',
  await dp('instance.create', { type: `${RECON}Chunk`, text: `beat ${RUN} incomplete` }), 'refusal');

// W10/W11 — module verbs through the door (whatever answers is the truth of this bench today)
rung('W10', 'wave.signals (unknown_affordance / module-not-adopted / executor result — verbatim)', await dp('wave.signals', {}));
rung('W11', 'lex read (instance.query lexicon Pattern)', await dp('instance.query', { type: 'https://conceptkernel.org/ontology/v3.11/lexicon#Pattern' }));

// ═══ v1.6.3 FLOOR RUNGS (CK-DOOR §11.7) — measured against the door in front of us, never a
// version note. On a pre-floor door these rungs go RED honestly; that is them working. ═══

// W12 — engineIdentity (C-17/R-24): the instrument that catches every stale-.so incident.
// Divergence is REPORTED, never restarted away — a restart severs every seat AND the evidence.
{
  const eid = w1.r?.engineIdentity ?? null;
  if (eid) {
    rung('W12', `engineIdentity ${eid.state ?? '?'} — version() ${eid.version ?? '?'} · extversion ${eid.extversion ?? '?'} · build ${String(eid.build_id ?? '?').slice(0, 28)}`,
      { ok: true, state: eid.state, agreement: eid.agreement });
    if (eid.agreement === false) console.log(`     ⚠ DIVERGED — reported, not cured here: ${JSON.stringify(eid.divergence ?? {})}`);
  } else skip('W12', 'engineIdentity', 'not served — pre-0.4.103 SQL on this door');
}

// W13 — R-22 (E-5, 0.4.102): ONE id vocabulary on the read side. Every emitted form resolves;
// a nonexistent id REFUSES (42704, naming the accepted forms) — never {ok:true, instance:null}.
if (sealId) {
  const local = String(sealId).split(/[#/]/).pop();
  for (const [label, idv] of [['emitted', sealId], ['bare', local], ['urn', `urn:ckp:instance:${local}`]]) {
    const g = await dp('instance.get', { id: idv });
    const body = g?.result ?? g?.instance ?? null;
    const nulled = g?.ok === true && body == null;
    rung(`W13:${label}`, `instance.get resolves the ${label} form (${String(idv).slice(0, 44)}…)`,
      nulled ? { ok: false, error: 'ok:true with a null body — the confident null E-5 retired (pre-0.4.102 behaviour)' } : g);
  }
  rung('W13:none', 'a nonexistent id must REFUSE (unknown_instance 42704), never null',
    await dp('instance.get', { id: `beat-nonexistent-${RUN}` }), 'refusal');
} else skip('W13', 'id vocabulary (R-22)', 'no seal landed to read back');

// W14 — R-16 (C-7, 0.4.107): the fifth stamp. W5 already printed onBehalfOf on the direct
// seal (expected ABSENT — absence IS the signal). Here: a payload CLAIMING it must not survive.
if (applied) {
  const direct = sealReply?.onBehalfOf ?? null;
  rung('W14a', 'direct seal carries NO onBehalfOf (acted directly — absence is the signal)',
    direct == null ? { ok: true } : { ok: false, error: `onBehalfOf=${direct} on a DIRECT seal — the agent/direct distinction is forged` });
  const forged = await dp('instance.create', { type: NOTE, label: `forged-obo ${RUN}`, onBehalfOf: 'urn:ckp:participant:forged-claim' });
  const fo = forged?.onBehalfOf ?? null;
  // Two honest outcomes: the claim STRIPS (seals, stamp absent) or the undeclared-key gate
  // refuses (E-3). The ONE defect is a seal carrying the forged claim.
  rung('W14b', `payload claiming onBehalfOf → ${forged?.ok === false ? 'REFUSED (a gate spoke — acceptable)' : fo == null ? 'sealed with the claim STRIPPED' : 'SEALED WITH THE FORGED CLAIM'}`,
    forged?.__timeout ? forged : (forged?.ok === false || fo == null) ? { ok: true } : { ok: false, error: 'forged onBehalfOf survived to the seal — R-16 broken' });
} else skip('W14', 'fifth stamp (R-16)', 'no applied epoch to seal under');

// W15 — R-19 (C-1, 0.4.98): the quorum floor is the project's own declaration, and it binds
// IN THE PROJECT'S OWN SEAT. Fixed-name SHARED scratch project (idempotent germinate); the
// floor pair runs in-context; the cross-context spelling is the case-07 probe (W15c).
{
  const QPROJ = `${KERNEL}-beatq`;
  const qk = `urn:ckp:${QPROJ}/kernel`;
  await dp('kernel.germinate', { project: QPROJ, projectKind: 'shared', label: 'quorum-floor probe (SHARED, fixed scratch)' });
  let dq = null;
  try { dq = await seatFor(QPROJ); } catch (e) { skip('W15', 'quorum floor (R-19)', `no in-context seat: ${e.message}`); }
  if (dq) {
    rung('W15a', `IN-CONTEXT propose at quorum 1 on SHARED ${QPROJ} must REFUSE (declaring a partner binds you)`,
      await dq('kernel.propose_change', { op: 'add_class', about: qk, requires_quorum: 1,
        detail: { class: `urn:ckp:${QPROJ}/type/QuorumProbe`, label: 'QuorumProbe', comment: `door-beat ${RUN}: floor probe at 1` } }), 'refusal');
    rung('W15b', 'IN-CONTEXT propose at quorum 2 is ACCEPTED (the control — a floor that refuses everything is a wall)',
      await dq('kernel.propose_change', { op: 'add_class', about: qk, requires_quorum: 2,
        detail: { class: `urn:ckp:${QPROJ}/type/QuorumProbe`, label: 'QuorumProbe', comment: `door-beat ${RUN}: floor control at 2 — left pending, a partner may second` } }));
  }
  // W15c — THE CASE-07 PROBE, cross-context: dispatched from OUR seat about the shared project.
  // Substrate truth 0.4.109 (measured 2026-09-02): the floor reads the ACTING kernel's project
  // and ACCEPTS quorum 1 here — the same one-function-disagreeing-with-itself seam pgCK has
  // open as case 07 at apply, one verb earlier. Recorded verbatim either way; the printed
  // classification is what to watch across pgCK releases, not the rung's pass.
  const xc = await dp('kernel.propose_change', { op: 'add_class', about: qk, requires_quorum: 1,
    detail: { class: `urn:ckp:${QPROJ}/type/QuorumProbeX`, label: 'QuorumProbeX', comment: `door-beat ${RUN}: CROSS-context floor probe at 1 (case-07 family)` } });
  const xco = xc?.__timeout ? 'fault' : outcomeOf(xc);
  rung('W15c', `CROSS-context propose at quorum 1 → ${xco.toUpperCase()} — ${xco === 'refusal' ? 'case-07 seam CLOSED at propose (floor reads the about-target): update the spec' : xco === 'result' ? 'case-07 seam OPEN at propose (floor read the acting kernel)' : 'no verdict'}`,
    xc?.__timeout ? xc : { ok: true });
}

// W16 — R-23 (0.4.90+): a virgin kernel's FIRST apply is an honest 0 → 1. Fresh name per run
// ⇒ virgin by construction. The apply reply's quorum pair is printed as R9 wire evidence.
{
  const VPROJ = `bv${RUN.slice(5)}`;
  const vg = rung('W16a', `germinate VIRGIN personal kernel ${VPROJ}`,
    await dp('kernel.germinate', { project: VPROJ, projectKind: 'personal', label: `virgin epoch probe ${RUN}` }));
  if (vg.outcome === 'result') {
    const vk = `urn:ckp:${VPROJ}/kernel`;
    // IN-CONTEXT: the epoch that must go 0 → 1 is the VIRGIN project's own, so the whole
    // governed act runs in its seat (cross-context apply redirects into the acting kernel —
    // the case-07 seam, measured here 2026-09-02: ck-lib-js bumped 1→2, the virgin untouched).
    // The union mints a just-sealed kernel's subjects on its ~5s refresh (germination IS
    // existence, but not instantaneously) — wait one window before seating, or the seat's
    // first dispatch vanishes into the not-yet-granted gap. A documented propagation window,
    // not a retry-until-it-works.
    await new Promise((r) => setTimeout(r, 6500));
    let dv = null;
    try { dv = await seatFor(VPROJ); } catch (e) { dv = null; }
    if (!dv) { skip('W16b', 'virgin epoch 0→1', 'no in-context seat for the virgin kernel'); }
    const vp = dv ? await dv('kernel.propose_change', { op: 'add_class', about: vk, requires_quorum: 1,
      detail: { class: `urn:ckp:${VPROJ}/type/Probe`, label: 'Probe', comment: 'virgin first apply must be 0 → 1 (R-23; the phantom is retired)' } }) : null;
    const vpid = vp?.proposal_iri ?? vp?.id ?? vp?.proposal ?? vp?.result?.['@id'] ?? null;
    if (vpid) {
      await dv('kernel.vote', { about: vpid, value: 'approve' });
      const va = await dv('kernel.apply', { about: vpid });
      rung('W16b', `virgin first apply → epoch ${va?.epoch ?? '(none)'} (expected 1 — honest 0 → 1)`,
        va?.__timeout ? va : (va?.ok === true && va?.epoch === 1) ? va : { ok: false, error: `epoch after virgin first apply = ${va?.epoch ?? '(absent)'} — expected 1` });
      if (va && (va.approvals != null || va.rehearsal != null))
        console.log(`     quorum pair on the wire: approvals=${va.approvals ?? '—'} quorum=${va.quorum ?? '—'} rehearsal=${va.rehearsal ?? '—'}${va.quorumNote ? ` · "${String(va.quorumNote).slice(0, 80)}"` : ''}`);
    } else if (dv) skip('W16b', 'virgin apply', 'no proposal id came back');
  } else skip('W16b', 'virgin epoch 0→1', 'virgin germinate did not land');
}

// W17 — R-20 (C-9, 0.4.109): THE CONSTITUTIONAL LIMIT. The tick may draft; it may never
// seal a vote, apply, or advance an epoch — measured before/after, not taken from the flag alone.
{
  const ep0 = (await dp('surface.check'))?.epoch ?? null;
  const tick = await dp('score.tick', {});
  const t = rung('W17a', "score.tick answers (scores DERIVED under the kernel's own law)", tick);
  if (t.outcome === 'result') {
    const ep1 = (await dp('surface.check'))?.epoch ?? null;
    const held = tick.epochUnchanged !== false && ep0 === ep1;
    rung('W17b', `the tick drafted ${(tick.drafted ?? []).length} and moved NOTHING (epoch ${ep0}→${ep1} · epochUnchanged=${tick.epochUnchanged})`,
      held ? { ok: true } : { ok: false, error: `THE TICK MOVED THE EPOCH (${ep0}→${ep1}, epochUnchanged=${tick.epochUnchanged}) — CK-DOOR R-20 violation: file as a ledger regression with this reply verbatim` });
    if (tick.law) console.log(`     law: ${JSON.stringify(tick.law).slice(0, 160)}`);
  } else skip('W17b', 'tick limit', 'score.tick did not answer');
}

// W18 — R-11.3 (C-8, 0.4.109): never-saw seals NOTHING and is a SUCCESS; a real dwell head
// seals ONE implicit Signal on the same HMAC chain as everything.
{
  const about = `urn:ckp:${KERNEL}/concept/beat-presence`;
  const ns = await dp('signal.boundary', { about, events: 0 });
  rung('W18a', 'never-saw → ok:true sealed:false (absence of a Signal is correctly free — a SUCCESS)',
    ns?.__timeout ? ns : (ns?.ok === true && ns?.sealed === false && ns?.reason === 'never_saw') ? ns
      : { ok: false, error: `expected {ok:true,sealed:false,reason:never_saw}, got ${JSON.stringify(ns ?? null).slice(0, 120)}` });
  const head = await dp('signal.boundary', { about, dwellMillis: 1234, events: 3 });
  rung('W18b', 'a real dwell head seals ONE chained Signal (sealed:true, verified verbatim)',
    head?.__timeout ? head : (head?.ok === true && head?.sealed === true) ? head
      : { ok: false, error: `expected a sealed boundary head, got ${JSON.stringify(head ?? null).slice(0, 120)}` });
  if (head?.sealed) console.log(`     id=${head.id} · verified=${JSON.stringify(head.verified).slice(0, 40)} · events=${head.events}`);
}

// W19 — R-11.2 (C-10, 0.4.108): no declared orbit is a REAL ANSWER, refused by name.
rung('W19', 'orbit.next with NO declared orbit must REFUSE no_orbit_declared (never a zero shaped like a time)',
  await dp('orbit.next', {}), 'refusal');

// W20 — R-25 (C-6, 0.4.107): role narrowing needs sealed Memberships and a SECOND seated
// identity to be a real measurement (the owner is never narrowed, so a one-seat probe proves
// nothing). Deliberately deferred to the two-party pass on the pgck-mcp / ck-dev seats.
skip('W20', 'role narrowing (R-25)', 'needs Memberships + a second seated identity — the two-party pass (pgck-mcp / ck-dev)');

finish();

function finish() {
  const faults = ladder.filter((r) => r.outcome === 'fault' && !r.expected).length;
  const failed = ladder.filter((r) => r.pass === false).length;
  const proven = ladder.some((r) => r.id === 'W6b' && r.outcome === 'result');
  console.log(`\ndoor-beat: ${ladder.length} rungs · ${failed} failed · ${faults} faults · seal-and-prove ${proven ? 'PROVEN' : 'NOT PROVEN'}`);
  console.log(JSON.stringify({ run: RUN, ladder }, null, 1).slice(0, 4000));
  c?.nc?.close?.().catch?.(() => {});
  for (const sc of (typeof seats !== 'undefined' ? seats : [])) sc?.nc?.close?.().catch?.(() => {});
  // fleet exit protocol: 0 GREEN (seal-and-prove + no failed rungs) · 44 RED-measured
  // (climbed and measured, some rungs red — a refusal is a result) · 1 BROKEN (never climbed)
  process.exit(proven && failed === 0 ? 0 : proven ? 44 : 1);
}
