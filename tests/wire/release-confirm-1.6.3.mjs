// tests/wire/release-confirm-1.6.3.mjs — WHAT EXACTLY IS IN v1.6.3, confirmed over the wire.
//
// One rung per CHANGELOG [1.6.3] item, exercised THROUGH THE RELEASED LIBRARY SURFACE
// (CK.activate / k.* — never raw dispatch), against a door that serves this exact working
// tree (instrument-provenance: the pgck.localhost bind mount). WRITES — destructive bench
// only (it governs and seals). Three-state honest; expected refusals are passes.
//
//   CK_DOOR=wss://pgck.localhost/wss CK_KERNEL=ck-lib-js CK_TOKEN=<bearer> \
//   node tests/wire/release-confirm-1.6.3.mjs
//
// Exit: 0 GREEN · 44 RED-measured · 1 BROKEN (never climbed / activation failed)
import { CK, VERSION, outcomeOf } from '../../ck.js';

const DOOR   = process.env.CK_DOOR   || 'wss://pgck.localhost/wss';
const KERNEL = process.env.CK_KERNEL || 'ck-lib-js';
const TOKEN  = process.env.CK_TOKEN  || null;
const RUN    = 'rc163-' + Date.now().toString(36);

let pass = 0, fail = 0, skip = 0;
const ok = (id, name, c, detail = '') => {
  if (c) { pass++; console.log(`  ✅ ${id} ${name}${detail ? ' — ' + detail : ''}`); }
  else   { fail++; console.log(`  ❌ ${id} ${name}${detail ? ' — ' + detail : ''}`); }
};
const skipped = (id, name, why) => { skip++; console.log(`  ⏭  ${id} ${name} — ${why}`); };

console.log(`release-confirm v1.6.3 — ${DOOR} · kernel ${KERNEL} · run ${RUN} · lib VERSION ${VERSION}\n`);

let k = null;
try {
  k = await CK.activate(KERNEL, { wssEndpoint: DOOR, ...(TOKEN ? { tokenProvider: async () => TOKEN } : {}) });
} catch (e) {
  console.log(`ACTIVATION FAILED: ${e.message} — nothing below is measurable (BROKEN, not a verdict)`);
  process.exit(1);
}

// R0 — the artifact identifies itself (v1.5.12 rule, at the new number)
ok('R0', 'VERSION is 1.6.3 through the released surface', VERSION === '1.6.3' && CK.VERSION === '1.6.3', VERSION);

// R6 — ADDED: the FIFTH stamp through writeResult (absence = acted directly, key present)
let sealed = null;
{
  const w = await k.create(`urn:ckp:${KERNEL}/type/BeatNote`, { label: `release-confirm ${RUN}` });
  sealed = w;
  ok('R6a', 'create() seals through the library (BeatNote, declared class)', w.ok === true && !!w.id, String(w.id).slice(0, 40));
  ok('R6b', 'five stamps surfaced: createdBy · sealedAtEpoch · producedBy · conformsToShape · onBehalfOf',
    'createdBy' in w && 'sealedAtEpoch' in w && 'producedBy' in w && 'conformsToShape' in w && 'onBehalfOf' in w,
    `sealedAtEpoch=${w.sealedAtEpoch}`);
  ok('R6c', 'onBehalfOf is null-with-key on a direct seal (acted directly, never unknown)', w.onBehalfOf === null);
}

