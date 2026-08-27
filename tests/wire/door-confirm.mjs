// tests/wire/door-confirm.mjs — the ROOT gate: confirm what LAW a door actually runs.
// Non-destructive. Corrected 2026-08-27 after pgCK named the red herring: fetching the served
// ontology file proves what a deployment SHIPS, never what it ENFORCES — boot() reads a path
// once; re-grounding never touches the served file. "Proximity is not adoption", applied to
// confirmation. The BINDING criterion is therefore the STRUCTURAL DIGEST of the loaded law,
// read through the door itself: surface.grounding {iri:'urn:ckp:core'} → structuralDigest —
// reload-surviving, blank-node-immune, fleet-portable (re-measured here: 6e38f7bb… on 0.4.87,
// byte-identical to pgCK's s65 pin). The FILE half stays as a PACKAGING check (what ships
// beside the door — ocig's plane), informational for law-confirmation purposes. The copy
// digest is bench-local and ignored, as ever. Three planes, never interchanged.
//
//   NODE_EXTRA_CA_CERTS=... CK_DOOR=wss://<door>/wss CK_KERNEL=<rostered-kernel> \
//   [CK_STRUCT_SHA=6e38f7bb…] [CK_ROOT_SHA=7de02b35…] [CK_SHAPES=<n>] \
//   [CK_ONTOLOGY=/ontology/v3.12/core.ttl] node tests/wire/door-confirm.mjs
//
// Fleet exit protocol: 0 LAW CONFIRMED · 44 LAW NOT CONFIRMED (measured — the door enforces
// a different root) · 1 could not measure (instrument/transport fault — never a verdict).
// Shape count: informational unless pinned (deployment-dependent — root + adoptions).
// LESSON kept: hash NOTHING without checking res.ok (the 404-body incident).
import CKClient from '../../ck-client.js';
import { createHash } from 'node:crypto';

const DOOR    = process.env.CK_DOOR       || 'wss://pgck.localhost/wss';
const KERNEL  = process.env.CK_KERNEL     || 'ck-lib-js';
const STRUCT  = process.env.CK_STRUCT_SHA || '6e38f7bb631875b4fcacb086219d862bbe08cfc7209ee9c96967222e9c0225a7'; // v3.12 FINAL core, loaded-law plane
const ROOT    = process.env.CK_ROOT_SHA   || '7de02b35fd1fbc2ecfd32e6e53162704be2791a2d41280102849ddb605eb9297'; // file plane (packaging)
const SHAPES  = process.env.CK_SHAPES ? Number(process.env.CK_SHAPES) : null;
const TTLPATH = process.env.CK_ONTOLOGY   || null;   // OPT-IN ONLY (2026-08-27, operator ruling):
// the /ontology HTTP mapping is NOT a dependency of this kit or the client. Law confirmation
// is fully wire-native; packaging verification belongs in the consumer's build gate, offline,
// against the attested artifact. Set CK_ONTOLOGY only if you deliberately want the extra
// served-bytes report from a door that happens to serve its tree.
const ORIGIN  = 'https://' + new URL(DOOR).host;

// ── LAW half (BINDING): the structural digest of what the door actually enforces ─────────────
const c = new CKClient({ kernel: KERNEL, gov: KERNEL, wssEndpoint: DOOR });
let structural = null, wireShapes = null;
try {
  await c.connect();
  const g = await c.dispatch('surface.grounding', `ckp://Kernel#${KERNEL}`, { iri: 'urn:ckp:core' }, { timeout: 10000 });
  const core = (g?.graphs || []).find((x) => x.iri === 'urn:ckp:core') || g?.graphs?.[0];
  structural = core?.structuralDigest ?? null; wireShapes = core?.nodeshapes ?? null;
  console.log(`LAW   surface.grounding urn:ckp:core → structuralDigest ${String(structural).slice(0, 16)}… · nodeshapes ${wireShapes}`);
} catch (e) { console.log('LAW   fault:', e.message, '(within ~10s of a restart this may be warm-up — retry once)'); }
await c.nc?.close?.().catch(() => {});

// ── PACKAGING half — OPT-IN via CK_ONTOLOGY (informational; never a law verdict) ─────────────
let fileDigest = null, sidecar = null, pkgRan = false;
if (TTLPATH) {
  pkgRan = true;
  const ttlRes = await fetch(ORIGIN + TTLPATH).catch(() => null);
  if (ttlRes?.ok) {
    fileDigest = createHash('sha256').update(Buffer.from(await ttlRes.arrayBuffer())).digest('hex');
    console.log(`PKG   ${TTLPATH} → sha256 ${fileDigest.slice(0, 16)}…`);
  } else console.log(`PKG   ${TTLPATH} → HTTP ${ttlRes?.status ?? 'unreachable'} — not served (does not block law confirmation)`);
  for (const p of [`${TTLPATH}.wave-3.12.sha256`, `${TTLPATH}.sha256`]) {
    const res = await fetch(ORIGIN + p).catch(() => null);
    if (res?.ok) { sidecar = (await res.text()).trim().split(/\s+/)[0]; console.log(`PKG   sidecar ${p} → ${sidecar.slice(0, 16)}…`); break; }
  }
}

const lawOk = structural === STRUCT;
const shapesOk = SHAPES === null ? true : wireShapes === SHAPES;
const pkgState = !pkgRan ? 'skipped (wire-only mode — the default)' : fileDigest === null ? 'not served' : (fileDigest === ROOT && (!sidecar || sidecar === ROOT)) ? 'matches' : 'DIVERGES';
const measured = structural !== null;
const verdict = !measured ? 'COULD NOT MEASURE' : (lawOk && shapesOk) ? 'LAW CONFIRMED' : 'LAW NOT CONFIRMED';
console.log(`\n${verdict} — structural ${lawOk ? '✅' : `✗ (${String(structural).slice(0, 12)}… ≠ ${STRUCT.slice(0, 12)}…)`}` +
  ` · shapes ${SHAPES === null ? `${wireShapes ?? '?'} (informational)` : `${wireShapes}/${SHAPES} ${shapesOk ? '✅' : '✗'}`}` +
  ` · packaging ${pkgState} (informational: what ships ≠ what judges)`);
process.exit(verdict === 'LAW CONFIRMED' ? 0 : verdict === 'LAW NOT CONFIRMED' ? 44 : 1);
