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
  const k = mkKernel(() => ({ ok: false, error: 'type_must_be_iri', hint: 'instance.create {type} must be the full class IRI' }));
  const w = await k.update('id1', {});
  ok('v1.5.14: the hint (substrate teaching) survives the envelope', /full class IRI/.test(w.hint));
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

// ── T-D9 (v1.5.15): the snake_case stamp shim retires — the envelope is DECLARED camelCase ──
// pgCK 0.4.84 (ckp._stamped) declares the write-reply stamps; measured on the live wire:
// ["id","ok","req","type","verified","createdBy","producedBy","proof_digest","sealedAtEpoch"].
// The v1.5.12 shim's removal condition ("drop the snake_case reads the moment the envelope is
// declared") is MET — a snake-only reply now yields null-honest stamps instead of shim reads.
console.log('T-D9 — snake_case stamp shim retired (declared envelope is camelCase)');
{
  const k = mkKernel(() => ({ ok: true, id: 'x', createdBy: 'urn:ckp:participant:p', sealedAtEpoch: 2, producedBy: 'urn:k', conformsToShape: null }));
  const w = await k.update('x', {});
  ok('declared camelCase stamps pass through', w.createdBy === 'urn:ckp:participant:p' && w.sealedAtEpoch === 2 && w.producedBy === 'urn:k');
}
{
  const k = mkKernel(() => ({ ok: true, id: 'x', created_by: 'urn:ckp:participant:p', sealed_at_epoch: 2, produced_by: 'urn:k' }));
  const w = await k.update('x', {});
  ok('snake_case-only stamps are NO LONGER read (shim gone; null-honest)', w.createdBy === null && w.sealedAtEpoch === null && w.producedBy === null);
}

// ── T-D6 (v1.5.14): claimSub — the id-form write path decoupled from connect credentials ─────
// Wire law (SPEC.pgCK.v3.12-to-CKLIBJS §3): on anonymous shells identity rides the id-form
// SUBJECT segment, credential-less at CONNECT; on OIDC benches the same subject is broker-
// v1.6.1: claimSub is DELETED (R0.8) — every door verifies the bearer, so a claimed segment
// is broker-refused by construction. The strict-options guard refuses the key by name.
console.log('T-D6′ — claimSub is a refused option, not a mechanism');
{
  let threw = null;
  try { new CKClient({ kernel: 'ck-lib-js', wssEndpoint: 'wss://x/wss', claimSub: 'bot-x' }); } catch (e) { threw = e; }
  ok('constructor refuses claimSub, naming it', !!threw && /claimSub/.test(String(threw?.message)));
}
// v1.6.1: dispatchMode is DELETED entirely (R0.4) — both the v3.8 shim and the v3.9 guard.
console.log('T-D7′ — dispatchMode is a refused option (the strict guard replaces the funeral)');
{
  let threw = null;
  try { new CKClient({ kernel: 't', wssEndpoint: 'wss://x/wss', dispatchMode: 'v3.9' }); } catch (e) { threw = e; }
  ok('constructor refuses dispatchMode, naming it', !!threw && /dispatchMode/.test(String(threw?.message)));
}
// charter §2/§4: an unverified connection cannot dispatch — the throw names the contract.
console.log("T-NEW — unverified dispatch throws (id-form is the only publish)");
{
  const c = new CKClient({ kernel: 'ck-lib-js', wssEndpoint: 'wss://x/wss', subscribe: ['result'] });
  c._maybeRefreshToken = async () => {};
  c.nc = { publish() {}, subscribe: () => ({ [Symbol.asyncIterator]() { return { next: async () => ({ done: true }) }; }, unsubscribe() {} }) };
  let threw = null;
  try { await c.dispatch('instance.create', 'ckp://Kernel#ck-lib-js', { type: 'urn:x' }); } catch (e) { threw = e; }
  ok('throws before any publish, naming the verified-bearer requirement', !!threw && /verified/i.test(String(threw?.message)));
}


// ── v1.6.3 R8 (C-7, pgCK 0.4.107): the FIFTH stamp — onBehalfOf, pass-through, absence is the signal ──
console.log('R8 — onBehalfOf: fifth server-derived stamp passes through; absence = acted directly');
{
  const k = mkKernel(() => ({ ok: true, id: 'x', createdBy: 'urn:ckp:participant:p', sealedAtEpoch: 3, producedBy: 'urn:k', onBehalfOf: 'urn:ckp:participant:agent-for' }));
  const w = await k.update('x', {});
  ok('onBehalfOf surfaced verbatim, uninterpreted', w.onBehalfOf === 'urn:ckp:participant:agent-for');
}
{
  const k = mkKernel(() => ({ ok: true, id: 'x', createdBy: 'urn:ckp:participant:p', sealedAtEpoch: 3, producedBy: 'urn:k' }));
  const w = await k.update('x', {});
  ok('absent onBehalfOf → null with the key present (acted directly, never unknown)', w.onBehalfOf === null && ('onBehalfOf' in w));
}

