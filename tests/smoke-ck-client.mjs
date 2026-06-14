// _WIP/smoke-ck-client.mjs — gov-routing regression (G5a). Guards the CSVC-found timeout bug
// (SPIKE.ONTOLOGICAL-ASSEMBLY-DRIVER v0.7): governed verbs MUST route to the gov door (input.kernel.<gov>.
// action.<verb>) and the gov reply MUST be subscribed; only delegated agent.* ride the target kernel.
// Mirrors pgCK's s48. Run: node _WIP/smoke-ck-client.mjs    (gitignored)
import CKClient from '../ck-client.js';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✅', n); } else { fail++; console.log('  ❌', n); } };
// nats subscriptions are async-iterable AND have unsubscribe(); a no-op sub satisfies _sub's `for await`.
const noopSub = { [Symbol.asyncIterator]() { return { next: async () => ({ done: true, value: undefined }) }; }, unsubscribe() {} };

function mkClient(kernel, gov) {
  const c = new CKClient({ kernel, gov, subscribe: ['result'] });
  c._maybeRefreshToken = async () => {};                 // no Keycloak in the harness
  const subs = [];
  c.nc = {
    publish: (subject) => {                              // capture subject + resolve the pending dispatch
      c.__lastSubject = subject;
      const tid = [...c._pending.keys()].pop();
      if (tid) c._resolvePending(tid, { ok: true, verified: true, proof_digest: 'pf:x', id: 'x' });
    },
    subscribe: (topic) => { subs.push(topic); return noopSub; },
  };
  c.__subs = subs;
  return c;
}

console.log('ck-client.js — gov-routing regression (G5a; SPIKE v0.7; mirrors pgCK s48)');

// A NON-GOV kernel handle (the CSVC.ConsensusTopic case that timed out before the fix)
const k = mkClient('CSVC.ConsensusTopic', 'pgCK');
const r = await k.dispatch('instance.create', 'ckp://Kernel#CSVC.ConsensusTopic', { type: 'urn:ckp:csvc/type/ConsensusTopic' });
ok('governed create → gov door, not the target kernel', k.__lastSubject === 'input.kernel.pgCK.action.instance.create');
ok('governed create resolves (no timeout) → ok+verified', r.ok === true && r.verified === true);

await k.dispatch('instance.query', 'ckp://Kernel#CSVC.ConsensusTopic', {});
ok('governed query → gov door', k.__lastSubject === 'input.kernel.pgCK.action.instance.query');

await k.dispatch('agent.execute', 'ckp://Kernel#CSVC.ConsensusTopic', {});
ok('delegated agent.execute → TARGET kernel (the harness), not gov door', k.__lastSubject === 'input.kernel.CSVC.ConsensusTopic.action.agent.execute');

k._subscribeAll();
ok('non-gov handle subscribes the gov reply (result.kernel.pgCK.>)', k.__subs.includes('result.kernel.pgCK.>'));

// A GOV-kernel handle: governed verbs ride its own door (no cross-routing)
const g = mkClient('pgCK', 'pgCK');
await g.dispatch('instances.count', 'ckp://Kernel#pgCK', {});
ok('gov-kernel handle: governed verb on its own door', g.__lastSubject === 'input.kernel.pgCK.action.instances.count');

console.log(`\n${fail === 0 ? '✅ PASS' : '❌ FAIL'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
