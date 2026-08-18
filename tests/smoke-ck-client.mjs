// smoke-ck-client.mjs — gov-routing regression (G5a). Guards a timeout seen when a NON-GOV kernel
// handle dispatches governed verbs: governed verbs MUST route to the gov door
// (input.kernel.<gov>.action.<verb>) and the gov reply MUST be subscribed; only delegated agent.*
// ride the target kernel. Run: node tests/smoke-ck-client.mjs
import CKClient, { VERSION as CLIENT_VERSION } from '../ck-client.js';
import CK, { VERSION as CK_VERSION } from '../ck.js';
import fs from 'node:fs';

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
const k = mkClient('demo-board', 'pgCK');
const r = await k.dispatch('instance.create', 'ckp://Kernel#demo-board', { type: 'urn:ckp:demo/type/Board' });
ok('governed create → gov door, not the target kernel', k.__lastSubject === 'input.kernel.pgCK.action.instance.create');
ok('governed create resolves (no timeout) → ok+verified', r.ok === true && r.verified === true);

await k.dispatch('instance.query', 'ckp://Kernel#demo-board', {});
ok('governed query → gov door', k.__lastSubject === 'input.kernel.pgCK.action.instance.query');

await k.dispatch('agent.execute', 'ckp://Kernel#demo-board', {});
ok('delegated agent.execute → TARGET kernel (the harness), not gov door', k.__lastSubject === 'input.kernel.demo-board.action.agent.execute');

k._subscribeAll();
ok('non-gov handle subscribes the gov reply (result.kernel.pgCK.>)', k.__subs.includes('result.kernel.pgCK.>'));

// A GOV-kernel handle: governed verbs ride its own door (no cross-routing)
const g = mkClient('pgCK', 'pgCK');
await g.dispatch('instances.count', 'ckp://Kernel#pgCK', {});
ok('gov-kernel handle: governed verb on its own door', g.__lastSubject === 'input.kernel.pgCK.action.instances.count');

// ── wire-kernel slug (2026-08-12 — pgCK configured_kernels() drops any '.'-bearing kernel name;
// CK.Lib.Js and pgCK.MCP measured NOT READY against it). "Lowercase where nothing remembers;
// leave alone where facts remember" — a dotted name has no working literal form so it adopts the
// lowercase-dash form the credential plane already computes for BOT (pgCK.MCP/pgck-mcp:78's
// regex); an already-routable name is untouched, since the live grant and sealed provenance
// reference its exact casing. ──────────────────────────────────────────────────────────────────
console.log('ck-client.js — wire-kernel slug (dotted names route; working names untouched)');

// A dotted own-kernel name constructs (no throw) and every subject uses the slugged form.
const dotted = mkClient('CK.Lib.Js', 'pgCK');
ok('dotted kernel constructs', dotted.kernel === 'CK.Lib.Js');
ok('_wireKernel is the slug', dotted._wireKernel === 'ck-lib-js');
ok('topics.input uses the slug', dotted.topics.input === 'input.ck-lib-js');
ok('topics.eventLong uses the slug', dotted.topics.eventLong === 'event.kernel.ck-lib-js.>');

await dotted.dispatch('agent.execute', 'ckp://Kernel#CK.Lib.Js', {});
ok('delegated dispatch on own dotted kernel → slugged subject',
   dotted.__lastSubject === 'input.kernel.ck-lib-js.action.agent.execute');

// A dotted TARGET (named via kernelUrn, not the client's own kernel) is also slugged.
const toOther = mkClient('demo-board', 'pgCK');
await toOther.dispatch('agent.execute', 'ckp://Kernel#pgCK.MCP', {});
ok('delegated dispatch targeting a dotted kernelUrn → slugged subject',
   toOther.__lastSubject === 'input.kernel.pgck-mcp.action.agent.execute');

// Regression guard: names that already route MUST NOT be touched — the live pgck.kernels grant
// and every sealed provenance record reference this exact casing; lowercasing it would silently
// break the currently-working default path.
for (const name of ['pgCK', 'Dictionary', 'demo']) {
  const c = mkClient(name, name);
  ok(`'${name}' passes through unchanged (facts remember this casing)`, c._wireKernel === name && c.topics.input === `input.${name}`);
}

// Degenerate case: nothing left after normalization still fails fast, by design.
try {
  mkClient('...', 'pgCK');
  ok('all-separator kernel name throws', false);
} catch (e) {
  ok('all-separator kernel name throws', /no routable form/.test(e.message));
}

