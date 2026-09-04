// tests/wire/release-confirm-1.6.4.mjs — WHAT EXACTLY IS IN v1.6.4, confirmed over the wire.
//
// One rung per v1.6.4 requirement (R17…R24), exercised THROUGH THE RELEASED LIBRARY SURFACE
// (CK.activate / k.* — never raw dispatch), against a door that serves this exact working tree.
// Reads only, EXCEPT W8 (R24), which is guarded behind CK_BEAT=1 because proving a write guard
// requires a write. Three-state honest; expected refusals are passes.
//
//   CK_DOOR=wss://pgck.localhost/wss CK_KERNEL=ck-lib-js CK_TOKEN=<bearer> \
//   node tests/wire/release-confirm-1.6.4.mjs
//
// Exit: 0 GREEN · 44 RED-measured · 1 BROKEN (never climbed / activation failed)
import { CK, VERSION } from '../../ck.js';

const DOOR   = process.env.CK_DOOR   || 'wss://pgck.localhost/wss';
const KERNEL = process.env.CK_KERNEL || 'ck-lib-js';
const TOKEN  = process.env.CK_TOKEN  || null;

let pass = 0, fail = 0, skip = 0;
const ok = (id, name, c, detail = '') => {
  if (c) { pass++; console.log(`  ✅ ${id} ${name}${detail ? ' — ' + detail : ''}`); }
  else   { fail++; console.log(`  ❌ ${id} ${name}${detail ? ' — ' + detail : ''}`); }
};
const skipped = (id, name, why) => { skip++; console.log(`  ⏭  ${id} ${name} — ${why}`); };

console.log(`release-confirm v1.6.4 — ${DOOR} · kernel ${KERNEL} · lib VERSION ${VERSION}\n`);

let k = null;
try { k = await CK.activate(KERNEL, { wssEndpoint: DOOR, ...(TOKEN ? { tokenProvider: async () => TOKEN } : {}) }); }
catch (e) { console.log(`BROKEN — activation failed: ${e.message}`); process.exit(1); }

console.log('R17 — the adoption facade exists and routes');
try {
  const r = await k.adoption.check();
  ok('W1', 'k.adoption.check() reaches the verb', r?.ok === true, `drifted=${r?.drifted}`);
  ok('W1b', 'the scoped completeness verdict survives verbatim',
     typeof r?.completeness?.verdict === 'string', r?.completeness?.verdict);
  const mods = Array.isArray(r?.modules) ? r.modules : [];
  if (!mods.length) skipped('W1c', 'loadable() over a real module report', 'this seat has no adoptions — modules[] empty (§13.6)');
  else {
    const v = k.adoption.loadable(mods[0]);
    ok('W1c', 'loadable() renders a real report', ['verified', 'refused', 'unknown'].includes(v.verdict),
       `${mods[0].module ?? '?'} → ${v.verdict}`);
  }
} catch (e) { ok('W1', 'adoption.check', false, e.message.slice(0, 120)); }

console.log('R18 — capability is a two-array answer');
try {
  const c = await k.capabilities();
  ok('W2', 'capabilities() returns declared/routed/unsealed/gap',
     Array.isArray(c.declared) && Array.isArray(c.routed) && typeof c.gap === 'number',
     `declared ${c.declared.length} · routed ${c.routed.length} · gap ${c.gap}`);
  ok('W2b', 'routed is never smaller than declared (the gap is a distance, never negative)', c.gap >= 0);
  if (c.declared.length === 0 && c.routed.length > 0)
    ok('W2c', 'THE C-3 CONDITION IS LIVE HERE — 0 sealed, many routed; "[] ≠ no capabilities" is not hypothetical',
       true, `render as "declared: none yet · routed: ${c.routed.length}"`);
  else skipped('W2c', 'the C-3 declared/routed gap', `declared ${c.declared.length} — this kernel has a populated ledger`);
} catch (e) { ok('W2', 'capabilities()', false, e.message.slice(0, 120)); }

console.log('R20 — surface.* is seat-scoped, and the key proves it');
try {
  const tc = await k.surface.typecheck({ type: 'https://conceptkernel.org/ontology/v3.11/core#Kernel' });
  ok('W3', 'typecheck carries surface + surfaceDigest', !!tc.surface && !!tc.surfaceDigest,
     `${tc.surface} ${String(tc.surfaceDigest).slice(0, 12)}…`);
  ok('W3b', 'surface.key() binds kernel AND digest', k.surface.key(tc) === `${tc.kernel}|${tc.surfaceDigest}`);
  ok('W3c', 'shaped/admitted are read from THIS verb (the judgement question)',
     typeof tc.shaped === 'boolean' && typeof tc.admitted === 'boolean', `shaped=${tc.shaped} admitted=${tc.admitted}`);
} catch (e) { ok('W3', 'seat scope', false, e.message.slice(0, 120)); }

console.log('R19 — the shaped collision, both sides, live');
try {
  const T = 'https://conceptkernel.org/ontology/v3.11/core#Kernel';
  const tc = await k.surface.typecheck({ type: T });
  const rows = await k.query(T);
  ok('W4', 'query surfaces its flag as filterKeysConstrained, not `shaped`',
     rows.filterKeysConstrained !== undefined && rows.shaped === undefined,
     `typecheck.shaped=${tc.shaped} · query.filterKeysConstrained=${rows.filterKeysConstrained}`);
} catch (e) { ok('W4', 'shaped collision', false, e.message.slice(0, 120)); }

