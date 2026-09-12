// smoke-foundation.mjs — the two client additions SPEC.CK-FOUNDATION.v1.6.5 makes (O1 same(), O5 scoreKind).
// TDD: RED against v1.6.5 (neither exists). Fake dispatcher DECLARED; reply shapes are the ones measured
// 2026-09-05 on pgck.localhost @ extversion 0.4.112 (surface.grounding rows; score.tick with its law object).
// Run: node tests/smoke-foundation.mjs
import { ConceptKernel } from '../ck.js';
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✅', n); } else { fail++; console.log('  ❌', n); } };
const store = { ingest() {}, retire() {}, get: () => undefined };
const attempt = async (fn) => { try { return { v: await fn(), e: null }; } catch (e) { return { v: null, e }; } };
const mk = (replies) => new ConceptKernel('ckp://Kernel#t', { async dispatch(verb, _k, payload) { return replies(verb, payload); } }, store, [], {});
const G = { 'urn:ckp:module:wave': { structuralDigest: 's-wave', copyDigest: 'c-wave', asserted: 495, nodeshapes: 11 },
            'urn:ckp:module:wave2': { structuralDigest: 's-wave', copyDigest: 'c-other', asserted: 495, nodeshapes: 11 },
            'urn:ckp:module:lexicon': { structuralDigest: 's-lex', copyDigest: 'c-lex', asserted: 357, nodeshapes: 6 },
            // R-40: what a ≤0.4.112 door ACTUALLY returns for an absent IRI — a real row holding nothing,
            // minted by the read itself. sha256 of the empty string, measured on the wire 2026-09-12.
            'urn:ckp:module:mintedempty': { structuralDigest: 'e3b0c44298fc1c14', copyDigest: 'e3b0c44298fc1c14', asserted: 0, nodeshapes: 0 } };
const grounding = (verb, p) => verb === 'surface.grounding' ? { ok: true, graphs: G[p.iri] ? [{ iri: p.iri, ...G[p.iri] }] : [], verdictAsymmetry: 'unequal structural digests PROVE two graphs differ; equal ones are strong evidence of isomorphism and NOT proof (not RDFC-1.0). Never upgrade ISOMORPHIC_LIKELY to identical.' } : { ok: false, refused: true, sqlstate: '42704', error: 'unknown_affordance' };

console.log('O1 — surface.same(): a labelled two-plane verdict, never a boolean');
{
  const k = mk(grounding);
  const { v: d, e } = await attempt(() => k.surface.same('urn:ckp:module:wave', 'urn:ckp:module:lexicon'));
  ok('unequal structural digests ⇒ DIFFERENT, and DIFFERENT is PROOF', !e && d?.verdict === 'DIFFERENT' && d.proof === true);
  const { v: s } = await attempt(() => k.surface.same('urn:ckp:module:wave', 'urn:ckp:module:wave'));
  ok('a graph vs itself ⇒ ISOMORPHIC_LIKELY, proof:false, copyEqual:true — never "identical"', s?.verdict === 'ISOMORPHIC_LIKELY' && s.proof === false && s.copyEqual === true && !/IDENTICAL/.test(s.verdict));
  const { v: w } = await attempt(() => k.surface.same('urn:ckp:module:wave', 'urn:ckp:module:wave2'));
  ok('equal structural, unequal copy ⇒ still ISOMORPHIC_LIKELY with copyEqual:false (two planes, two answers)', w?.verdict === 'ISOMORPHIC_LIKELY' && w.structuralEqual === true && w.copyEqual === false);
  ok('the method is named beside every digest, and the door\'s asymmetry text rides verbatim', typeof s?.method?.structuralDigest === 'string' && /RDFC/.test(s?.verdictAsymmetry ?? ''));
  const { e: e2 } = await attempt(() => k.surface.same('urn:ckp:module:wave', 'urn:ckp:module:absent'));
  ok('NEGATIVE CONTROL — a graph the door answers no row for THROWS (nothing to compare), never a verdict', !!e2 && /no row/.test(e2.message));
  const { e: eR40 } = await attempt(() => k.surface.same('urn:ckp:module:wave', 'urn:ckp:module:mintedempty'));
  ok('R-40 — a zero-assertion row REFUSES a verdict by name, never a proof-shaped DIFFERENT (the door minted it on read)',
     !!eR40 && /R-40/.test(eR40.message) && /asserted:0/.test(eR40.message));
  const { e: e3 } = await attempt(() => k.surface.same('urn:ckp:module:wave'));
  ok('two IRIs are required and have no default', !!e3);
}

console.log('O5 / T1 — clock.tick(): scoreKind read structurally off the law, never computed');
{
  const LAW = { defaultsNote: 'values absent from the sealed Kernel are the NAMED substrate defaults, never invented per call', weightAssent: 1, weightDissent: -0.8, weightImplicit: 0.5, thresholdPromote: null, tauImplicitMillis: 60000 };
  const k = mk((verb) => verb === 'score.tick' ? { ok: true, epochUnchanged: true, law: LAW, scores: [{ about: 'urn:ckp:t/kernel', score: 0.1901 }], drafted: [] } : { ok: true });
  const { v: t, e } = await attempt(() => k.clock.tick());
  ok('a law with NO decay constant ⇒ scoreKind "undecayed-sum" and a note naming T1 + the R-20 containment', !e && t?.scoreKind === 'undecayed-sum' && /T1/.test(t.scoreNote) && /R-20/.test(t.scoreNote));
  ok('the score itself is untouched — rendered verbatim, no threshold, no cap', t?.scores?.[0]?.score === 0.1901 && t.law === LAW);
  const k2 = mk((verb) => verb === 'score.tick' ? { ok: true, epochUnchanged: true, law: { ...LAW, lambdaDecayPerSecond: 0.01 }, scores: [] } : { ok: true });
  const { v: t2 } = await attempt(() => k2.clock.tick());
  ok('NEGATIVE CONTROL — a law carrying a decay constant flips the kind to "decayed"', t2?.scoreKind === 'decayed');
  const k3 = mk((verb) => verb === 'score.tick' ? { ok: true, epochUnchanged: false, law: LAW, scores: [] } : { ok: true });
  const { e: e3 } = await attempt(() => k3.clock.tick());
  ok('R-20 still throws on epochUnchanged:false (a tick that moved the epoch is a door violation)', !!e3 && /R-20/.test(e3.message));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