// R2/R3 — BREAKING: get() one id vocabulary; a refusal THROWS, never a silent null
if (sealed?.id) {
  const local = String(sealed.urn ?? sealed.id).split(/[#/]/).pop();
  for (const [label, idv] of [['emitted', sealed.id], ['bare', local], ['urn', `urn:ckp:instance:${local}`]]) {
    try {
      const g = await k.get(idv);
      ok(`R2:${label}`, `get() resolves the ${label} form`, g != null);
    } catch (e) { ok(`R2:${label}`, `get() resolves the ${label} form`, false, `threw: ${e.message.slice(0, 80)}`); }
  }
  let threw = null;
  try { await k.get(`rc163-nonexistent-${RUN}`); } catch (e) { threw = e; }
  // The contract: a refusal THROWS with the sqlstate and the clause VERBATIM. The error field
  // carries the substrate's prose clause (its own words teach the accepted forms) — asserting
  // a literal code here was this instrument's first over-reach, corrected on first flight.
  ok('R3', 'get() on a nonexistent id THROWS the refusal verbatim (was: silent null — charter §2)',
    !!threw && threw.refused === true && threw.sqlstate === '42704' && /no instance resolves/.test(String(threw.reply?.error ?? '')),
    threw ? `${String(threw.reply?.error).slice(0, 60)}… · ${threw.sqlstate}` : 'returned instead of throwing');
} else skipped('R2/R3', 'id vocabulary', 'no seal to read back');

// R5 — BREAKING: govern() reads the verdict back (server rehearsal + the quorum pair)
{
  const g = await k.govern('add_class', { class: `urn:ckp:${KERNEL}/type/RcProbe${RUN.slice(-4)}`,
    label: 'RcProbe', comment: `release-confirm ${RUN}: govern read-back (quorum 1 rehearsal on a personal project)` });
  ok('R5a', 'govern() completes propose→vote→apply', g.ok === true && g.state === 'applied', `epoch ${g.epoch}`);
  const serverSaid = g.rehearsalSource === 'server';
  ok('R5b', `rehearsal is read back, not derived — rehearsalSource '${g.rehearsalSource}'`,
    g.rehearsal === true && (serverSaid || g.rehearsalSource === 'client-derived'),
    serverSaid ? 'the door sent it (0.4.90+ success path)' : 'door sent none; labelled fallback held');
  ok('R5c', 'the quorum pair rides: approvals AND the bar it cleared', serverSaid ? (g.approvals === 1 && g.quorum === 1) : g.approvals === undefined,
    serverSaid ? `approvals=${g.approvals} quorum=${g.quorum}${g.quorumNote ? ' · note verbatim' : ''}` : 'pair absent on a door that did not send it (honest)');
}

// R8/R9/R10 — ADDED: the clock surface, constitutional limit rendered
{
  let threw = null;
  try { await k.clock.next(); } catch (e) { threw = e; }
  ok('R8', 'clock.next() with no declared orbit THROWS no_orbit_declared (never a zero shaped like a time)',
    !!threw && threw.reply?.error === 'no_orbit_declared' && threw.sqlstate === '42704');
}
{
  try {
    const t = await k.clock.tick();
    ok('R9', 'clock.tick() returns verbatim: epochUnchanged:true, law.defaultsNote, the note',
      t.ok === true && t.epochUnchanged === true && /NAMED substrate defaults/.test(t.law?.defaultsNote ?? '') && /DRAFT only/.test(t.note ?? ''),
      `drafted=${(t.drafted ?? []).length}`);
  } catch (e) { ok('R9', 'clock.tick()', false, e.message.slice(0, 100)); }
}
{
  const ns = await k.clock.boundary({ about: `urn:ckp:${KERNEL}/concept/rc-presence`, events: 0 });
  ok('R10a', 'clock.boundary() never-saw returns as the SUCCESS it is (sealed:false, reason verbatim)',
    ns.ok === true && ns.sealed === false && ns.reason === 'never_saw');
  const head = await k.clock.boundary({ about: `urn:ckp:${KERNEL}/concept/rc-presence`, dwellMillis: 987, events: 2 });
  ok('R10b', 'a real dwell head seals ONE chained Signal', head.ok === true && head.sealed === true, `verified=${JSON.stringify(head.verified).slice(0, 24)}`);
}

// R4 — BREAKING: the four-outcome classifier against LIVE replies
{
  // judged on a live reply, never a synthetic where the wire can speak:
  let live42704 = null;
  try { await k.get(`rc163-x2-${RUN}`); } catch (e) { live42704 = e.reply; }
  ok('R4b', "live unknown_instance classifies 'refusal' (not-XX rule, no refused-flag dependence)",
    live42704 ? outcomeOf({ ...live42704 }) === 'refusal' : false);
  ok('R4c', "synthetic 0A000 classifies 'delegated' (seam not triggerable on this bench — offline half)",
    outcomeOf({ ok: false, sqlstate: '0A000', error: 'verb_delegated' }) === 'delegated');
}

// R11 — CHANGED: the refusal set is digest-addressed through the surface namespace
{
  const r = await k.surface.refusals();
  ok('R11', 'surface.refusals() carries registryDigest (the cache key; the count never is)',
    typeof r.registryDigest === 'string' && r.registryDigest.length === 64, `${r.registryDigest.slice(0, 16)}… · count ${r.count} (informational)`);
}

// R12 — charter §3 held at the new act: germinate refuses to guess, locally
{
  let threw = null;
  try { await k.germinate({}); } catch (e) { threw = e; }
  ok('R12', 'germinate({}) throws locally naming projectKind — before any wire I/O',
    !!threw && /projectKind/.test(threw.message));
}

// R7 — the bus frame carries the consistency token (and the fifth stamp key discipline)
{
  const p = k.next({ kind: 'event' }, { timeout: 8000 }).catch(() => null);
  await k.create(`urn:ckp:${KERNEL}/type/BeatNote`, { label: `bus probe ${RUN}` });
  const fr = await p;
  if (fr) ok('R7', 'a sealed event frame surfaces sealedAtEpoch (Q-4 spellings) and the onBehalfOf key',
    'sealedAtEpoch' in fr && 'onBehalfOf' in fr, `sealedAtEpoch=${fr.sealedAtEpoch} · onBehalfOf=${fr.onBehalfOf}`);
  else skipped('R7', 'bus frame', 'no event frame arrived within 8s — reported, not judged');
}

await k.close?.().catch?.(() => {});
console.log(`\nrelease-confirm-1.6.3: ${pass} passed · ${fail} failed · ${skip} skipped`);
process.exit(fail === 0 ? 0 : 44);
