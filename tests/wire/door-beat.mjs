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
const DIGESTS = {                                            // sha256 of the v3.12 module files (pgCK tree, 2026-08-26)
  wave:  'ad887db28c6e0ea04c7cbd835c40dc5441f073be988475a9634c76e9131db727',
  recon: '6a7c199e7ad19580b5e975624d15a9d4823e20dee9946cd20600b04c509100ea',
};

const ladder = [];
const rung = (id, name, r, expected = null) => {
  const o = r?.__timeout ? 'FAULT' : outcomeOf(r);
  const pass = expected ? (o === expected) : (o !== 'FAULT');
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

// W1/W2 — the reply axis, and the state cited by digest
const w1 = rung('W1', 'dispatch answers (surface.check)', await dp('surface.check', {}));
if (w1.outcome === 'FAULT') {
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
if (w3.outcome !== 'FAULT') {
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
if (applied) {
  const seal = await dp('instance.create', { type: NOTE, label: `sealed by door-beat ${RUN}` });
  const s = rung('W5', 'seal a BeatNote (four stamps expected)', seal);
  if (s.outcome === 'result') {
    const stamps = ['createdBy', 'sealedAtEpoch', 'producedBy', 'conformsToShape']
      .map((k) => `${k}=${seal[k] ?? seal[k.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase())] ?? 'ABSENT'}`);
    console.log(`     ${stamps.join(' · ')}`);
    const id = seal.id ?? seal.result?.['@id'];
    rung('W6a', 'verify (HMAC chain, verbatim)', await dp('instance.verify', { id }));
    rung('W6b', 'provenance (proof rows + ledger seq)', await dp('instance.provenance', { id }));
  } else skip('W6', 'proofs', 'the seal did not land');
} else skip('W5/W6', 'seal + prove', 'no applied epoch to seal under');

// W7 — the gate must speak (negative controls: a refusal IS the pass)
rung('W7a', 'bare-name type must refuse', await dp('instance.create', { type: 'NotAnIri', probe: RUN }), 'refusal');
rung('W7b', 'undeclared type must refuse', await dp('instance.create', { type: `urn:ckp:${KERNEL}/type/NeverDeclared${RUN}`, probe: RUN }), 'refusal');

// W8 — module adoptions by digest (anonymous shell ⇒ an identity refusal is the honest boundary)
for (const [mod, digest] of Object.entries(DIGESTS)) {
  rung(`W8:${mod}`, `adopt ${mod} by digest ${digest.slice(0, 12)}…`,
    await dp('instance.create', { type: `${CKP}Adoption`, adopts: `urn:ckp:module/${mod}/v3.12`,
      intoProject: `urn:ckp:${KERNEL}`, sourceDigest: digest }));
}

// W9 — the reference spore's own positive/negative pair (SPORE spec §9: the half that matters)
rung('W9a', 'recon:Chunk positive (text+section)',
  await dp('instance.create', { type: `${RECON}Chunk`, text: `beat ${RUN}`, section: 'intro' }));
rung('W9b', 'recon:Chunk negative — NO section must refuse MinCount',
  await dp('instance.create', { type: `${RECON}Chunk`, text: `beat ${RUN} incomplete` }), 'refusal');

// W10/W11 — module verbs through the door (whatever answers is the truth of this bench today)
rung('W10', 'wave.signals (unknown_affordance / module-not-adopted / executor result — verbatim)', await dp('wave.signals', {}));
rung('W11', 'lex read (instance.query lexicon Pattern)', await dp('instance.query', { type: 'https://conceptkernel.org/ontology/v3.11/lexicon#Pattern' }));

finish();

function finish() {
  const faults = ladder.filter((r) => r.outcome === 'FAULT' && !r.expected).length;
  const failed = ladder.filter((r) => r.pass === false).length;
  const proven = ladder.some((r) => r.id === 'W6b' && r.outcome === 'result');
  console.log(`\ndoor-beat: ${ladder.length} rungs · ${failed} failed · ${faults} faults · seal-and-prove ${proven ? 'PROVEN' : 'NOT PROVEN'}`);
  console.log(JSON.stringify({ run: RUN, ladder }, null, 1).slice(0, 4000));
  c?.nc?.close?.().catch?.(() => {});
  // fleet exit protocol: 0 GREEN (seal-and-prove + no failed rungs) · 44 RED-measured
  // (climbed and measured, some rungs red — a refusal is a result) · 1 BROKEN (never climbed)
  process.exit(proven && failed === 0 ? 0 : proven ? 44 : 1);
}
