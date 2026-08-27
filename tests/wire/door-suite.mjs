// tests/wire/door-suite.mjs — the WIRE gate: bi-directional NATS through a REAL door.
//
// North star (operator, 2026-08-26): mirror pgCK's v3.12 TDD discipline — structural AND
// post-structural — but OVER THE WIRE, so what is measured is what the door ALLOWS (grants)
// and COMMUNICATES (replies, refusals, sealed events), not what the client assumes.
//
// Three-state honesty, the point of the whole suite:
//   GRANTED / RESULT   — the door said yes and answered
//   REFUSED            — the door said no, naming it. A REFUSAL IS A RESULT — never a failure here
//   FAULT              — no verdict (timeout, transport death). The only state that fails the run
//
// Run:  NODE_EXTRA_CA_CERTS=~/.local/share/mkcert/rootCA.pem \
//       CK_DOOR=wss://pgck.localhost/wss [CK_KERNEL=ck-lib-js] [CK_TOKEN=<bearer>] \
//       node tests/wire/door-suite.mjs [--json]
// Exit 0 unless a FAULT occurred or the bi-directional axis could not be proven at all.
import CKClient from '../../ck-client.js';

const DOOR   = process.env.CK_DOOR   || 'wss://pgck.localhost/wss';
const KERNEL = process.env.CK_KERNEL || 'ck-lib-js';
const TOKEN  = process.env.CK_TOKEN  || null;
const JSON_OUT = process.argv.includes('--json');
const WAIT_MS = Number(process.env.CK_WAIT_MS || 4000);

const report = { door: DOOR, kernel: KERNEL, tier: TOKEN ? 'token-supplied' : 'anonymous',
                 startedAt: new Date().toISOString(), structural: {}, postStructural: {}, faults: [] };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── connect (the client under test IS the shipped client — no bespoke transport) ─────────────
const client = new CKClient({
  kernel: KERNEL, wssEndpoint: DOOR, subscribe: [],
  ...(TOKEN ? { tokenProvider: async () => TOKEN } : {}),
});
try {
  await client.connect();
} catch (e) {
  report.faults.push({ stage: 'connect', error: String(e?.message || e) });
  finish();
}

// ── BENCH HEALTH preflight — name the environment before judging anything on it ──────────────
// (added after the 2026-08-26 hand-diagnosis: an auth-storm from stale-bearer clients and a
//  wide-open anonymous wire both change how every later row must be read)
report.benchHealth = {};
{
  // 1. auth-storm sampler: $SYS advisories about clients failing authentication in a loop
  let authErrs = 0;
  const sys = client.nc.subscribe('$SYS.ACCOUNT.*.AUTH.ERR');
  (async () => { try { for await (const _ of sys) authErrs++; } catch {} })();
  // 2. loopback echo: can an anonymous client pub AND sub an arbitrary subject?
  const probeSubj = `_wiregate.probe.${Math.random().toString(36).slice(2)}`;
  let echoed = false;
  const echoSub = client.nc.subscribe(probeSubj);
  (async () => { try { for await (const _ of echoSub) { echoed = true; break; } } catch {} })();
  await sleep(200);
  try { client.nc.publish(probeSubj, new TextEncoder().encode('ping')); } catch {}
  await sleep(1500);
  sys.unsubscribe?.(); echoSub.unsubscribe?.();
  report.benchHealth.authStorm = authErrs > 0
    ? { failingPerSecond: +(authErrs / 1.5).toFixed(1), note: 'a client is failing NATS auth in a loop — typically a lingering process holding a pre-wipe/expired bearer (stale pgck-mcp, an old browser pane). Its reconnect noise is real load on the door.' }
    : null;
  report.benchHealth.anonymousWireOpen = echoed
    ? { note: 'anonymous can publish AND subscribe arbitrary subjects (dev-open shell). Every GRANTED below is real but proves nothing about production grants.' }
    : null;
}

// permission violations arrive async on the connection status stream — capture per subject
const violations = [];
(async () => { try {
  for await (const s of client.nc.status()) {
    const txt = String(s?.data ?? s?.error ?? '');
    if (/permissions violation/i.test(txt)) violations.push(txt);
  }
} catch {} })();

// ── STRUCTURAL — the subject grammar: what does this door's grant actually cover? ────────────
// (the PASS-8/9 measurement, made repeatable: canonical long forms, deprecated short forms,
//  the error subject, and the two publish probes)
const wk = client._wireKernel;
const SUBJECTS = {
  [`event.kernel.${wk}.>`]:      'sub',
  [`event.kernel.${wk}.error`]:  'sub',
  [`result.kernel.${wk}.>`]:     'sub',
  [`result.${wk}`]:              'sub (deprecated — expect REFUSED on v3.9+)',
  [`event.${wk}`]:               'sub (deprecated — expect REFUSED on v3.9+)',
  '>':                           'sub CANARY — a full wildcard SHOULD refuse; GRANTED here means either the door is wide open or violation capture is blind, and every GRANTED above is then uncertain',
};
for (const [subject, kind] of Object.entries(SUBJECTS)) {
  const before = violations.length;
  try {
    const sub = client.nc.subscribe(subject);
    (async () => { try { for await (const _ of sub) {} } catch {} })();
    await sleep(600);
    const refused = violations.slice(before).some((v) => v.includes(`"${subject}"`));
    report.structural[subject] = { kind, state: refused ? 'REFUSED' : 'GRANTED' };
    if (refused) sub.unsubscribe?.();
  } catch (e) {
    report.structural[subject] = { kind, state: 'FAULT', error: String(e?.message || e) };
    report.faults.push({ stage: `sub ${subject}`, error: String(e?.message || e) });
  }
}

