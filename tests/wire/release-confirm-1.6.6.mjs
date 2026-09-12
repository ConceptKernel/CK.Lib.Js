// tests/wire/release-confirm-1.6.6.mjs — v1.6.6 through the released surface, READ-ONLY.
//
// Confirms the two facade additions v1.6.6 ships (FOUNDATION O1 `surface.same`, O5 `scoreKind`)
// against a live door, plus the door-identity and refusal-registry rows the release cites.
// Every digest is READ OFF THE DOOR — none is typed here (R-36.6).
//
//   export NODE_EXTRA_CA_CERTS="$(mkcert -CAROOT)/rootCA.pem"
//   CK_DOOR=wss://<host>/wss CK_KERNEL=<seat> CK_TOKEN=<fresh bearer> node tests/wire/release-confirm-1.6.6.mjs
//
// READ-ONLY: no seal, no govern, no CK_BEAT. Safe on production.
// Exit: 0 GREEN · 44 RED-measured · anything else BROKEN.
import { CK, VERSION } from '../../ck.js';

const DOOR   = process.env.CK_DOOR   || 'wss://pgck.localhost/wss';
const KERNEL = process.env.CK_KERNEL || 'ck-lib-js';
const TOKEN  = process.env.CK_TOKEN  || null;
const CORE   = 'urn:ckp:core';
const WAVE   = 'urn:ckp:module:wave';
const LEX    = 'urn:ckp:module:lexicon';

let pass = 0, fail = 0, skip = 0;
const ok = (id, name, c, detail = '') => { (c ? pass++ : fail++); console.log(`  ${c ? '✅' : '❌'} ${id} ${name}${detail ? ' — ' + detail : ''}`); };
const skipped = (id, name, why) => { skip++; console.log(`  ⏭  ${id} ${name} — ${why}`); };
const short = (d) => (d ? String(d).slice(0, 12) + '…' : String(d));
const attempt = async (fn) => { try { return { v: await fn(), e: null }; } catch (e) { return { v: null, e }; } };

console.log(`release-confirm 1.6.6 — ${DOOR} · seat ${KERNEL} · lib ${VERSION}\n`);

let k;
try {
  k = await CK.activate(KERNEL, { wssEndpoint: DOOR, ...(TOKEN ? { tokenProvider: async () => TOKEN } : {}) });
} catch (e) { console.log(`BROKEN — activation failed: ${e.message}`); process.exit(1); }

console.log('V1 — the library under test is the one the door served');
ok('V1', 'VERSION is 1.6.6', VERSION === '1.6.6', VERSION);

console.log('R-31 / PASS-16 §0 — doorIdentity: extversion is the law surface');
{
  const { v: d, e } = await attempt(() => k.doorIdentity());
  ok('V2', 'doorIdentity answers and lawSurface === extversion', !e && d?.lawSurface === d?.extversion && d?.extversion != null,
     e ? e.message.slice(0, 80) : `extversion ${d.extversion} · version() ${d.version} · ${d.state}`);
  ok('V3', 'diverged carries a note naming the cure; agree carries none (never softened)',
     !e && (d.state === 'diverged' ? /never gate on version/.test(d.note ?? '') : d.note === null), `state ${d?.state}`);
}

console.log('O1 — surface.same(): a labelled two-plane verdict, read off the door');
{
  const { v: self, e: e1 } = await attempt(() => k.surface.same(CORE, CORE));
  ok('V4', 'a graph vs itself ⇒ ISOMORPHIC_LIKELY and proof:false — never "identical"',
     !e1 && self?.verdict === 'ISOMORPHIC_LIKELY' && self.proof === false && !/IDENTICAL/i.test(self.verdict),
     e1 ? e1.message.slice(0, 90) : `structural ${short(self.a.structuralDigest)}`);
  ok('V5', 'the method is named beside every digest (a digest without its method is not a pin)',
     !e1 && typeof self?.method?.structuralDigest === 'string' && typeof self?.method?.copyDigest === 'string');

  const g = await attempt(() => k.surface.grounding({ iri: WAVE }));
  const haveModules = !g.e && Array.isArray(g.v?.graphs) && g.v.graphs.some((x) => x?.iri === WAVE);
  if (!haveModules) skipped('V6', 'two distinct graphs ⇒ DIFFERENT is PROOF', `${WAVE} answers no row on this door`);
  else {
    const { v: d, e } = await attempt(() => k.surface.same(WAVE, LEX));
    ok('V6', 'two distinct module graphs ⇒ DIFFERENT, and DIFFERENT is PROOF',
       !e && d?.verdict === 'DIFFERENT' && d.proof === true,
       e ? e.message.slice(0, 90) : `${short(d.a.structuralDigest)} vs ${short(d.b.structuralDigest)}`);
  }

  // Two honest outcomes, and the door decides which: a door that reports absence AS absence answers
  // no row ("nothing to compare"); a door at ≤0.4.112 MINTS the graph on this very read and answers a
  // zero-assertion row, which the client refuses by name (R-40). A VERDICT is the one wrong answer.
  const { e: e3 } = await attempt(() => k.surface.same(CORE, `urn:ckp:module:doesnotexist-${Date.now()}`));
  ok('V7', 'NEGATIVE CONTROL — an absent graph never yields a verdict (no row, or R-40 refusal)',
     !!e3 && /no row|R-40/.test(e3.message),
     !e3 ? 'RETURNED A VERDICT — proof-shaped claim about a graph that did not exist'
         : (/R-40/.test(e3.message) ? 'R-40 refusal — THIS DOOR MINTED THE GRAPH ON READ' : 'no row — door reports absence as absence'));
}

console.log('R-30 — the refusal registry: digest is the cache key, count is informational');
{
  const { v: r, e } = await attempt(() => k.surface.refusals());
  ok('V8', 'registryDigest present and is the only honest cache key', !e && /^[0-9a-f]{16,}/.test(r?.registryDigest ?? ''),
     e ? e.message.slice(0, 80) : `${short(r.registryDigest)} · ${r.count ?? r.codes?.length ?? '?'} codes`);
}

console.log('R-20 / O5 — the clock refuses honestly when no orbit is declared');
{
  const n = await k.clock.next().catch((x) => x);
  if (n?.refused) ok('V9', 'no orbit ⇒ no_orbit_declared 42704 — a real answer, never a zero shaped like a time', n.sqlstate === '42704', n.sqlstate);
  else ok('V9', 'an orbit IS declared ⇒ clock.next carries a re-derivable method string', typeof n?.method === 'string' && !!n?.nextCrossing, `period ${n?.periodSeconds}s`);
}

await k.close?.().catch(() => {});
console.log(`\n${pass} passed, ${fail} failed, ${skip} skipped`);
process.exit(fail ? 44 : 0);
