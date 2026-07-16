// smoke-ck-client.mjs — gov-routing regression (G5a). Guards a timeout seen when a NON-GOV kernel
// handle dispatches governed verbs: governed verbs MUST route to the gov door
// (input.kernel.<gov>.action.<verb>) and the gov reply MUST be subscribed; only delegated agent.*
// ride the target kernel. Run: node tests/smoke-ck-client.mjs
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

console.log('ck-client.js — gov-routing regression (G5a)');

// A NON-GOV kernel handle (the case that timed out before the fix)
const k = mkClient('Demo.Board', 'pgCK');
const r = await k.dispatch('instance.create', 'ckp://Kernel#Demo.Board', { type: 'urn:ckp:demo/type/Board' });
ok('governed create → gov door, not the target kernel', k.__lastSubject === 'input.kernel.pgCK.action.instance.create');
ok('governed create resolves (no timeout) → ok+verified', r.ok === true && r.verified === true);

await k.dispatch('instance.query', 'ckp://Kernel#Demo.Board', {});
ok('governed query → gov door', k.__lastSubject === 'input.kernel.pgCK.action.instance.query');

await k.dispatch('agent.execute', 'ckp://Kernel#Demo.Board', {});
ok('delegated agent.execute → TARGET kernel (the harness), not gov door', k.__lastSubject === 'input.kernel.Demo.Board.action.agent.execute');

k._subscribeAll();
ok('non-gov handle subscribes the gov reply (result.kernel.pgCK.>)', k.__subs.includes('result.kernel.pgCK.>'));

// A GOV-kernel handle: governed verbs ride its own door (no cross-routing)
const g = mkClient('pgCK', 'pgCK');
await g.dispatch('instances.count', 'ckp://Kernel#pgCK', {});
ok('gov-kernel handle: governed verb on its own door', g.__lastSubject === 'input.kernel.pgCK.action.instances.count');

// ── msg.by / msg.seq surface (v1.5.5 — pgCK F4 server-attributed sender) ──────
console.log('ck-client.js — msg.by / msg.seq (server-attributed sender, read-only)');
const enc = new TextEncoder();
const oneMsgSub = (msg) => ({
  [Symbol.asyncIterator]() { let d = false; return { next: async () => (d ? { done: true, value: undefined } : ((d = true), { done: false, value: msg })) }; },
  unsubscribe() {},
});
const deliver = async (headers) => {
  const c = new CKClient({ kernel: 'pgCK', subscribe: ['event'] });
  c._maybeRefreshToken = async () => {};
  const msg = { subject: 'event.kernel.pgCK.Task.sealed', headers, data: enc.encode(JSON.stringify({ '@id': 'urn:ckp:demo/task/1', '@type': 'Task' })) };
  c.nc = { publish() {}, subscribe: (topic) => (topic === 'event.kernel.pgCK.>' ? oneMsgSub(msg) : noopSub) };
  let got = null; c.on('event', (m) => { got = m; });
  c._subscribeAll();
  await new Promise((r) => setTimeout(r, 15));
  return got;
};

const withBy = await deliver([['by', ['urn:ckp:participant:alice']], ['Ck-Seq', ['7']], ['Content-Type', ['application/json']]]);
ok('msg.by = the server-attributed sender header', withBy && withBy.by === 'urn:ckp:participant:alice');
ok('msg.seq = the Ck-Seq header', withBy && withBy.seq === '7');
const noBy = await deliver([['Ck-Seq', ['8']], ['Content-Type', ['application/json']]]);
ok('absent by → null (never fabricated)', noBy && noBy.by === null);
ok('existing envelope fields still present (non-breaking)', !!(withBy && withBy.subject && withBy.data && 'traceId' in withBy));

console.log(`\n${fail === 0 ? '✅ PASS' : '❌ FAIL'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
