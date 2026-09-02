// tests/wire/door-confirm.mjs — GATE 1, the ROOT gate: which LAW does this door enforce?
// Read-only. Non-destructive. Safe on any door, including production.
//
// WIRE-NATIVE, WITH NO HTTP AT ALL (v1.6.1). The kit makes zero HTTP requests: law
// confirmation reads `surface.grounding → structuralDigest` through /wss, which is the
// digest of the LAW THE DOOR ACTUALLY LOADED. Served bytes prove what a deployment SHIPS,
// never what it ENFORCES — "proximity is not adoption" — so packaging verification belongs
// in the consumer's build gate, offline, against the attested artifact. It is not this kit's
// job and never was. (The former CK_ONTOLOGY packaging half is removed, not disabled.)
//
// NO DEFAULT DIGEST. A law pin is a PER-DEPLOYMENT declaration, never a kit constant: fleet
// benches legitimately run different law (an artifact-pinned bench boots its artifact's law).
// A baked-in constant is guaranteed to go false-RED on a correctly-pinned door. Unpinned, this
// gate REPORTS what it measured; pinned via CK_STRUCT_SHA, it CONFIRMS.
//
// Run:  export NODE_EXTRA_CA_CERTS="$(mkcert -CAROOT)/rootCA.pem"
//       CK_DOOR=wss://<host>/wss CK_KERNEL=<rostered-kernel> CK_TOKEN=<bearer> \
//       [CK_STRUCT_SHA=<64-hex>] [CK_SHAPES=<n>] node tests/wire/door-confirm.mjs
//
// Exit: 0 CONFIRMED (or measured, when unpinned) · 44 NOT CONFIRMED (measured mismatch)
//       1 COULD NOT MEASURE (instrument/transport fault — never a verdict on the door)
import CKClient from '../../ck-client.js';

const DOOR   = process.env.CK_DOOR;
const KERNEL = process.env.CK_KERNEL;
const TOKEN  = process.env.CK_TOKEN || null;
const STRUCT = process.env.CK_STRUCT_SHA || null;          // no default — see header
const SHAPES = process.env.CK_SHAPES ? Number(process.env.CK_SHAPES) : null;

// Charter §3: no default carries wire meaning. Absent required value ⇒ throw locally, named.
for (const [k, v] of Object.entries({ CK_DOOR: DOOR, CK_KERNEL: KERNEL })) {
  if (!v) { console.error(`door-confirm: ${k} is required and has no default (a door and a kernel are wire-meaning values).`); process.exit(1); }
}

const c = new CKClient({ kernel: KERNEL, gov: KERNEL, wssEndpoint: DOOR,
                         ...(TOKEN ? { tokenProvider: async () => TOKEN } : {}) });
