// smoke-honesty.mjs — the v1.5.13 honesty gate (T-D1…T-D4). TDD: this file was written FIRST
// and ran RED against v1.5.12 (D1: verify() manufactured `verified` from proof_digest; D2: the
// error branch dropped `refused`/`sqlstate`; D3: refresh retried a dead endpoint unbounded;
// D4: an identity downgrade emitted as a routine status). Spec: SPEC.CK-LIB-JS.v1.5.13.md §1.
// Run: node tests/smoke-honesty.mjs
import { ConceptKernel } from '../ck.js';
import CKClient from '../ck-client.js';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✅', n); } else { fail++; console.log('  ❌', n); } };
const store = { ingest() {}, retire() {} };
const mkKernel = (replies) => new ConceptKernel('ckp://Kernel#t', {
  async dispatch(verb, _kernel, payload) { return replies(verb, payload); },
}, store, [], {});

// ── T-D1: verify() renders the verdict verbatim — absent means null, never manufactured ──────
console.log('T-D1 — verify() does not manufacture a verdict');
{
  const k = mkKernel(() => ({ ok: true, proof_digest: 'pf:x', seq: 7 }));           // no `verified`
  const v = await k.verify('x');
  ok('absent verified → null (was: manufactured true from proof_digest)', v.verified === null);
  ok('proof_digest still surfaced', v.proof_digest === 'pf:x' && v.seq === 7);
}
{
  const k = mkKernel(() => ({ ok: true, verified: true, proof_digest: 'pf:x' }));
  ok('negative control: verified:true passes through', (await k.verify('x')).verified === true);
  const kf = mkKernel(() => ({ ok: true, verified: false, proof_digest: 'pf:x' }));
  ok('negative control: verified:false passes through', (await kf.verify('x')).verified === false);
}

// ── T-D2: the refusal class survives the write envelope ──────────────────────────────────────
console.log('T-D2 — error results carry refused + sqlstate verbatim');
{
  const k = mkKernel(() => ({ ok: false, refused: true, sqlstate: '22023', error: 'MinCount not satisfied: section', violations: [{ path: 'section' }] }));
  const w = await k.update('id1', { text: 'x' });
  ok('refusal: refused surfaced', w.ok === false && w.refused === true);
  ok('refusal: sqlstate surfaced', w.sqlstate === '22023');
  ok('refusal: clause text verbatim', w.error === 'MinCount not satisfied: section');
  ok('regression: violations preserved', Array.isArray(w.violations) && w.violations[0].path === 'section');
}
{
  const k = mkKernel(() => ({ ok: false, error: 'timeout' }));                       // a FAULT
  const w = await k.update('id1', {});
  ok('fault: refused is null (unknown), never false-by-default', w.refused === null);
  ok('fault: sqlstate is null', w.sqlstate === null);
}

