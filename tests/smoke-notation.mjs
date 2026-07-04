// smoke-notation.mjs — local verification of the CKN compiler (ck-notation.js).
//   compile() is checked purely (no NATS); assemble() runs over a MOCK transport via CK.activate.
// Run: node tests/smoke-notation.mjs
import { parse, compile, assemble, NotationError } from '../ck-notation.js';
import { CK } from '../ck.js';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✅', n); } else { fail++; console.log('  ❌', n); } };
const j = JSON.stringify;
const throws = (fn, code) => { try { fn(); return false; } catch (e) { return e instanceof NotationError && e.code === code; } };

// A CSVC-style instance-plane expression (Unicode strands, ';' comments, ∥ fan-out).
const SENTENCE = `
CK( CSVC.Session ) ⟦instance⟧ ≜ ⟪
  χ : Position(A), Position(B), Synthesis(S), Decision(D)
  ρ : A.holds = "ship Friday"        B.holds = "ship after audit"
  edges :
      A —contradicts→ B                  ; the sealed conflict
      S —resolves→ (A∥B)                 ; synthesis over both
      D —sealed_as→ S
  τ : D → 'decided'
  π : verify(D)
⟫`;

console.log('1. parse — declaration is inspectable');
const ast = parse(SENTENCE);
ok('kernel read', ast.kernel === 'CSVC.Session');
ok('χ: 4 members', ast.members.length === 4 && ast.members[0].type.endsWith('#Position'));
ok('ρ folded per member', (ast.props.A || [])[0]?.o === 'ship Friday');

console.log('2. compile — ordered [{verb, payload}] dispatch plan');
const plan = compile(SENTENCE);
const verbs = plan.map((s) => s.verb);
ok('verb order create×4 → link×4 → transition → verify', j(verbs) === j([
  'instance.create', 'instance.create', 'instance.create', 'instance.create',
  'instance.link', 'instance.link', 'instance.link', 'instance.link',
  'instance.transition', 'instance.verify']));
ok('create binds a ref, ρ folded into payload', plan[0].ref === 'A' && plan[0].payload.holds === 'ship Friday');
ok('no type-specific field injected (payload = {type, …ρ} only)', j(Object.keys(plan[0].payload).sort()) === j(['holds', 'type']));
ok('link uses symbolic $refs (A —contradicts→ B)', plan[4].payload.source.$ref === 'A' && plan[4].payload.target.$ref === 'B');
ok('(A∥B) fans out in order → S→A then S→B', plan[5].payload.target.$ref === 'A' && plan[6].payload.target.$ref === 'B' && plan[5].payload.source.$ref === 'S');
ok('transition payload uses to_state, targets D', plan[8].payload.to_state === 'decided' && plan[8].payload.id.$ref === 'D');

console.log('3. ASCII forms compile identically');
const ascii = compile(`
CK( CSVC.Session ) [[instance]] :=
  chi : Position(A), Position(B), Synthesis(S), Decision(D)
  rho : A.holds = "ship Friday"  B.holds = "ship after audit"
  edges : A -contradicts-> B, S -resolves-> (A||B), D -sealed_as-> S
  tau : D -> 'decided'
  pi : verify(D)`);
ok('ASCII plan ≡ Unicode plan', j(ascii) === j(plan));

console.log('4. URN pointers pass through (instances already in the graph)');
const ptr = compile(`CK( K ) ≜
  χ : Task(T)
  edges : T -part_of_goal-> <urn:ckp:K/goal/g1>
  τ : <urn:ckp:K/task/t9> -> 'done'`);
ok('edge target is the raw URN', ptr[1].payload.target === 'urn:ckp:K/goal/g1');
ok('τ on a pointer needs no create', ptr[2].payload.id === 'urn:ckp:K/task/t9');

console.log('5. typed rejects — compile throws NotationError (author error, not substrate)');
ok('empty → parse_error', throws(() => compile(''), 'parse_error'));
ok('no header → parse_error', throws(() => compile('hello'), 'parse_error'));
ok('⟦genome⟧ plane → genome_plane_deferred', throws(() => compile('CK( K ) ⟦genome⟧ ≜ χ : New(N)'), 'genome_plane_deferred'));
ok('σ strand → genome_plane_deferred', throws(() => compile('CK( K ) ≜ σ : Shape[x]'), 'genome_plane_deferred'));
ok('ρ on unknown member → parse_error', throws(() => compile('CK( K ) ≜ ρ : Z.x = "1"'), 'parse_error'));

console.log('6. assemble — over a live handle (mock transport), refs + honest degrade');
function mockTransport(cfg = {}) {
  let n = 0; const calls = [];
  const seal = (id, extra) => ({ ok: true, id, verified: true, proof_digest: 'pf:' + id, ...extra });
  return {
    calls,
    async connect() {}, async close() {},
    async affordances() { return []; },
    subscribe() { return () => {}; },
    async dispatch(verb, kernelUrn, payload) {
      calls.push({ verb, payload });
      switch (verb) {
        case 'instance.create': { const id = payload.type + '#' + (++n); return seal(id, { result: { '@id': id, ...payload } }); }
        case 'instance.link': return cfg.noLink ? { ok: false, error: 'unknown_affordance' } : seal('edge#' + (++n));
        case 'instance.transition': return seal(payload.id);
        case 'instance.verify': return { ok: true, verified: true, proof_digest: 'pf:v' };
        default: return { ok: false, error: 'unknown_affordance' };
      }
    },
  };
}

const t1 = mockTransport();
const k1 = await CK.activate('CSVC.Session', { transport: t1, hydrate: false });
const r1 = await assemble(k1, SENTENCE);
ok('refs resolved from create replies', !!r1.urns.A && !!r1.urns.D);
ok('dispatch order matches the plan', j(t1.calls.map((c) => c.verb)) === j(compile(SENTENCE).map((s) => s.verb)));
ok('link payload got the RESOLVED source id (not the $ref)', typeof t1.calls[4].payload.source === 'string' && t1.calls[4].payload.source === r1.urns.A);
ok('transition dispatched with resolved D + to_state', t1.calls[8].payload.id === r1.urns.D && t1.calls[8].payload.to_state === 'decided');
ok('all steps ok → aggregate ok', r1.ok === true);
await k1.close();

const t2 = mockTransport({ noLink: true });
const k2 = await CK.activate('CSVC.Session', { transport: t2, hydrate: false });
const r2 = await assemble(k2, SENTENCE);
ok('link reject reported honestly (not thrown, not fabricated)', r2.steps[4].ok === false && r2.steps[4].error === 'unknown_affordance');
ok('walk continues past a non-create reject', r2.steps[8].ok === true && r2.steps[9].ok === true);
ok('aggregate ok is honest (not all steps landed)', r2.ok === false);
await k2.close();

const t3 = mockTransport();
const k3 = await CK.activate('K', { transport: t3, hydrate: false });
const preCompiled = compile('CK( K ) ≜ χ : Task(T)'); // an inspectable [{verb,payload}] plan
ok('compile() returns a bare inspectable array', Array.isArray(preCompiled) && preCompiled[0].verb === 'instance.create');
const r3 = await assemble(k3, preCompiled); // assemble accepts a plan, not only a source string
ok('assemble runs a pre-compiled plan (inspect-then-run split)', r3.ok === true && !!r3.urns.T);
await k3.close();

console.log(`\n${fail ? '❌ FAIL' : '✅ PASS'} — ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