let structural = null, wireShapes = null;
try {
  await c.connect();
  // W0 — ADMISSION. Assert what the door DID, never what env vars were set. Every CK door
  // requires a verified bearer; an admitted unverified connection is a defect in the DOOR.
  if (c.auth?.anonymous) {
    console.log('W0    ✗ ADMITTED WITHOUT A VERIFIED IDENTITY — this door is NON-CONFORMANT (CK-DOOR v1.6.1 §2/§3).');
    console.log('      Every measurement through it is void for acceptance. Not a posture, not a tier: a defect.');
    process.exit(1);
  }
  const cl = c.auth?.claims || {};
  console.log(`W0    admitted verified · sub ${String(cl.sub ?? c.auth?.userId).slice(0, 18)}… · iss ${cl.iss ?? '?'} · aud ${JSON.stringify(cl.aud ?? null)}`);

  // LAW — the binding criterion: the structural digest of the loaded root, read over the wire.
  // One sanctioned retry: a first dispatch within ~10s of a restart/idle may warm-up-timeout.
  let g = null;
  for (let attempt = 1; attempt <= 2 && !g; attempt++) {
    g = await c.dispatch('surface.grounding', `ckp://Kernel#${KERNEL}`, { iri: 'urn:ckp:core' }, { timeout: 12000 })
          .catch((e) => { console.log(`LAW   attempt ${attempt}: ${e.message}${attempt === 1 ? ' — warm-up, retrying once' : ''}`); return null; });
  }
  const core = (g?.graphs || []).find((x) => x.iri === 'urn:ckp:core') || g?.graphs?.[0];
  structural = core?.structuralDigest ?? null;
  wireShapes = core?.nodeshapes ?? null;
  if (structural) console.log(`LAW   surface.grounding urn:ckp:core → structuralDigest ${structural}  · nodeshapes ${wireShapes}`);

  // FLOOR (v1.6.3, informational — reporting, never confirming): what of the 0.4.109 surface
  // this door actually serves. Absent fields render honestly as not-served — a pre-floor door
  // is reported, not failed; a version number is never a measurement, and neither is this a
  // conformance verdict (that is door-suite's job once a door claims the floor).
  const chk = await c.dispatch('surface.check', `ckp://Kernel#${KERNEL}`, {}, { timeout: 12000 }).catch(() => null);
  if (chk?.ok) {
    const ep = chk.epoch ?? '?';
    const roster = chk.roster
      ? `union ${Array.isArray(chk.roster.union) ? chk.roster.union.length : '?'} (guc ${Array.isArray(chk.roster.guc) ? chk.roster.guc.length : '?'}) — read union, never guc alone`
      : 'not served (pre-0.4.90 roster read)';
    const eid = chk.engineIdentity
      ? `${chk.engineIdentity.verdict ?? chk.engineIdentity.agreement ?? JSON.stringify(chk.engineIdentity).slice(0, 60)}`
      : 'not served (pre-0.4.103 — loaded-vs-artifact divergence is invisible from here)';
    console.log(`FLOOR surface.check → epoch ${ep} · roster ${roster}`);
    console.log(`FLOOR engineIdentity → ${eid}${chk.engineIdentity?.verdict === 'diverged' ? '  ⚠ REPORT the divergence; never restart to hide it' : ''}`);
  } else console.log('FLOOR surface.check not readable from this seat (grant or pre-floor door) — reported, not judged');
  const ref = await c.dispatch('surface.refusals', `ckp://Kernel#${KERNEL}`, {}, { timeout: 12000 }).catch(() => null);
  if (ref?.ok) console.log(`FLOOR surface.refusals → registryDigest ${ref.registryDigest ? ref.registryDigest.slice(0, 16) + '… (cache key)' : 'not served (pre-0.4.90)'} · count ${ref.count ?? '?'} (informational, NEVER a cache key)`);
} catch (e) {
  console.log('LAW   fault:', e.message);
} finally {
  await c.nc?.close?.().catch(() => {});
}

const measured = structural !== null;
const pinned   = STRUCT !== null;
const lawOk    = !pinned || structural === STRUCT;
const shapesOk = SHAPES === null || wireShapes === SHAPES;
const verdict  = !measured ? 'COULD NOT MEASURE'
               : (lawOk && shapesOk) ? (pinned ? 'LAW CONFIRMED' : 'LAW MEASURED (unpinned — reporting, not confirming)')
               : 'LAW NOT CONFIRMED';
console.log(`\n${verdict}` +
  (measured ? ` — structural ${pinned ? (lawOk ? '✅ matches pin' : `✗ ${structural.slice(0, 12)}… ≠ pin ${STRUCT.slice(0, 12)}…`) : `${structural.slice(0, 12)}… (no CK_STRUCT_SHA given)`}` +
              ` · nodeshapes ${SHAPES === null ? `${wireShapes} (informational)` : `${wireShapes}/${SHAPES} ${shapesOk ? '✅' : '✗'}`}` : ''));
process.exit(verdict === 'LAW NOT CONFIRMED' ? 44 : measured ? 0 : 1);
