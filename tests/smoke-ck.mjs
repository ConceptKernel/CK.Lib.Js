// smoke-ck.mjs — local verification of the L2 facade (ck.js) over a MOCK transport (no NATS).
// Run: node tests/smoke-ck.mjs
import { CK, ConceptKernel, normalizeKernel } from '../ck.js';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✅', n); } else { fail++; console.log('  ❌', n); } };
const tick = () => new Promise((r) => setTimeout(r, 0));

// Configurable mock transport simulating pgCK at various gate levels.
function mockTransport(cfg = {}) {
  const calls = [];
  const seal = (id, extra) => ({ ok: true, id, verified: true, proof_digest: 'pf:' + id, ...extra });
  const t = {
    connected: false,
    calls,
    async connect() { this.connected = true; },
    async close() { this.connected = false; },
    async affordances() { return [{ name: 'instance.create', plane: 'instance', granted: true }]; },
    subscribe(scope, onMsg) { t._onMsg = onMsg; return () => { t._onMsg = null; }; },
    async dispatch(verb, kernelUrn, payload) {
      calls.push({ verb, payload });
      if (verb === 'instance.transition' && cfg.noTransition) return { ok: false, error: 'unknown_affordance' };
      if (verb === 'instance.query' && cfg.noQuery) return { ok: false, error: 'unknown_affordance' };
      switch (verb) {
        case 'instance.create': {
          // pgCK ≥0.4.4 create_typed contract: a flat {type:<class IRI>, …fields} body (NO `task` wrapper),
          // sealed against the kernel's OWN declared shape. Bare names + legacy nesting are rejected.
          if (payload.task) return { ok: false, error: 'legacy_concretion_routed', hint: 'TE-10 sends flat {type,…fields}, not {task:{…}}' };
          if (!payload.type || !String(payload.type).includes(':')) return { ok: false, error: 'type_must_be_iri', hint: 'instance.create {type} must be the declared class IRI (urn:ckp:<project>/type/<Name>)' };
          return seal(payload.type + '#new', { result: { '@id': payload.type + '#new', '@type': payload.type, ...payload } });
        }
        case 'instance.update': return seal(payload.id);
        case 'instance.transition': {
          // T3 sealed-map: only a declared transition seals; an illegal move returns the allowed set.
          const ALLOWED = ['in_progress', 'done'];
          if (!ALLOWED.includes(payload.to_state)) return { ok: false, error: 'invalid_transition', from: 'draft', to: payload.to_state, allowed: ALLOWED };
          return seal(payload.id);
        }
        case 'instance.link': {
          // T2 declared-predicate gate (v0.4.9): predicate MUST be declared; target is a PLAIN IRI (no {'@id'}).
          if (typeof payload.target !== 'string') return { ok: false, error: 'target_must_be_iri' };
          if (payload.predicate !== 'urn:ckp:demo/type/Task/blocks') return { ok: false, error: 'undeclared_predicate', via: payload.predicate };
          return seal('edge#1');
        }
        // pgCK 0.4.8 read shapes: get→{instance:<envelope>}, query→{rows:[{id,body}]}, list→{instances:[<envelope>]}.
        case 'instance.get': return { ok: true, instance: { id: payload.id, type: 'Task', body: { type: 'Task', title: 'fetched' } } };
        case 'instance.query': return { ok: true, type: payload.type, shaped: true, count: 1, rows: [{ id: 'q1', body: { type: payload.type, title: 'X' } }] };
        case 'instances.list': return { ok: true, count: 1, instances: [{ id: 'L1', type: payload.type, body: { type: payload.type, title: 'legacy' } }] };
        case 'instance.validate': return payload.bad
          ? { ok: true, type: payload.type, conforms: false, violations: [{ resultPath: 'crew_size', sourceConstraintComponent: 'MinCountConstraintComponent' }] }
          : { ok: true, type: payload.type, conforms: true, violations: [] };
        case 'instance.snapshot': return { ok: true, result: [] };
        case 'kernel.affordances': return { ok: true, result: [] };
        default: return { ok: false, error: 'unknown_affordance' };
      }
    },
  };
  return t;
}

console.log('ck.js L2 facade — smoke (mock transport)');

ok('normalizeKernel name → URN', normalizeKernel('pgCK.Task') === 'ckp://Kernel#pgCK.Task');
ok('normalizeKernel passes URN through', normalizeKernel('ckp://Kernel#X') === 'ckp://Kernel#X');

const tp = mockTransport();
const k = await CK.activate('pgCK.Task', { transport: tp });
ok('activate returns ConceptKernel', k instanceof ConceptKernel);
ok('transport connected', tp.connected === true);
ok('handle.name', k.name === 'pgCK.Task' && k.kernelUrn === 'ckp://Kernel#pgCK.Task');
ok('affordances() discovered', k.affordances().length === 1 && k.affordances()[0].name === 'instance.create');

