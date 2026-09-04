// WIRE ONLY · DESTRUCTIVE · TWO-PARTY. Breakable benches only.
// Question: what can ONE verified bearer reach that is not its own?
// Party A (CK_TOKEN_A) germinates a kernel and owns its rows. Party B (CK_TOKEN_B) — a
// different verified sub on the SAME door — then tries to act as A's kernel, patch A's row,
// retire it, and forge the server-derived stamps. Every OK below is an exposure, not a pass.
// Not a gate: no exit protocol. Reproduction for the v1.6.4 security pass.
//   CK_BEAT=1 CK_DOOR=… CK_KERNEL_A=pgck CK_KERNEL_B=ck-lib-js CK_TOKEN_A=… CK_TOKEN_B=… \
//     node tests/wire/_crosstoken-probe.mjs
import { CK } from '../../ck.js';
const DOOR = process.env.CK_DOOR;
const KA = process.env.CK_KERNEL_A || 'pgck', KB = process.env.CK_KERNEL_B || 'ck-lib-js';
const TA = process.env.CK_TOKEN_A, TB = process.env.CK_TOKEN_B;
if (process.env.CK_BEAT !== '1') { console.log('refusing: CK_BEAT=1 required — this probe WRITES rows it does not own'); process.exit(2); }
if (!TA || !TB) { console.log('refusing: CK_TOKEN_A and CK_TOKEN_B must be DIFFERENT verified bearers'); process.exit(2); }
const cut = (x, n = 800) => { const s = JSON.stringify(x); return s.length > n ? s.slice(0, n) + '…' : s; };
const probe = async (label, fn) => {
  try { const r = await fn(); const ref = r && r.ok === false;
        console.log(`\n--- ${label}\n    ${ref ? 'REFUSED ' : 'OK      '}${cut(r)}`); return r; }
  catch (e) { console.log(`\n--- ${label}\n    THROWN  ${e.message.slice(0, 200)}\n            refused=${e.refused} sqlstate=${e.sqlstate}\n            ${cut(e.reply, 500)}`); return null; }
};
const seat = (k, t) => CK.activate(k, { wssEndpoint: DOOR, tokenProvider: async () => t });

const A = await seat(KA, TA);
const B = await seat(KB, TB);
console.log(`== A: seat '${KA}' on bearer A   ·   B: seat '${KB}' on bearer B   @ ${DOOR} ==`);
const whoA = await A.do('authority.mine', {}), whoB = await B.do('authority.mine', {});
console.log(`   A identity ${whoA?.identity}  tier ${whoA?.tier}`);
console.log(`   B identity ${whoB?.identity}  tier ${whoB?.tier}`);
if (whoA?.identity === whoB?.identity) { console.log('   ABORT: both tokens carry the SAME sub — not a two-party test'); process.exit(2); }

console.log(`\n### SETUP · A germinates its own kernel '${KA}'`);
await probe('A kernel.germinate', () => A.do('kernel.germinate', { project: KA, projectKind: 'shared', label: `${KA} — crosstoken specimen` }));
const VICTIM = `urn:ckp:${KA}/kernel`;
const before = await probe(`A reads back ${VICTIM} (the row A owns)`, () => A.do('instance.get', { id: VICTIM }));
const b = before?.instance?.body || {};
const P = 'https://conceptkernel.org/ontology/v3.11/core#';
console.log(`\n   BEFORE  createdBy  = ${b[P+'createdBy']}\n           producedBy = ${b[P+'producedBy']}\n           label      = ${b['http://www.w3.org/2000/01/rdf-schema#label']}`);

console.log(`\n### X-1 · may B ACT AS A's kernel '${KA}'? (kernel name is a client-supplied string)`);
let Bas = null;
try { Bas = await seat(KA, TB); console.log(`    ACTIVATED — B holds a seat named '${Bas.name}' on B's own bearer`); }
catch (e) { console.log(`    refused: ${e.message.slice(0, 200)}`); }
if (Bas) await probe(`X-1a B reads ${KA}'s surface.check`, () => Bas.do('surface.check', {}));

console.log(`\n### X-2 · may B WRITE the row A created?`);
await probe('X-2a B instance.update {label}', () => B.do('instance.update', { id: VICTIM, patch: { label: 'CROSSTOKEN-PROBE-B-WAS-HERE' } }));
await probe('X-2b B instance.update {ownedBy} — 42501 ownership gate, or 42704 undeclared key?', () => B.do('instance.update', { id: VICTIM, patch: { ownedBy: whoB?.identityCanonical } }));
await probe('X-2c B instance.retire', () => B.do('instance.retire', { id: VICTIM, reason: 'crosstoken-probe' }));

const after = await probe(`X-2d read back — whose name is on it now?`, () => B.do('instance.get', { id: VICTIM }));
const a2 = after?.instance?.body || {};
console.log(`\n   AFTER   createdBy  = ${a2[P+'createdBy']}\n           producedBy = ${a2[P+'producedBy']}\n           label      = ${a2['http://www.w3.org/2000/01/rdf-schema#label']}`);
const rewritten = b[P+'createdBy'] !== a2[P+'createdBy'];
console.log(`\n   ATTRIBUTION REWRITTEN: ${rewritten ? "YES — A's name was replaced by B's" : 'no — createdBy survived'}`);

