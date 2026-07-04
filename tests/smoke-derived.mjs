// smoke-derived.mjs — honest recompute_in_progress propagation + safe re-dispatch (v1.5.4).
// Local verification of the L2 facade over a MOCK transport simulating pgCK's DECLARED
// derived-value wire contract (styk-tv/pgCK#4, shipped v0.4.16/v0.4.17):
//   fresh          → { ok: true, value } (or { ok: true, net, volume })
//   over budget    → { ok: true, recompute_in_progress: true }   — the honest degrade
//   re-dispatch    → JOINS the in-flight build (idempotent), value returns when materialized.
// The client decides WHEN to ask again, never WHAT the value is. Run: node tests/smoke-derived.mjs
import { CK, isRecomputing } from '../ck.js';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✅', n); } else { fail++; console.log('  ❌', n); } };

// Mock transport: a derived read that reports recompute_in_progress `pending` times, then the value.
// Verb name is opaque to the client (verb-generic surface) — any governed read behaves this way.
function derivedTransport({ pending = 0, value = 2.2 } = {}) {
  const calls = [];
  return {
    calls,
    async connect() {},
    async close() {},
    async affordances() { return []; },
    subscribe() { return () => {}; },
    async dispatch(verb, kernelUrn, payload) {
      calls.push({ verb, payload });
      if (verb !== 'derived.read') return { ok: false, error: 'unknown_affordance' };
      if (calls.filter((c) => c.verb === 'derived.read').length <= pending) {
        return { ok: true, recompute_in_progress: true };
      }
      return { ok: true, value };
    },
  };
}

const activate = (transport) => CK.activate('Demo', { transport, hydrate: false });

console.log('recognizer — isRecomputing');
{
  ok('honest degrade recognized', isRecomputing({ ok: true, recompute_in_progress: true }) === true);
  ok('a value reply is not recomputing', isRecomputing({ ok: true, value: 2.2 }) === false);
  ok('an error reply is not recomputing', isRecomputing({ ok: false, error: 'denied' }) === false);
  ok('null/undefined are not recomputing', isRecomputing(null) === false && isRecomputing(undefined) === false);
}

console.log('doFresh — value already fresh (single dispatch, no retry)');
{
  const t = derivedTransport({ pending: 0, value: 2.2 });
  const k = await activate(t);
  const r = await k.doFresh('derived.read', { concept: 'urn:t:t1' });
  ok('returns the server value verbatim', r?.ok === true && r?.value === 2.2);
  ok('dispatched exactly once', t.calls.length === 1);
  await k.close();
}

console.log('doFresh — recomputing then fresh (re-dispatch until the value returns)');
{
  const t = derivedTransport({ pending: 2, value: 2.2 });
  const k = await activate(t);
  const seen = [];
  const r = await k.doFresh('derived.read', { concept: 'urn:t:t1' }, {
    delayMs: 1, onRecomputing: (attempt, reply) => seen.push({ attempt, reply }),
  });
  ok('final reply is the server value', r?.ok === true && r?.value === 2.2);
  ok('re-dispatched until fresh (3 dispatches for pending=2)', t.calls.length === 3);
  ok('each honest degrade surfaced via onRecomputing', seen.length === 2 && seen.every((s) => isRecomputing(s.reply)));
  ok('recomputing replies never fabricate a cache entry', k.urn('urn:t:t1') == null);
  await k.close();
}

console.log('doFresh — budget exhausted: the honest state IS the answer (never fabricated)');
{
  const t = derivedTransport({ pending: 99 });
  const k = await activate(t);
  const r = await k.doFresh('derived.read', { concept: 'urn:t:t1' }, { attempts: 3, delayMs: 1 });
  ok('returns the last honest recompute_in_progress reply', isRecomputing(r));
  ok('no value key invented on exhaustion', !('value' in (r || {})));
  ok('stopped at the attempt budget (3 dispatches)', t.calls.length === 3);
  await k.close();
}

console.log(`\nsmoke-derived: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