console.log('R21 — registryDigest is the key; build_id is surfaced');
try {
  const rf = await k.surface.refusals();
  ok('W5', 'refusalsKey() is the digest, never the count',
     k.surface.refusalsKey(rf) === rf.registryDigest && !k.surface.refusalsKey(rf).includes(String(rf.count)),
     `${String(rf.registryDigest).slice(0, 16)}… (count ${rf.count} — informational)`);
  const d = await k.doorIdentity();
  ok('W6', 'doorIdentity surfaces build_id beside version',
     d.version !== null && d.buildId !== null, `version ${d.version} · build ${d.buildId} · agree ${d.agreement}`);
} catch (e) { ok('W5', 'registry/identity', false, e.message.slice(0, 120)); }

console.log('R23 — signal.boundary payload contract, confirmed by its own refusal');
try {
  let err = null;
  await k.clock.boundary({ concept: 'x', boundary: 'y', dwellMillis: 1 }).catch((e) => { err = e; });
  ok('W7', 'the WRONG keys are refused 22004 with the hint naming {about, dwellMillis, events}',
     !!err && err.sqlstate === '22004' && /about.*dwellMillis.*events/.test(err.reply?.hint ?? ''),
     err?.reply?.hint);
} catch (e) { ok('W7', 'boundary contract', false, e.message.slice(0, 120)); }

console.log('R24 — the ownership pre-flight, against a row a DIFFERENT participant sealed');
// SELF-CONTAINED: the rung mints its own specimen with a SECOND bearer (CK_TOKEN_OWNER), so it
// is repeatable and never depends on bench state left by a previous run. Without that second
// bearer it SKIPS rather than testing one identity against itself — a probe that cannot tell
// "authorised" from "unchecked" has not tested authorisation (build rule 7).
const OWNER_TOKEN = process.env.CK_TOKEN_OWNER || null;
const OWNER_KERNEL = process.env.CK_KERNEL_OWNER || 'pgck';
const P = 'https://conceptkernel.org/ontology/v3.11/core#';
if (process.env.CK_BEAT !== '1') skipped('W8', 'ownership guard', 'needs CK_BEAT=1 (it writes)');
else if (!OWNER_TOKEN) skipped('W8', 'ownership guard', 'needs CK_TOKEN_OWNER — a SECOND verified bearer, distinct from CK_TOKEN');
else {
  let owner = null, victim = null, ownerSub = null;
  try {
    owner = await CK.activate(OWNER_KERNEL, { wssEndpoint: DOOR, tokenProvider: async () => OWNER_TOKEN });
    const oa = await owner.do('authority.mine', {});
    ownerSub = oa?.identityCanonical ?? (oa?.identity ? `urn:ckp:participant:${oa.identity}` : null);
    const ma = await k.do('authority.mine', {});
    const mySub = ma?.identityCanonical ?? (ma?.identity ? `urn:ckp:participant:${ma.identity}` : null);
    if (!ownerSub || ownerSub === mySub) skipped('W8', 'ownership guard', `both tokens carry the same sub (${mySub}) — not a two-party test`);
    else {
      // Organ declares dependsOn/organKind/writeAuthority — NOT label. Patch a DECLARED key, or
      // the run measures undeclared_patch_key (42704) and mistakes it for an ownership gate.
      const w = await owner.create(P + 'Organ', { label: 'release-confirm specimen', organKind: 'tool', writeAuthority: 'readwrite' });
      victim = w.id;
      ok('W8', 'a second participant sealed a row', !!victim && w.createdBy === ownerSub, `${victim} createdBy ${w.createdBy}`);
      let err = null;
      await k.update(victim, { organKind: 'data' }).catch((e) => { err = e; });
      ok('W8b', 'update() on that row throws LOCALLY, before any write is dispatched',
         !!err && err.localGuard === 'R24' && err.refused === false && err.sqlstate === null);
      ok('W8c', 'the throw names R-33 and states the write WOULD have succeeded',
         !!err && /R-33/.test(err.message) && /would\s+SUCCEED/i.test(err.message));
      // NEGATIVE CONTROL — and the standing proof that R-33 is UNMET. The escape hatch must
      // reach the door; the door then accepts a write by a participant who does not own the row.
      const forced = await k.update(victim, { organKind: 'data' }, { crossOwner: true });
      ok('W8d', 'crossOwner:true reaches the door — AND THE DOOR ACCEPTS IT (R-33 UNMET, measured)',
         forced.ok === true, forced.ok === true ? `createdBy REWRITTEN ${ownerSub} → ${forced.createdBy}` : `refused: ${forced.error}`);
      ok('W8e', 'the attribution rewrite is VISIBLE to the caller (R24.1 — this is why ownedBy/createdBy are surfaced)',
         forced.ok === true && forced.createdBy !== ownerSub);
    }
  } catch (e) { ok('W8', 'ownership guard', false, e.message.slice(0, 160)); }
  await owner?.close?.();
}

console.log(`\nrelease-confirm 1.6.4: ${pass} passed, ${fail} failed, ${skip} skipped`);
process.exit(fail ? 44 : 0);