console.log('\n### X-3 · are the server-derived stamps forgeable from a payload?');
// Uses core#Organ: admitted AND shaped on a bare floor, so the seal reaches the stamp logic
// instead of dying at the type gate. organKind/writeAuthority satisfy OrganShape's MinCount
// and its In-constraint — without them the SHACL plane answers first and X-3 proves nothing.
const EVIL = 'urn:ckp:participant:00000000-0000-0000-0000-000000000000';
const forged = { createdBy: EVIL, onBehalfOf: EVIL, ownedBy: EVIL,
                 producedBy: 'urn:ckp:evil/kernel', sealedAtEpoch: 999, conformsToShape: 'urn:fake:Shape' };
const made = await probe('X-3a B create an admitted+shaped row with every stamp forged', () => B.do('instance.create', {
  type: P + 'Organ', label: 'forge-probe', organKind: 'tool', writeAuthority: 'readwrite', ...forged }));
if (made?.id) {
  const back = await B.do('instance.get', { id: made.id });
  const row = back?.instance?.body || {};
  console.log('\n   did any forged value survive the seal?');
  for (const [key, sent] of Object.entries(forged)) {
    const got = row[P + key];
    const survived = JSON.stringify(got) === JSON.stringify(sent);
    console.log(`     ${key.padEnd(16)} sealed=${String(JSON.stringify(got)).padEnd(56)} ${survived ? '*** FORGED VALUE SURVIVED ***' : 'stripped/derived OK'}`);
  }
}

console.log('\n### X-5 · ESCALATION — is a declared patch key ever permission-shaped?');
// core#Organ declares dependsOn / organKind / writeAuthority. The last is an enum over
// governed-only | readonly-on-ontology | readwrite — a PERMISSION sitting in the ordinary
// patch allowlist. If B can relax A's, the ownership hole is also an escalation path.
const locked = await probe('X-5a A seals an Organ as writeAuthority=governed-only', () => A.do('instance.create', {
  type: P + 'Organ', label: 'locked organ', organKind: 'tool', writeAuthority: 'governed-only' }));
if (locked?.id) {
  const pre = await A.do('instance.get', { id: locked.id });
  await probe('X-5b B (non-owner) patches writeAuthority -> readwrite', () => B.do('instance.update', { id: locked.id, patch: { writeAuthority: 'readwrite' } }));
  const post = await B.do('instance.get', { id: locked.id });
  const was = pre?.instance?.body?.[P + 'writeAuthority'], now = post?.instance?.body?.[P + 'writeAuthority'];
  console.log(`\n   writeAuthority ${was} -> ${now}`);
  console.log(`   ESCALATION: ${was !== now ? '*** A PERMISSION-SHAPED FIELD WAS CHANGED BY A NON-OWNER ***' : 'no change'}`);
  console.log(`   createdBy now ${post?.instance?.body?.[P + 'createdBy']}`);
}

console.log('\n### X-4 · confident-nonsense on the identity surface');
await probe('X-4a participant.join (no args)', () => B.do('participant.join', {}));
await probe('X-4b kernels.list', () => B.do('kernels.list', {}));
console.log('\n### X-6 · N-1/N-3/N-4 — the TWO attribution planes, and what create mints');
// The substrate keeps its own trail at urn:ckp:board/created_by, OUTSIDE the core# namespace the
// shapes judge. On a row B genuinely created the two planes AGREE (that is the built-in control);
// on a row B only patched they DISAGREE, and the governed one names the patcher.
const BOARD = 'urn:ckp:board/';
const show = async (label, id) => {
  const b = (await B.do('instance.get', { id }))?.instance?.body || {};
  console.log(`   ${label}`);
  console.log(`     board/created_by  ${b[BOARD + 'created_by'] ?? '(absent — germinate writes no trail: N-2, rewrite is IRREVERSIBLE here)'}`);
  console.log(`     core#createdBy    ${b[P + 'createdBy']}`);
  console.log(`     core#participant  ${b[P + 'participant']}`);
  console.log(`     core#action       ${b[P + 'action'] ?? '—'}  (still says instance.create after a patch? N-4)`);
  console.log(`     core#ownedBy      ${b[P + 'ownedBy'] ?? '—'}`);
  const agree = b[BOARD + 'created_by'] && b[BOARD + 'created_by'] === b[P + 'createdBy'];
  if (b[BOARD + 'created_by']) console.log(`     PLANES ${agree ? 'AGREE (control — B created this one)' : '*** DISAGREE — board keeps the true creator, core# names the patcher ***'}`);
};
if (made?.id) await show('the row B CREATED (control — expect AGREE):', made.id);
{ // a row A created and B patches: expect DISAGREE
  const owned = await A.do('instance.create', { type: P + 'Organ', label: 'A-created, B-patched', organKind: 'tool', writeAuthority: 'readwrite' });
  if (owned?.id) {
    await B.do('instance.update', { id: owned.id, patch: { organKind: 'data' } });
    await show('the row A created and B PATCHED (expect DISAGREE):', owned.id);
  }
}
await show('the germinated Kernel (expect NO board trail at all):', VICTIM);
// N-4 — create mints an undeclared property; update refuses one.
const decl = await B.do('surface.declared', { type: P + 'Organ' });
console.log(`\n   surface.declared Organ -> ${Object.keys(decl?.declared ?? {}).join(', ')}`);
console.log('   ownedBy is NOT in that set, yet X-3 sealed it verbatim and it persists:');
console.log('     create -> MINTS an undeclared property · update -> REFUSES it (42704). One type, two policies (N-4).');

await A.close?.(); await B.close?.(); await Bas?.close?.();
process.exit(0);
