// ck-notation.js — CK.Lib.Js L3: the Concept Kernel Notation (CKN) compiler.
//
// One import to turn a notation expression into a construct on a live kernel:
//   import { compile, assemble } from '@conceptkernel/cklib/notation';
//
// Concept Kernel Notation (conceptkernel.org) says WHAT a kernel is and WHAT to lay down in
// it, as the strands  χ · ρ · σ · α · γ · π · δ · φ ⟫ε.  This module takes an INSTANCE-plane
// expression — the χ/ρ/edges/τ/π strands: instances, their properties, edges, transitions and
// attestations over an ALREADY-declared genome — and compiles it to an ordered dispatch plan
// the shipped verb surface (ck.js) already serves. Notation in, sealed construct out.
//
// INVARIANTS — the acceptance bar (issue #7). None of these may be crossed:
//   • Plan-emitter, not a graph. compile() output is [{verb, payload}] — no RDF, no quad
//     store, no query language emitted. The L1 store-not-graph invariant (ck.js header) holds.
//   • Zero authority. Every step runs through the handle's governed dispatch; pgCK gates each.
//     The plan is a PROPOSAL — inspectable before it runs; the server still decides every step.
//     compile() resolves / evaluates / traverses nothing.
//   • ck.js unchanged. This module sits strictly ABOVE ConceptKernel, using only its public
//     surface (here: handle.do, the open affordance form) — no new core method, no new transport.
//   • Zero runtime deps; compile() is pure (no I/O) so it tests offline, like the smoke-*.mjs.
//
// SCOPE — slice 1 is the instance plane only, over shipped, ungated verbs. The genome plane
// (declaring new χ/ρ/σ/α/γ → kernel.propose ▸ vote ▸ apply) is DEFERRED to slice 2: a
// genome-plane expression is rejected here rather than pretended. When that plane lands, its
// steps degrade honestly to `gov_plane_unavailable`, mirroring ck.js's existing `_gov` path.

const CKP = 'https://conceptkernel.org/ontology/v3.8/core#';

// Strand labels — the nine-symbol alphabet and its ASCII aliases.
const STRAND = {
  'χ': 'chi', chi: 'chi',
  'ρ': 'rho', rho: 'rho',
  'τ': 'tau', tau: 'tau',
  'π': 'pi', pi: 'pi',
  edges: 'edges', edge: 'edges',
  'σ': 'genome', sigma: 'genome',   // shape strand — genome plane, slice 2
  'α': 'genome', alpha: 'genome',   // affordance strand — genome plane, slice 2
  'γ': 'genome', gamma: 'genome',   // grant strand — genome plane, slice 2
};

/** A typed compile error — thrown by compile()/parse() on malformed or out-of-scope source.
 *  (Substrate rejections at assemble() time are NOT errors: they are recorded honestly per step.) */
export class NotationError extends Error {
  constructor(code, message) { super(message); this.name = 'NotationError'; this.code = code; }
}

const isUrn = (s) => /^<?(urn:|ckp:\/\/|https?:\/\/)/.test(s);
const unwrap = (s) => s.replace(/^</, '').replace(/>$/, '');

