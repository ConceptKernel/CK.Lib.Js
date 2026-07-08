// smoke-ergonomics.mjs — Layer-1a ergonomics (#10): kill the verbosity the v1.5.4 proof gate exposed.
//   • lossless transition()  → { ok, from, to, allowed }  (no dropping to raw do())
//   • typed Ref fields       → result.urn / result.local  (no bare() surgery, no id-guessing)
//   • single-actor govern    → k.setTransitionMap / k.govern = propose→vote→apply q1 (no piri 5-way guess)
// Non-breaking: existing writeResult fields ({ok,id,verified,proof_digest}) stay; these are additive.
import { CK } from '../ck.js';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✅', n); } else { fail++; console.log('  ❌', n); } };

// Mock pgCK: create returns a full @id; transition returns from/to (or allowed on illegal);
// governance simulates propose→vote→apply, deliberately returning the proposal id under ONE
// of the many field names to prove the client normalizes it.
function mockTransport() {
  const TASK = 'urn:ckp:demo/type/Task';
  return {
    async connect() {}, async close() {}, async affordances() { return []; }, subscribe() { return () => {}; },
    async dispatch(verb, kernelUrn, payload) {
      switch (verb) {
        case 'instance.create': {
          const id = 'task-1', at = payload.type + '#' + id;
          return { ok: true, id, verified: true, proof_digest: 'pf:' + id, result: { '@id': at, '@type': payload.type, ...payload } };
        }
        case 'instance.transition': {
          // Shapes grounded in the LIVE pgCK 0.4.21 seal-gate output: success = {ok,id,from,to,source,verified};
          // reject = {ok:false,error,from,to,source}. NB: the live reject did NOT carry `allowed` — so the client
          // treats `allowed` as OPTIONAL passthrough. This mock adds it to prove the client surfaces it WHEN sent.
          const ALLOWED = ['sealed', 'discarded'];
          if (!ALLOWED.includes(payload.to_state)) return { ok: false, error: 'invalid_transition', from: 'pending', to: payload.to_state, source: 'kernel', allowed: ALLOWED };
          return { ok: true, id: payload.id, from: 'pending', to: payload.to_state, source: 'kernel', verified: true };
        }
        case 'kernel.propose_change': return { ok: true, op: payload.op, proposal_iri: 'ckp://Proposal#p-42', verified: true }; // only proposal_iri set
        case 'kernel.vote': return { ok: true, about: payload.about, quorum_met: true };
        case 'kernel.apply': return { ok: true, about: payload.about, state: 'applied', epoch: 2 };
        default: return { ok: false, error: 'unknown_affordance' };
      }
    },
  };
}

const activate = () => CK.activate('pgCK', { transport: mockTransport(), hydrate: false });
const TASK = 'urn:ckp:demo/type/Task';

console.log('lossless transition — { ok, from, to, allowed }');
{
  const k = await activate();
  const good = await k.transition('task-1', 'sealed');
  ok('legal move: ok + from + to surfaced', good.ok === true && good.from === 'pending' && good.to === 'sealed');
  const bad = await k.transition('task-1', 'nope');
  ok('illegal move: ok:false + allowed set surfaced', bad.ok === false && Array.isArray(bad.allowed) && bad.allowed.includes('sealed'));
  ok('from surfaced on the rejection too', bad.from === 'pending');
  await k.close();
}

console.log('typed Ref fields — result.urn / result.local (no bare() surgery)');
{
  const k = await activate();
  const c = await k.create(TASK, { title: 'probe' });
  ok('id preserved (non-breaking)', c.id === 'task-1');
  ok('.urn is the full @id', c.urn === TASK + '#task-1');
  ok('.local is the bare local part', c.local === 'task-1');
  await k.close();
}

console.log('single-actor governance sugar — propose→vote→apply q1, no piri guessing');
{
  const k = await activate();
  const p = await k.propose('set_transition_map', { targetClass: TASK, map: { pending: ['sealed'] } }, 1);
  ok('propose() exposes a normalized .iri', p.iri === 'ckp://Proposal#p-42');
  const applied = await k.setTransitionMap(TASK, { pending: ['sealed', 'discarded'] });
  ok('setTransitionMap runs the full dance → applied', applied.ok === true && applied.state === 'applied' && applied.epoch === 2);
  ok('applied carries the resolved proposal id', applied.proposal === 'ckp://Proposal#p-42');
  await k.close();
}

console.log(`\nsmoke-ergonomics: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