// ── v1.6.3 R10.3: the classifier grows the delegate seam + the not-XX rule (C-15, B7/L-7) ──
console.log('R10.3 — outcomeOf: delegate seam (0A000) and the not-XX rule');
{
  const { outcomeOf } = await import('../ck.js');
  ok("sqlstate 0A000 → 'delegated' — not refused-by-law, not served at THIS tier", outcomeOf({ ok: false, sqlstate: '0A000', error: 'verb_delegated' }) === 'delegated');
  ok("ok:false + non-XX sqlstate WITHOUT refused → 'refusal' (anything not class XX)", outcomeOf({ ok: false, sqlstate: '42501', error: 'not_owner' }) === 'refusal');
  ok("ok:false + XX-class sqlstate → 'fault' (XX is the only class a genuine fault carries)", outcomeOf({ ok: false, sqlstate: 'XX000', error: 'internal_error' }) === 'fault');
  ok('control: no sqlstate, no refused → still fault (timeout shape unchanged)', outcomeOf({ ok: false, error: 'timeout' }) === 'fault');
  ok('control: refused:true → refusal, unchanged', outcomeOf({ ok: false, refused: true, sqlstate: '22023' }) === 'refusal');
}


// ── v1.6.3 FINAL AUDIT (charter §2 sweep): the four reads that never joined the throwing
// side. Reads THROW on a refusal; writes return the verdict-shaped result (T-D2) — that split
// is the doctrine, and verify/provenance/snapshot/match were v1.6.1 leftovers on the wrong
// side of it: a refusal rendered as verdict-unknown / raw body / [] / [] respectively.
console.log('AUDIT — verify/provenance/snapshot/match THROW on a refusal (reads-throw doctrine)');
{
  const refusal = { ok: false, refused: true, sqlstate: '42704', error: 'unknown_instance' };
  for (const [name, fn] of [
    ['verify', (k) => k.verify('x')],
    ['provenance', (k) => k.provenance('x')],
    ['snapshot', (k) => k.snapshot()],
    ['match', (k) => k.match('term')],
  ]) {
    const k = mkKernel(() => ({ ...refusal }));
    let err = null; await fn(k).catch((e) => { err = e; });
    ok(`${name}() throws the refusal verbatim (was: null-verdict/raw/[]/[])`, !!err && err.sqlstate === '42704' && err.refused === true);
  }
}
console.log('AUDIT — controls: the honest shapes are unchanged');
{
  const k = mkKernel(() => ({ ok: true, proof_digest: 'pf:x', seq: 7 }));
  ok('verify() ok-without-verified still null-honest', (await k.verify('x')).verified === null);
  const ks = mkKernel(() => ({ ok: true, result: [] }));
  ok('snapshot() honest empty stays []', Array.isArray(await ks.snapshot()) && (await ks.snapshot()).length === 0);
  const km = mkKernel(() => ({ ok: true, result: [{ '@id': 'c1' }] }));
  ok('match() honest candidates pass through', (await km.match('t'))[0]['@id'] === 'c1');
}
console.log('AUDIT — validate(): the two refusal planes are never flattened (R5.4)');
{
  const shacl = mkKernel(() => ({ ok: false, refused: true, sqlstate: '22023', error: 'MinCount not satisfied: section', violations: [{ path: 'section', sourceConstraintComponent: 'sh:MinCountConstraintComponent' }] }));
  const v = await shacl.validate({ type: 'urn:x' });
  ok('a SHACL report renders conforms:false with violations VERBATIM (unchanged)', v.conforms === false && v.violations.length === 1);
  const proc = mkKernel(() => ({ ok: false, refused: true, sqlstate: '42704', error: 'type_must_be_iri' }));
  let err = null; await proc.validate({ type: 'NotAnIri' }).catch((e) => { err = e; });
  ok('a PROCEDURAL refusal THROWS — conforms:false was a manufactured verdict', !!err && err.sqlstate === '42704');
}

console.log(`\nsmoke-honesty: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
