// tests/real-path/harness.js — REAL-PATH verification: the actual ck.js over wss → relay → pgCK.
//
// This is the honesty gate for the v1.5.1 tag. It runs the SHIPPED client modules in a real browser,
// connecting over a real WebSocket to a real pgCK — NOT a mock transport, NOT psql ckp.dispatch (which
// bypasses the transport and is exactly how the gov-routing timeout once slipped past us).
//
// HOW TO RUN (docker-cp dev-harness pattern — for VERIFICATION only; the release goes through CI):
//   1. Bring up the all-in-one dev env: ociger-ck-allinone ≥ v0.7.19 (pgCK ≥ 0.4.13).
//   2. Deploy the modules under test into the served cklib path (overwrites the baked copy):
//        docker cp ck.js        ck-lib-js-allinone:/app/cklib/ck.js
//        docker cp ck-client.js ck-lib-js-allinone:/app/cklib/ck-client.js
//        docker cp ck-store.js  ck-lib-js-allinone:/app/cklib/ck-store.js
//        docker cp vendor       ck-lib-js-allinone:/app/cklib/
//   3. In a browser ON https://ck-lib-js.localhost/ (same origin as /cklib + /wss):
//        const { CK } = await import('/cklib/ck.js');
//        const { runHarness } = await import('/cklib/tests/real-path/harness.js'); // or paste runHarness
//        console.log(await runHarness(CK));
//      (Playwright: page.goto then page.evaluate(() => runHarness(CK)).)
//
// Distinguishes three honest states:
//   proven  — the FORM round-trips end-to-end through the real client (v1.5.1 bar).
//   vacuous — the form works but declared-shape ENFORCEMENT no-ops (BLK-1: demo shapes seeded into
//             urn:ckp:demo/kernel/board while pgCK reads .../kernel/ck). Server/bundle gap, not client code.
//   degrade — pgCK-side bug; client degrades honestly (FIX-C: reach bare-id → SPARQL error → []).

const C = 'https://conceptkernel.org/ontology/v3.8/core#';
const TASK = C + 'Task', GOAL = C + 'Goal', PART_OF_GOAL = C + 'part_of_goal';

export async function runHarness(CK, kernel = 'demo') {
  const r = { proven: {}, enforcement: {}, degrade: {}, errors: [] };
  try {
    const k = await CK.activate(kernel);

    // SHAPE-COMPLETE Task — the demo shape requires BOTH part_of_goal AND target_kernel under real
    // enforcement (v0.7.20+, BLK-1 fixed). The client never strips caller fields (v1.5.2 fix).
    const c = await k.create(TASK, { part_of_goal: 'backlog:demo', target_kernel: 'demo' });
    r.proven.create     = !!(c.ok && c.id && c.verified && c.proof_digest);
    const id = c.id;
    r.proven.verify     = (await k.verify(id)).verified === true;
    r.proven.provenance = !!((await k.provenance(id)).proof);
    r.proven.query      = Array.isArray(await k.query(TASK, {}));
    r.proven.transition = (await k.transition(id, 'in_progress')).ok === true;
    r.proven.update     = (await k.update(id, { part_of_goal: 'backlog:demo2' })).ok === true;
    r.proven.validate   = typeof (await k.validate({ type: TASK, part_of_goal: 'x', target_kernel: 'demo' })).conforms === 'boolean';
    r.proven.match      = Array.isArray(await k.match('x'));
    const g = await k.create(GOAL, { label: 'Harness Goal', target_kernel: 'demo' });
    r.proven.link       = (await k.link(id, PART_OF_GOAL, g.id)).ok === true;

    // ENFORCEMENT — the checks the old (vacuous-env) harness LACKED, which let the target_kernel-strip ship:
    //  • an INCOMPLETE payload MUST be REJECTED (vacuously sealed on v0.7.19; must fail on v0.7.20+).
    const inc = await k.create(TASK, { part_of_goal: 'backlog:demo' });   // missing required target_kernel
    r.enforcement.rejectsIncompleteCreate = inc.ok === false && /missing required/i.test(inc.error || '');
    //  • a declared short-key FILTER now resolves (was vacuous 0 under BLK-1).
    r.enforcement.filteredQueryResolves   = (await k.query(TASK, { target_kernel: 'demo' })).length > 0;

    // Remaining honest gap (FIX-C, pgCK-side): reach degrades to [] until pgCK resolves bare-id IRIs.
    r.degrade.reach_FIXC = (await k.reach(id, PART_OF_GOAL)).length;
  } catch (e) {
    r.errors.push(String(e && e.message || e));
  }
  r.allFormsProven  = Object.values(r.proven).every(Boolean);
  r.enforcementReal = Object.values(r.enforcement).every(Boolean);
  return r;
}