// ── status redaction (2026-08-16 — pgCK finding-1786649692677093000: the status event spread the
// whole auth object, handing the raw bearer AND refresh token to every listener; a consumer app
// rendered a person's live credentials into its log). The failing case, as a permanent fixture:
// a verified client's status event must carry identity/expiry signals and NEVER a credential. ──
console.log('ck-client.js — status events carry no credential (redaction fixture)');
{
  const c = new CKClient({ kernel: 'demo-board', subscribe: [] });
  c.auth = { anonymous: false, userId: 'alice', token: 'SECRET-BEARER', refreshToken: 'SECRET-REFRESH', claims: { sub: 'alice', exp: 1786649308 } };
  let got = null;
  c.on('status', (s) => { got = s; });
  c._emitStatus();
  const flat = JSON.stringify(got);
  ok('status event emitted', !!got);
  ok('no raw token anywhere in the event', !flat.includes('SECRET-BEARER'));
  ok('no refresh token anywhere in the event', !flat.includes('SECRET-REFRESH'));
  ok('identity signals survive (userId, exp, hasToken)', got.auth.userId === 'alice' && got.auth.exp === 1786649308 && got.auth.hasToken === true);
  ok('anonymous flag faithful', got.auth.anonymous === false);
}

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

// ── id-scoped dispatch subject (v1.5.6 — #11, pgCK 0.4.24 broker-enforced admittance) ──────────
console.log('ck-client.js — id-scoped dispatch subject (verified → own id segment)');
{
  // anonymous connection → legacy gov subject (seals anonymous; back-compat)
  const a = mkClient('demo-board', 'pgCK');
  await a.dispatch('instance.create', 'ckp://Kernel#demo-board', { type: 'urn:ckp:demo/type/Board' });
  ok('anonymous → legacy gov subject', a.__lastSubject === 'input.kernel.pgCK.action.instance.create');

  // verified connection → id-scoped subject built from ITS OWN sub (the broker enforces it)
  const v = mkClient('demo-board', 'pgCK');
  v.auth = { anonymous: false, userId: 'alice', claims: { sub: 'alice' }, token: 't' };
  await v.dispatch('instance.create', 'ckp://Kernel#demo-board', { type: 'urn:ckp:demo/type/Board', sub: 'bob' });
  ok('verified → id-scoped gov subject from own sub', v.__lastSubject === 'input.kernel.pgCK.id.alice.action.instance.create');
  ok('payload identity ignored — never-assert (no "bob" in subject)', !v.__lastSubject.includes('bob'));

  // delegated agent.* rides the target kernel — out of gov id-scope
  const d = mkClient('demo-board', 'pgCK');
  d.auth = { anonymous: false, userId: 'alice', claims: { sub: 'alice' }, token: 't' };
  await d.dispatch('agent.execute', 'ckp://Kernel#demo-board', {});
  ok('delegated agent.* → target kernel, not id-scoped', d.__lastSubject === 'input.kernel.demo-board.action.agent.execute');
}


// ── version self-identification (2026-08-18 — v1.5.12) ───────────────────────────────────────────
// cklib shipped NO version identifier through v1.5.11. Measured: no version string in ck.js /
// ck-client.js / ck-store.js, no manifest at the door's /cklib/, none in the client cache — so a
// consumer holding the exact bytes could not name its own release, and ck_doctor reported
// "cklib 1.5.10" on the same line as the v1.5.11 digest (b99b06ad…) it had just computed.
// These asserts are the point of the fix: a label that CAN drift from package.json is the defect,
// so the constants are pinned here and the release ritual fails loudly rather than shipping a lie. ──
console.log('ck.js / ck-client.js — version is self-identifying and pinned to package.json');
{
  const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  ok('ck.js exports VERSION', typeof CK_VERSION === 'string' && CK_VERSION.length > 0);
  ok('ck-client.js exports VERSION', typeof CLIENT_VERSION === 'string' && CLIENT_VERSION.length > 0);
  ok(`ck.js VERSION === package.json (${CK_VERSION} === ${pkg.version})`, CK_VERSION === pkg.version);
  ok(`ck-client.js VERSION === package.json (${CLIENT_VERSION} === ${pkg.version})`, CLIENT_VERSION === pkg.version);
  ok('both files agree with each other', CK_VERSION === CLIENT_VERSION);
  ok('CK facade surfaces it (CK.VERSION)', CK.VERSION === pkg.version);
}

console.log(`\n${fail === 0 ? '✅ PASS' : '❌ FAIL'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