// TE-10: create-by-declared-type — flat {type:<class IRI>,…fields}, sealed vs the kernel's declared shape.
const TASK = 'urn:ckp:demo/type/Task', GOAL = 'urn:ckp:demo/type/Goal', BLOCKS = TASK + '/blocks';
const c = await k.create(TASK, { title: 'Rotate SVIDs', priority: 4, target_kernel: 'demo' });
ok('create → {ok,id,verified,proof_digest}', c.ok && c.id === TASK + '#new' && c.verified && c.proof_digest === 'pf:' + TASK + '#new');
ok('create result cached (get is cache-first)', (await k.get(TASK + '#new'))?.title === 'Rotate SVIDs');
ok('create dispatched flat {type,…fields} (no task wrapper)', tp.calls.some((x) => x.verb === 'instance.create' && x.payload.type === TASK && !x.payload.task));
// REGRESSION GUARD (v1.5.1 → v1.5.2): create MUST pass EVERY caller field through. v1.5.1 stripped
// `target_kernel`, which a declared shape can require — so under real enforcement the create failed
// `missing required …#target_kernel` even when the caller passed it. Never strip caller fields.
ok('create passes ALL fields incl. target_kernel (no strip)', tp.calls.some((x) => x.verb === 'instance.create' && x.payload.target_kernel === 'demo'));
// TE-10: a bare (non-IRI) type is rejected by create_typed — the client passes it through; server hints.
const bare = await k.create('Task', { title: 'x' });
ok('create(bare name) → type_must_be_iri (declared-IRI contract)', bare.ok === false && bare.error === 'type_must_be_iri');

// update
ok('update → instance.update {id,patch} (typed, TE-6)', (await k.update(TASK + '#new', { priority: 5 })).ok && tp.calls.some((x) => x.verb === 'instance.update' && x.payload.patch?.priority === 5));

// transition (native sealed-map, TE-7)
await k.transition(TASK + '#new', 'in_progress', { evidence: 'e' });
ok('transition → instance.transition (native)', tp.calls.some((x) => x.verb === 'instance.transition'));
const badTr = await k.transition(TASK + '#new', 'archived');
ok('transition(illegal) → invalid_transition + allowed set surfaced', badTr.ok === false && badTr.error === 'invalid_transition' && Array.isArray(badTr.allowed));

// link
ok('link → instance.link (declared predicate + PLAIN target IRI, TE-8)', (await k.link(TASK + '#new', BLOCKS, TASK + '#x')).ok && tp.calls.some((x) => x.verb === 'instance.link' && x.payload.predicate === BLOCKS && x.payload.target === TASK + '#x'));
// TE-8: an undeclared predicate is rejected by the kernel's declared-predicate set — client surfaces it honestly.
ok('link(undeclared predicate) → undeclared_predicate (honest)', (await k.link(TASK + '#new', 'blocks', TASK + '#x')).ok === false);

// get on miss → dispatch instance.get
ok('get() miss → dispatch + return', (await k.get('Task#miss'))?.title === 'fetched');

// TE-9: query → derived-QueryShape read (declared-IRI type + SHORT filter keys; rows flattened)
const q = await k.query(TASK, { priority: { gte: 4 } });
ok('query → instance.query returns flattened rows', Array.isArray(q) && q[0]['@id'] === 'q1' && q[0].title === 'X');
ok('query sends declared-IRI type + SHORT filter key (no ONT-prefix)', tp.calls.some((x) => x.verb === 'instance.query' && x.payload.type === TASK && x.payload.filter[0]?.key === 'priority'));

// validate
ok('validate → conforms (flat body, declared type)', (await k.validate({ type: TASK, title: 'x' })).conforms === true);
const vr = await k.validate({ type: TASK, bad: true });
ok('validate → full ValidationReport (typed violations, TE-5)', vr.conforms === false && vr.violations[0]?.resultPath === 'crew_size');

// generic do for an unknown verb
ok('do(unknown) → {ok:false,unknown_affordance}', (await k.do('weird.verb', {})).ok === false);

// reactive bind fires on ingest
let bound = 0;
k.bind('*', () => { bound++; });
await k.create(GOAL, { title: 'G' });
await tick();
ok('bind("*") fires on ingest', bound >= 1);
ok('urn() sync subject', k.urn(GOAL + '#new')?.get()?.title === 'G');

// ── gated degradation paths ──
const tpNoTrans = mockTransport({ noTransition: true });
const k2 = await CK.activate('pgCK.Task', { transport: tpNoTrans });
const tr2 = await k2.transition('Task#z', 'done');
ok('transition not-an-affordance → honest ok:false (TE-7 dropped ride-on-update)', tr2.ok === false && !tpNoTrans.calls.some((x) => x.verb === 'instance.update'));

const tpNoQuery = mockTransport({ noQuery: true });
const k3 = await CK.activate('pgCK.Task', { transport: tpNoQuery });
const lq = await k3.query(TASK, {});
ok('query degrades → instances.list alias (flattened envelope)', lq[0]['@id'] === 'L1' && lq[0].title === 'legacy' && tpNoQuery.calls.some((x) => x.verb === 'instances.list'));

// governance gated → honest stub
const g = await k.propose([{ op: 'add_property' }]);
ok('propose → gov_plane_unavailable (gated)', g.ok === false && g.error === 'gov_plane_unavailable');

// close → methods reject
await k.close();
let threw = false;
try { await k.create('Task', {}); } catch { threw = true; }
ok('after close, handle methods throw', threw === true);

console.log(`\n${fail === 0 ? '✅ PASS' : '❌ FAIL'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
