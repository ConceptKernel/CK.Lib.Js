// WIRE ONLY. Re-measures every claim of pgCK's to-CKLIBJS-PASS-14 through OUR OWN client.
// Not a gate: no exit protocol, no controlled failure. Reproduction only.
//   CK_DOOR=… CK_KERNEL=… CK_TOKEN=… node tests/wire/_pass14-probe.mjs
import { CK } from '../../ck.js';
const DOOR = process.env.CK_DOOR, KERNEL = process.env.CK_KERNEL, TOKEN = process.env.CK_TOKEN || null;
const cut = (x, n = 1100) => { const s = JSON.stringify(x); return s.length > n ? s.slice(0, n) + '…' : s; };

const k = await CK.activate(KERNEL, { wssEndpoint: DOOR, ...(TOKEN ? { tokenProvider: async () => TOKEN } : {}) });
console.log(`== seat ${k.name} @ ${DOOR} ==`);

const probe = async (label, fn) => {
  try { const r = await fn(); console.log(`\n--- ${label}\n    OK      ${cut(r)}`); return r; }
  catch (e) { console.log(`\n--- ${label}\n    THROWN  ${e.message.slice(0, 240)}\n    refused=${e.refused} sqlstate=${e.sqlstate}\n    reply   ${cut(e.reply, 700)}`); return null; }
};

console.log('\n### C-3 · affordances vs unsealed (an empty affordances[] is NOT "no capabilities")');
console.log(`    handle.affordances().length = ${k.affordances().length}`);
await probe('affordances (raw reply — read the sibling `unsealed`)', () => k.do('affordances', {}));

console.log('\n### §2 · adoption.check — the verify-then-load verb');
await probe('adoption.check', () => k.do('adoption.check', {}));

console.log('\n### §5 · the `shaped` collision, and what unshaped counts');
await probe('surface.typecheck core#Kernel  (gate view — composed surface)', () => k.do('surface.typecheck', { type: 'https://conceptkernel.org/ontology/core#Kernel' }));
await probe('instance.query   core#Kernel  (filter-key view — kernel graph only)', () => k.do('instance.query', { type: 'https://conceptkernel.org/ontology/core#Kernel' }));
await probe('surface.unshaped', () => k.do('surface.unshaped', {}));

console.log('\n### §6 · small wire facts');
await probe('signal.boundary with the WRONG keys (payload contract is {about,dwellMillis,events})', () => k.do('signal.boundary', { concept: 'x', boundary: 'y', dwellMillis: 10 }));
await probe('instance.get ckp://Kernel#pgck  (refusal names the accepted forms)', () => k.do('instance.get', { id: 'ckp://Kernel#pgck' }));
await probe('surface.check  (engineIdentity · roster populations · storage)', () => k.do('surface.check', {}));

console.log('\n### §3 · verbs the facade does not cover — do they route?');
for (const v of ['adoption.check', 'project.resolve', 'authority.mine', 'fleet.adoptions', 'integrity.check', 'instance.explain', 'surface.explain', 'kernels.list']) {
  await probe(v, () => k.do(v, {}));
}
await k.close?.();
process.exit(0);