// ── T-D3: refresh backoff + terminal state ───────────────────────────────────────────────────
console.log('T-D3 — the refresh loop backs off and gives up loudly');
const fakeJwt = () => 'h.' + Buffer.from(JSON.stringify({ sub: 'u', exp: 9999999999 })).toString('base64url') + '.s';
function mkAuthedClient() {
  const c = new CKClient({ kernel: 't' });
  c.auth = { anonymous: false, userId: 'u', token: fakeJwt(), refreshToken: 'r', expiresAt: new Date(Date.now() + 1000), claims: { exp: 1 } };
  return c;
}
{
  const c = mkAuthedClient();
  let fetches = 0;
  globalThis.fetch = async () => { fetches++; throw new Error('CONNECTION_CLOSED'); };
  const statuses = [];
  c.on('status', (s) => statuses.push(s));

  await c._maybeRefreshToken();
  ok('failure #1 attempts the fetch', fetches === 1);
  await c._maybeRefreshToken();
  ok('immediately after a failure: backoff suppresses the retry', fetches === 1);

  for (let i = 2; i <= 5; i++) { c._refreshNextAttempt = 0; await c._maybeRefreshToken(); }
  ok('failures #2–#5 attempted once the backoff window passes', fetches === 5);
  ok('terminal after 5 consecutive failures', c._refreshExhausted === true);
  ok('terminal state fell back to anonymous (v1.3 rule)', c.auth.anonymous === true);
  const exhaustedEvents = statuses.filter((s) => s.auth && s.auth.refreshExhausted === true);
  ok('give-up emitted on status exactly once', exhaustedEvents.length === 1);

  c._refreshNextAttempt = 0;
  await c._maybeRefreshToken();
  ok('after terminal: no further fetch, ever', fetches === 5);
}
{
  const c = mkAuthedClient();
  let fetches = 0, failNext = 2;
  globalThis.fetch = async () => {
    fetches++;
    if (failNext-- > 0) throw new Error('CONNECTION_CLOSED');
    return { ok: true, async json() { return { access_token: fakeJwt(), expires_in: 300 }; } };
  };
  await c._maybeRefreshToken(); c._refreshNextAttempt = 0;
  await c._maybeRefreshToken(); c._refreshNextAttempt = 0;
  await c._maybeRefreshToken();                                   // succeeds
  ok('a success resets the failure counter', fetches === 3 && (c._refreshFailures || 0) === 0 && !c._refreshExhausted);
}
delete globalThis.fetch;

// ── T-D4: tier is on the status envelope; a downgrade is loud; still credential-free ─────────
console.log('T-D4 — identity downgrade is loud, and carries no credential');
{
  const c = new CKClient({ kernel: 't' });
  const statuses = [];
  c.on('status', (s) => statuses.push(s));

  c.auth = { anonymous: false, userId: 'u', token: fakeJwt(), refreshToken: 'r', claims: { exp: 123 } };
  c._emitStatus();
  const first = statuses.at(-1);
  ok('verified session → tier "verified"', first.auth.tier === 'verified');
  ok('first emission carries no tierChanged', first.tierChanged === undefined);

  c._emitStatus();
  ok('steady-state re-emit carries no tierChanged', statuses.at(-1).tierChanged === undefined);

  c._setAnonymous();
  c._emitStatus();
  const down = statuses.at(-1);
  ok('downgrade → tier "anonymous"', down.auth.tier === 'anonymous');
  ok('downgrade carries tierChanged {from,to}', down.tierChanged && down.tierChanged.from === 'verified' && down.tierChanged.to === 'anonymous');

  const leaked = statuses.some((s) => 'token' in (s.auth || {}) || 'refreshToken' in (s.auth || {}) || JSON.stringify(s).includes('h.eyJ'));
  ok('redaction regression: no event ever carries a credential', !leaked);
}

// ── T-D5: outcomeOf(reply) — the three-outcome split as data, zero authority ─────────────────
// (operator, 2026-08-26: "error reporting and reasons and more returned data has to make it
// reliable" — the classifier is a pure structural read of flags the substrate sent; it decides
// nothing and computes nothing.)
console.log('T-D5 — outcomeOf(reply): result | refusal | fault, structurally');
{
  const { outcomeOf } = await import('../ck.js');
  ok('ok:true → "result"', outcomeOf({ ok: true }) === 'result');
  ok('refused:true → "refusal"', outcomeOf({ ok: false, refused: true, sqlstate: '22023' }) === 'refusal');
  ok('ok:false without refused → "fault" (no verdict was reached)', outcomeOf({ ok: false, error: 'timeout' }) === 'fault');
  ok('refused:null (the D2 unknown) → "fault"', outcomeOf({ ok: false, refused: null, error: 'x' }) === 'fault');
  ok('null/undefined reply → "fault"', outcomeOf(null) === 'fault' && outcomeOf(undefined) === 'fault');
  ok('writeResult round-trip: a refusal classifies as refusal', outcomeOf({ ok: false, refused: true }) === 'refusal');
}

console.log(`\nsmoke-honesty: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
