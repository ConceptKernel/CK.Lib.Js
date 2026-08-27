// tests/wire/door-confirm.mjs — the ROOT gate: confirm what law a door actually runs.
// Non-destructive. The two-part criterion (pgCK §5, the v3.12 FINAL method): a WIRE half
// (surface.check → composed shape count) + a FILE half (served ontology bytes == the served
// .sha256 sidecar == the expected root digest). Three digest planes, never interchanged:
// this checks the FILE plane; surface.actual is the bench-local COPY plane and is ignored.
//
//   NODE_EXTRA_CA_CERTS=... CK_DOOR=wss://<door>/wss CK_KERNEL=<rostered-kernel> \
//   [CK_ROOT_SHA=7de02b35…] [CK_SHAPES=<n>] [CK_ONTOLOGY=/ontology/v3.12/core.ttl] \
//   node tests/wire/door-confirm.mjs
//
// PORTABILITY (oci-germination's finding, 2026-08-27): the FILE DIGEST is the binding
// criterion — byte-exact and deployment-independent. The composed shape count is
// deployment-DEPENDENT (root + adoptions; a bundle sealing wave+lexicon at init reports 47,
// a virgin root 30) — so it is INFORMATIONAL unless explicitly pinned via CK_SHAPES.
//
// Fleet exit protocol (0 GREEN · 44 RED-measured · other BROKEN — same as pgCK v312-tdd and
// ocig local-tdd): 0 CONFIRMED · 44 NOT CONFIRMED (measured, the door runs a different law)
// · 1 could not measure (instrument/transport fault — say so, never guess).
// LESSON baked in (2026-08-26): hash NOTHING without checking res.ok — this script's
// ancestor hashed a 404 body and reported divergent bytes that never existed.
import CKClient from '../../ck-client.js';
import { createHash } from 'node:crypto';

const DOOR    = process.env.CK_DOOR     || 'wss://pgck.localhost/wss';
const KERNEL  = process.env.CK_KERNEL   || 'ck-lib-js';
const ROOT    = process.env.CK_ROOT_SHA || '7de02b35fd1fbc2ecfd32e6e53162704be2791a2d41280102849ddb605eb9297'; // v3.12 FINAL
const SHAPES  = process.env.CK_SHAPES ? Number(process.env.CK_SHAPES) : null;   // null = informational only
const TTLPATH = process.env.CK_ONTOLOGY || '/ontology/v3.12/core.ttl';
const ORIGIN  = 'https://' + new URL(DOOR).host;

const c = new CKClient({ kernel: KERNEL, gov: KERNEL, wssEndpoint: DOOR });
let wireShapes = null, state = null;
try {
  await c.connect();
  const r = await c.dispatch('surface.check', `ckp://Kernel#${KERNEL}`, {}, { timeout: 10000 });
  wireShapes = r?.composed_nodeshapes ?? null; state = r?.state ?? null;
  console.log(`WIRE  surface.check → ok:${r?.ok} state:${state} composed_nodeshapes:${wireShapes}`);
} catch (e) { console.log('WIRE  fault:', e.message, '(within ~10s of a restart this may be warm-up — retry once)'); }
await c.nc?.close?.().catch(() => {});

let fileDigest = null, sidecar = null;
const ttlRes = await fetch(ORIGIN + TTLPATH).catch(() => null);
if (ttlRes?.ok) {
  fileDigest = createHash('sha256').update(Buffer.from(await ttlRes.arrayBuffer())).digest('hex');
  console.log(`FILE  ${TTLPATH} → sha256 ${fileDigest.slice(0, 16)}…`);
} else console.log(`FILE  ${TTLPATH} → HTTP ${ttlRes?.status ?? 'unreachable'} — file half cannot run`);
for (const p of [`${TTLPATH}.wave-3.12.sha256`, `${TTLPATH}.sha256`]) {
  const res = await fetch(ORIGIN + p).catch(() => null);
  if (res?.ok) { sidecar = (await res.text()).trim().split(/\s+/)[0]; console.log(`FILE  sidecar ${p} → ${sidecar.slice(0, 16)}…`); break; }
}

const wireOk = SHAPES === null ? true : wireShapes === SHAPES;               // informational unless pinned
const fileOk = fileDigest === ROOT && (!sidecar || sidecar === ROOT);
const measured = fileDigest !== null;                                        // the digest is the binding half
const verdict = !measured ? 'COULD NOT MEASURE' : (wireOk && fileOk) ? 'CONFIRMED' : 'NOT CONFIRMED';
const shapeNote = SHAPES === null ? `wire shapes ${wireShapes ?? 'unmeasured'} (informational — deployment-dependent)` : `wire ${wireShapes}/${SHAPES} ${wireOk ? '✅' : '✗'}`;
console.log(`\nROOT ${ROOT.slice(0, 12)}…: ${verdict} — ${shapeNote} · file ${fileOk ? '✅' : '✗'}${sidecar ? ' (sidecar matched)' : ' (no sidecar served)'}`);
process.exit(verdict === 'CONFIRMED' ? 0 : verdict === 'NOT CONFIRMED' ? 44 : 1);
