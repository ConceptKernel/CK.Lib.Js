// smoke-gov.mjs — R1 (v1.5.16): routing identity derives from the kernel, never a literal.
// RED against v1.5.15 (gov defaults to 'pgCK', a kernel id the substrate refuses by name;
// slugKernel lowercases only dotted names). Spec: SPEC.CK-LIB-JS.v1.6.1-2 §6 R1; door C2.
import CKClient from '../ck-client.js';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✅', n); } else { fail++; console.log('  ❌', n); } };

console.log('R1.1 — gov derives from the activated kernel (no literal fallback)');
{
  const c = new CKClient({ kernel: 'ck-lib-js', wssEndpoint: 'wss://x/wss' });
  ok('gov == kernel when not passed', c._gov === 'ck-lib-js');
  const d = new CKClient({ kernel: 'demo', wssEndpoint: 'wss://x/wss', gov: 'pgck' });
  ok('explicit gov wins', d._gov === 'pgck');
}
console.log('R1.2 — slugKernel lowercases unconditionally');
{
  const c = new CKClient({ kernel: 'pgCK', wssEndpoint: 'wss://x/wss' });
  ok("kernel 'pgCK' → wire form 'pgck'", c._wireKernel === 'pgck');
  ok("gov derived from 'pgCK' is canonical", c._gov === 'pgck' || c._gov === 'pgCK' ? c._gov === 'pgck' : false);
  const d = new CKClient({ kernel: 'CK.Lib.Js', wssEndpoint: 'wss://x/wss' });
  ok('dotted names still slug', d._wireKernel === 'ck-lib-js');
}
console.log('R1.1b — the literal is gone from the file');
{
  const src = (await import('node:fs')).readFileSync(new URL('../ck-client.js', import.meta.url), 'utf8');
  ok("no 'pgCK' literal anywhere in ck-client.js", !src.includes("'pgCK'") && !src.includes('"pgCK"'));
}
console.log(`\nsmoke-gov: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