/** Resolve a type token: full IRI as-is · CURIE `ckp:X` via the core namespace · bare name → core. */
function resolveType(tok) {
  if (/^https?:\/\//.test(tok) || tok.startsWith('urn:')) return tok;
  const m = tok.match(/^([A-Za-z][\w-]*):(.+)$/);
  if (m && m[1] === 'ckp') return CKP + m[2];
  if (m) return tok; // an unknown prefix is left verbatim — the server resolves or rejects it
  return CKP + tok;
}

/**
 * parse(source) → { kernel, members, props, edges, transitions, attests }
 * Pure. Exposed for callers that want to inspect the declaration (e.g. assert the declared
 * kernel) before compiling. Throws NotationError on a malformed or genome-plane expression.
 */
export function parse(source) {
  if (typeof source !== 'string' || !source.trim()) throw new NotationError('parse_error', 'empty notation expression');
  const src = source
    .split('\n').map((l) => l.replace(/;.*$/, '')).join('\n') // ';' starts a comment
    .replace(/[⟪⟫]/g, '\n');

  const head = src.match(/CK\s*\(\s*([^)\s]+)\s*\)\s*(?:⟦\s*(\w+)\s*⟧|\[\[\s*(\w+)\s*\]\])?\s*(?:≜|:=)?/);
  if (!head) throw new NotationError('parse_error', 'missing CK( Kernel ) header');
  const plane = (head[2] || head[3] || 'instance').toLowerCase();
  if (plane !== 'instance') throw new NotationError('genome_plane_deferred', `plane ⟦${plane}⟧ is the genome plane — deferred to slice 2 (propose ▸ vote ▸ apply)`);

  const ast = { kernel: head[1], members: [], props: {}, edges: [], transitions: [], attests: [] };
  const memberSet = new Set();
  const body = src.slice(src.indexOf(head[0]) + head[0].length);

  let current = null, buf = [], genome = false;
  const flush = () => { if (current && buf.length) strand(current, buf.join(' ')); buf = []; };
  for (const line of body.split('\n')) {
    const m = line.match(/^\s*([χρστπσαγ]|chi|rho|tau|pi|sigma|alpha|gamma|edges?)\s*[:=]\s*(.*)$/u);
    if (m) { flush(); current = STRAND[m[1]]; buf = [m[2]]; }
    else if (current && line.trim()) buf.push(line.trim());
  }
  flush();
  if (genome) throw new NotationError('genome_plane_deferred', 'σ/α/γ declaration strands are the genome plane — deferred to slice 2');

  function strand(kind, s) {
    if (kind === 'genome') { genome = true; return; }
    if (kind === 'chi') {
      for (const m of s.matchAll(/([^\s,()]+)\s*\(\s*([A-Za-z]\w*)\s*\)/g)) {
        ast.members.push({ ref: m[2], type: resolveType(m[1]) });
        memberSet.add(m[2]);
      }
    } else if (kind === 'rho') {
      for (const m of s.matchAll(/([A-Za-z]\w*|<[^>]+>|urn:\S+)\.([\w:]+)\s*=\s*("([^"]*)"|'([^']*)'|\S+)/g)) {
        (ast.props[m[1]] ||= []).push({ p: m[2], o: m[4] ?? m[5] ?? m[3] });
      }
    } else if (kind === 'edges') {
      for (const m of s.matchAll(/([A-Za-z]\w*|<[^>]+>|urn:\S+)\s*[—-]\s*([\w:]+)\s*(?:→|->)\s*(\(\s*[^)]+\)|[A-Za-z]\w*|<[^>]+>|urn:\S+)/gu)) {
        const targets = m[3].startsWith('(')
          ? m[3].slice(1, -1).split(/∥|\|\|/).map((t) => t.trim()).filter(Boolean)
          : [m[3]];
        for (const t of targets) ast.edges.push({ source: unwrap(m[1]), predicate: m[2], target: unwrap(t) });
      }
    } else if (kind === 'tau') {
      const m = s.match(/^\s*([A-Za-z]\w*|<[^>]+>|urn:\S+)\s*(.+)$/u);
      if (!m) return;
      const states = [...m[2].matchAll(/(?:→|->)\s*'([^']+)'/g)].map((x) => x[1]);
      if (states.length) ast.transitions.push({ ref: unwrap(m[1]), states });
    } else if (kind === 'pi') {
      for (const m of s.matchAll(/(verify|provenance)\s*\(\s*([A-Za-z]\w*|<[^>]+>|urn:\S+)\s*\)/gu)) {
        ast.attests.push({ op: m[1], ref: unwrap(m[2]) });
      }
    }
  }

  for (const t of Object.keys(ast.props)) {
    if (!memberSet.has(t) && !isUrn(t)) throw new NotationError('parse_error', `ρ targets unknown member '${t}'`);
  }
  for (const e of ast.edges) for (const end of [e.source, e.target]) {
    if (!memberSet.has(end) && !isUrn(end)) throw new NotationError('parse_error', `edge references unknown member '${end}'`);
  }
  if (!ast.members.length && !ast.edges.length && !ast.transitions.length && !ast.attests.length) {
    throw new NotationError('parse_error', 'expression declares nothing (no χ/edges/τ/π)');
  }
  return ast;
}

