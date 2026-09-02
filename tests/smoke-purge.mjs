// smoke-purge.mjs — R0 (charter §1–§4) + R3 deletions + A-11 correlation.
// RED against v1.5.15. Spec: SPEC.CK-LIB-JS.v1.6.1-2 §6 R0/R3; door C1/C3/C5/C7.
import { readFileSync } from 'node:fs';
const client = readFileSync(new URL('../ck-client.js', import.meta.url), 'utf8');
const facade = readFileSync(new URL('../ck.js', import.meta.url), 'utf8');
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
import CKClient from '../ck-client.js';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✅', n); } else { fail++; console.log('  ❌', n); } };

console.log('R0.1 — pre-v3.11 short-form subjects are gone');
{
  const c = new CKClient({ kernel: 'ck-lib-js', wssEndpoint: 'wss://x/wss' });
  ok('no short result topic', !c.topics || c.topics.result === undefined || String(c.topics.result).startsWith('result.kernel.'));
  ok('no short event topic',  !c.topics || c.topics.event === undefined  || String(c.topics.event).startsWith('event.kernel.'));
}
console.log('R0.2 — the hardcoded foreign-kernel subscription is gone');
ok('no Dictionary subject in the client', !client.includes('event.kernel.Dictionary'));
console.log('R0.3 — the REST data path is gone (door C7)');
ok('no saveState/loadState/stateEndpoint', !/saveState|loadState|stateEndpoint/.test(client));
console.log('R0.4 — dispatchMode is gone entirely; unknown options throw');
ok('no dispatchMode in the client', !/dispatchMode/.test(client));
{
  let threw = null;
  try { new CKClient({ kernel: 'k', wssEndpoint: 'wss://x/wss', dispatchMode: 'v3.8' }); } catch (e) { threw = e; }
  ok('unknown option throws, naming it', !!threw && /dispatchMode/.test(String(threw?.message)));
}
console.log('R0.5 — no wire-meaning defaults');
{
  let threw = null;
  try { new CKClient({ wssEndpoint: 'wss://x/wss' }); } catch (e) { threw = e; }
  ok('absent kernel throws locally, named', !!threw && /kernel/i.test(String(threw?.message)));
  ok("no defaulted clientId 'ck-browser'", !client.includes("'ck-browser'"));
}
console.log('R0.8 — claimSub is deleted');
ok('no claimSub anywhere in the client', !/claimSub/.test(client));
console.log('R0.10 — export map collapsed');
ok("only ./internal/* aliases remain", pkg.exports['./client'] === undefined);
console.log('R3 — dead facade surface deleted');
ok('no instances.list fallback', !facade.includes('instances.list'));
ok('no kernels.list adapter', !facade.includes('kernels.list'));
ok("no unknown_verb widening", !facade.includes('unknown_verb'));
ok('no list() duplicate',  !/\n\s*async list\(/.test(facade));
ok('no notify()',          !/\n\s*async notify\(/.test(facade));
ok('no ckOn/wireCkOn',     !/ckOn|wireCkOn/.test(facade));
console.log('R3.7 (A-11) — correlation: 128-bit id, verb+subject verified on resolve');
{
  const c = new CKClient({ kernel: 'k', wssEndpoint: 'wss://x/wss' });
  const id = c._traceId();
  ok('traceId is >=128-bit (uuid form)', /^[0-9a-f-]{36}$/.test(id.replace(/^tx-/, '')) || id.length >= 32);
  // forced cross-resolve: pending entry for verb A must NOT resolve from a frame naming verb B
  let resolved = false, rejected = false;
  c._pending.set('t1', { resolve: () => { resolved = true; }, reject: () => { rejected = true; },
                         timer: setTimeout(() => {}, 5000), subject: 'result.kernel.k.a', verb: 'a' });
  c._resolvePending('t1', { ok: true }, { verb: 'b', subject: 'result.kernel.k.b' });
  ok('mismatched verb does NOT resolve the pending dispatch', !resolved);
  // …and a MATCHING multi-segment verb DOES (regression: the envelope's display verb is the
  // last segment only; correlation must parse the full suffix or every surface.* read times out).
  let ok2 = false;
  c._pending.set('t2', { resolve: () => { ok2 = true; }, reject: () => {}, timer: setTimeout(() => {}, 5000),
                         subject: 'input.kernel.k.id.s.action.surface.grounding', verb: 'surface.grounding' });
  c._resolvePending('t2', { ok: true }, { verb: 'surface.grounding', subject: 'result.kernel.k.surface.grounding' });
  ok('matching multi-segment verb resolves', ok2 === true);
  for (const p2 of c._pending.values()) clearTimeout(p2.timer);
  c._pending.clear();
}
// ── v1.6.3 R10.1 + R16.3: counts and retired caveats leave the shipped strings ──────────────
console.log('v1.6.3 R10.1 — no refusal-set count baked into source (cache on registryDigest)');
// The gate flattens comment line-continuations first — the first cut of this gate missed
// '52\n// codes' and PASSED against the defect it claims to catch (build rule 6, caught here).
const facadeFlat = facade.replace(/\n\/\/ ?/g, ' ');
ok('no hard-coded registry count in ck.js', !/\b\d+\s+codes\b/.test(facadeFlat));
console.log('v1.6.3 R16.3 — the phantom-epoch caveat swept from shipped strings');
ok("no '+2 measured' / '+1 real' wording in shipped files", !facade.includes('+2 measured') && !client.includes('+2 measured') && !facade.includes('+1 real') && !client.includes('+1 real'));

console.log(`\nsmoke-purge: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