// ── POST-STRUCTURAL — bi-directional proof: publish in, verdict out ──────────────────────────
// A SECOND client with the default subscription set: dispatch correlates replies over the
// standing result subscription, so the structural client's bare `subscribe: []` must not be
// reused here (measured 2026-08-26: reusing it turned every probe into a self-inflicted FAULT).
const dispatcher = new CKClient({
  kernel: KERNEL, wssEndpoint: DOOR,
  ...(TOKEN ? { tokenProvider: async () => TOKEN } : {}),
});
try { await dispatcher.connect(); } catch (e) {
  report.faults.push({ stage: 'connect(dispatcher)', error: String(e?.message || e) });
  finish();
}
// 1. a READ through the full dispatch path (input.kernel.<k>.action.instance.query → result.*)
//    — any classified verdict (result OR refusal) PROVES the bi-directional axis.
async function probe(name, verb, payload) {
  try {
    const r = await Promise.race([
      dispatcher.dispatch(verb, `ckp://Kernel#${KERNEL}`, payload),
      sleep(WAIT_MS).then(() => ({ __timeout: true })),
    ]);
    if (r?.__timeout) { report.postStructural[name] = { state: 'FAULT', note: `no reply in ${WAIT_MS}ms — reply lost or not granted; query-before-retry applies` }; return null; }
    if (r?.ok === true)      report.postStructural[name] = { state: 'RESULT', keys: Object.keys(r).slice(0, 8) };
    else if (r?.refused)     report.postStructural[name] = { state: 'REFUSED', sqlstate: r.sqlstate ?? null, clause: String(r.error || '').slice(0, 160) };
    else                     report.postStructural[name] = { state: r?.ok === false ? 'ERROR' : 'FAULT', error: String(r?.error || '').slice(0, 160) };
    return r;
  } catch (e) {
    report.postStructural[name] = { state: 'FAULT', error: String(e?.message || e) };
    report.faults.push({ stage: name, error: String(e?.message || e) });
    return null;
  }
}

await probe('read: instance.query', 'instance.query', { type: `urn:ckp:${KERNEL}/type/Probe`, filter: [] });

// 2. NEGATIVE CONTROL — a create the gate MUST refuse (bare non-IRI type). If this seals, the
//    door is fail-open and the suite says so. The REFUSED state is the pass.
const neg = await probe('negative control: bare-name create must refuse', 'instance.create', { type: 'NotAnIri', probe: true });
if (neg?.ok === true) report.faults.push({ stage: 'negative-control', error: 'FAIL-OPEN: a bare-name create SEALED — the gate did not speak' });

// 3. EVENT PLANE — sealed events reach a subscriber (only provable when a write seals; with an
//    anonymous tier this stays honestly NOT-EXERCISED rather than fake-green).
report.postStructural['event plane (sealed events observed)'] =
  { state: 'NOT-EXERCISED', note: 'needs a granted write on this tier; run with CK_TOKEN on a granted identity' };

finish();

function finish() {
  report.finishedAt = new Date().toISOString();
  if (report.structural['>']?.state === 'GRANTED') {
    report.structuralCaveat = 'CANARY GRANTED: ">" was not refused — either this door is wide open or the violation capture is blind on this transport. Treat every GRANTED as UNCERTAIN until the canary refuses.';
  }
  const biDirectional = Object.values(report.postStructural).some((p) => p.state === 'RESULT' || p.state === 'REFUSED');
  report.verdict = report.faults.length === 0 && biDirectional ? 'PROVEN'
                 : biDirectional ? 'PROVEN-WITH-FAULTS' : 'NOT-PROVEN';
  if (JSON_OUT) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`wire door-suite — ${DOOR} · kernel ${KERNEL} · tier ${report.tier}`);
    if (report.benchHealth?.authStorm) console.log(`\n⚠ AUTH-STORM: ~${report.benchHealth.authStorm.failingPerSecond}/s clients failing auth — ${report.benchHealth.authStorm.note}`);
    if (report.benchHealth?.anonymousWireOpen) console.log(`⚠ WIRE OPEN: ${report.benchHealth.anonymousWireOpen.note}`);
    if (report.structuralCaveat) console.log(`\n⚠ ${report.structuralCaveat}`);
    console.log('\nSTRUCTURAL (the grant, measured):');
    for (const [s, r] of Object.entries(report.structural)) console.log(`  ${r.state.padEnd(8)} ${s}   (${r.kind})`);
    console.log('\nPOST-STRUCTURAL (bi-directional through dispatch):');
    for (const [n, r] of Object.entries(report.postStructural)) console.log(`  ${r.state.padEnd(14)} ${n}${r.clause ? ' — ' + r.clause : ''}${r.note ? ' — ' + r.note : ''}`);
    if (report.faults.length) { console.log('\nFAULTS:'); for (const f of report.faults) console.log(`  ✗ ${f.stage}: ${f.error}`); }
    console.log(`\nverdict: ${report.verdict}`);
  }
  client?.nc?.close?.().catch?.(() => {});
  try { globalThis.dispatcher?.nc?.close?.().catch?.(() => {}); } catch {}
  // fleet exit protocol: 0 GREEN · 44 RED-measured (bi-directional proven but faults/negative
  // findings recorded) · 1 BROKEN (could not prove the axis at all)
  process.exit(report.verdict === 'PROVEN' ? 0 : report.verdict === 'PROVEN-WITH-FAULTS' ? 44 : 1);
}
