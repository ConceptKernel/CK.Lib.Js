// Operate the kernel per SPEC.MCP-pgCK.v0.3.1 §3 (wire-only) and §5 (verb floor + reply reading).
import CKClient from '../../ck-client.js';
const DOOR=process.env.CK_DOOR, K=process.env.CK_KERNEL, GOV=process.env.CK_GOV||K, TOKEN=process.env.CK_TOKEN||null;
const c = new CKClient({ kernel:K, gov:GOV, wssEndpoint:DOOR, ...(TOKEN?{tokenProvider:async()=>TOKEN}:{}) });
await c.connect();
const run = async (verb, payload={}) => {
  try {
    const r = await c.dispatch(verb, `ckp://Kernel#${K}`, payload, { timeout: 8000 });
    if (r && r.ok === false) return { kind:'refusal', r };
    return { kind:'result', r };
  } catch (e) { return { kind:'fault', msg:e.message }; }
};
for (const [verb,p] of [['surface.check',{}], ['surface.refusals',{}], ['project.resolve',{segment:K}]]) {
  const o = await run(verb,p);
  if (o.kind==='fault')   { console.log(`\n${verb}\n  NO VERDICT — ${o.msg}\n  (query before retry; writes are never auto-retried)`); continue; }
  if (o.kind==='refusal') { console.log(`\n${verb}\n  REFUSED (verbatim)\n  error: ${o.r.error}\n  hint : ${o.r.hint ?? '(none)'}`); continue; }
  const j = JSON.stringify(o.r);
  console.log(`\n${verb}\n  ${j.length>420 ? j.slice(0,420)+'…' : j}`);
}
await c.nc?.close?.().catch(()=>{});
process.exit(0);