/** A symbolic reference to a member created earlier in the plan (resolved at assemble time). */
const ref = (name) => ({ $ref: name });
const end = (x) => (isUrn(x) ? unwrap(x) : ref(x));

/**
 * compile(source) → plan
 * Pure, I/O-free. `plan` is an ordered array of `{ verb, payload, ref? }` steps — a dispatch
 * plan, not a graph. `ref` names the member a create binds; `{ $ref }` markers in payloads are
 * resolved from earlier steps at assemble() time. Order is the notation's own reading:
 * create(χ+ρ) → update(URN-ρ) → link(edges) → transition(τ) → verify/provenance(π).
 *
 * The compiler injects NO type-specific field: every property comes from the ρ strand exactly
 * as written, so a type's declared-required fields (e.g. a shape's target_kernel) are the
 * author's to supply — the server rejects a missing one honestly, as it does for any create.
 */
export function compile(source) {
  const ast = parse(source);
  const plan = [];
  for (const m of ast.members) {
    const payload = { type: m.type };
    for (const { p, o } of ast.props[m.ref] || []) payload[p.replace(/^ckp:/, '')] = o;
    plan.push({ verb: 'instance.create', payload, ref: m.ref });
  }
  for (const [target, props] of Object.entries(ast.props)) {
    if (!isUrn(target)) continue; // member ρ already folded into its create
    const payload = { id: unwrap(target) };
    for (const { p, o } of props) payload[p.replace(/^ckp:/, '')] = o;
    plan.push({ verb: 'instance.update', payload });
  }
  for (const e of ast.edges) plan.push({ verb: 'instance.link', payload: { source: end(e.source), predicate: e.predicate, target: end(e.target) } });
  for (const t of ast.transitions) for (const s of t.states) plan.push({ verb: 'instance.transition', payload: { id: end(t.ref), to_state: s } });
  for (const a of ast.attests) plan.push({ verb: `instance.${a.op}`, payload: { id: end(a.ref) } });
  return plan;
}

/**
 * assemble(handle, planOrSource, opts?) → { ok, urns, steps }
 * Runs a plan through a live ConceptKernel handle. Each step is dispatched via the handle's
 * open `do(verb, payload)` form (so the store ingests replies and pgCK gates every step);
 * `{ $ref }` payload values resolve from the sealed ids of earlier steps.
 *
 * Honest degrade (never throws on a substrate reject): a failed create aborts the steps that
 * reference it (`skipped_dependency`); any other rejected step is recorded and the walk
 * continues. Nothing is fabricated — a step reports the substrate's own error.
 * (compile() DOES throw on malformed / genome-plane source: that is author error, not substrate.)
 */
export async function assemble(handle, planOrSource, opts = {}) {
  const plan = typeof planOrSource === 'string' ? compile(planOrSource) : planOrSource;
  const bound = Object.create(null);
  const dead = new Set();
  const steps = [];
  const resolve = (v) => (v && typeof v === 'object' && v.$ref) ? bound[v.$ref] : v;
  for (const step of plan) {
    const refs = Object.values(step.payload).filter((v) => v && v.$ref).map((v) => v.$ref);
    if (refs.some((r) => dead.has(r))) {
      steps.push({ verb: step.verb, ok: false, error: 'skipped_dependency', refs });
      if (step.ref) dead.add(step.ref);
      continue;
    }
    const payload = {};
    for (const [k, v] of Object.entries(step.payload)) payload[k] = resolve(v);
    let reply;
    try { reply = await handle.do(step.verb, payload, opts); }
    catch (e) { reply = { ok: false, error: String((e && e.message) || e) }; }
    const ok = !!reply && reply.ok !== false;
    const id = reply && (reply.id ?? reply.result?.['@id']);
    if (step.ref) { if (ok && id) bound[step.ref] = id; else dead.add(step.ref); }
    steps.push(ok
      ? { verb: step.verb, ok: true, ...(step.ref ? { ref: step.ref } : {}), id, proof_digest: reply.proof_digest ?? null, verified: reply.verified ?? undefined }
      : { verb: step.verb, ok: false, ...(step.ref ? { ref: step.ref } : {}), error: (reply && reply.error) || 'rejected' });
  }
  return { ok: steps.every((s) => s.ok), urns: bound, steps };
}

export default { parse, compile, assemble, NotationError };
