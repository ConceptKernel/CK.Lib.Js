// WIRE ONLY. Same door, same token. The only variable is `gov`.
import CKClient from '../../ck-client.js';
const DOOR = process.env.CK_DOOR, K = process.env.CK_KERNEL, TOKEN = process.env.CK_TOKEN || null;
const GOV = process.env.CK_GOV || undefined;   // undefined => ck-client.js:185 default 'pgCK'
const c = new CKClient({ kernel: K, ...(GOV ? { gov: GOV } : {}), wssEndpoint: DOOR,
                         ...(TOKEN ? { tokenProvider: async () => TOKEN } : {}) });
try {
  await c.connect();
  const g = await c.dispatch('surface.grounding', `ckp://Kernel#${K}`, { iri: 'urn:ckp:core' }, { timeout: 8000 });
  const core = (g?.graphs || []).find(x => x.iri === 'urn:ckp:core') || g?.graphs?.[0];
  console.log(`  gov=${GOV ?? "(default 'pgCK')"}  ->  REPLY OK  structuralDigest ${String(core?.structuralDigest).slice(0,16)}…  nodeshapes ${core?.nodeshapes}`);
} catch (e) {
  console.log(`  gov=${GOV ?? "(default 'pgCK')"}  ->  NO REPLY: ${e.message}`);
}
await c.nc?.close?.().catch(() => {});
process.exit(0);
