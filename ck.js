// ck.js — CK.Lib.Js L2: the unified, dispatch-backed concept-kernel surface (v1.5.0).
//
// One import an app or LLM-agent harness needs:  import { CK } from '@conceptkernel/cklib';
// `await CK.activate('<kernel>')` brings a concept kernel to life (authenticate + subscribe granted
// scope); every operation on the returned `ConceptKernel` handle resolves to a single outbound
// primitive — one governed dispatch through one door (SPEC.CK-LIB-JS.v1.6.1, CK-DOOR §4).
//
// App code names concept kernels and concepts (URNs) — never NATS subjects, codecs, handles,
// trace ids, quads, graph ids, or query strings. The machinery underneath is exactly two layers:
//   L0 — a dispatch transport (CKClient; carries the four-tuple to the single ingress)
//   L1 — a typed-instance cache (CKStore; this file imports it)
// There is no RDF, quad store, or query engine on the client.

import CKStore from './ck-store.js';

// SELF-IDENTIFYING ARTIFACT (v1.5.12). cklib shipped no version identifier through v1.5.11: not in
// these files, not in a manifest, not in the door's /cklib/ payload. A consumer holding the exact
// bytes could not tell which release it held, so EVERY version claim about cklib was out-of-band and
// unverifiable — including ck_doctor's, which reported "1.5.10" on the same line as the v1.5.11 digest
// it had just computed. A label that lives beside the bytes drifts from them; one that lives IN the
// bytes cannot. Pinned to package.json by tests/smoke-ck-client.mjs, so the two can never disagree.
export const VERSION = '1.5.15';

/** Normalize a kernel name or URN to the canonical `ckp://Kernel#<Name>` form. */
export function normalizeKernel(kernel) {
  if (typeof kernel !== 'string' || !kernel.length) throw new Error('CK.activate: kernel name or URN required');
  if (kernel.startsWith('ckp://Kernel#')) return kernel;
  if (kernel.startsWith('ckp://')) return kernel;
  return 'ckp://Kernel#' + kernel;
}

// The explicit operation→verb table — the facade mapped onto the SUBSTRATE'S wire verb names
// (never by parsing an action-URN). The namespace is pgCK's vocabulary, written down, not invented.
const OP_VERB = {
  create: 'instance.create',
  update: 'instance.update',
  transition: 'instance.transition',
  link: 'instance.link',
  list: 'instance.query',
  query: 'instance.query',
  get: 'instance.get',
  reach: 'instance.reach',
  verify: 'instance.verify',
  provenance: 'instance.provenance',
  snapshot: 'instance.snapshot',
  validate: 'instance.validate',
  retire: 'instance.retire',
  propose: 'kernel.propose_change',
  vote: 'kernel.vote',
  apply: 'kernel.apply',
  match: 'concept.match',
};

// v1.6.1 (R3.3): the refusal set is the substrate's CLOSED registry (surface.refusals, 52
// codes, measured) — carrying extra aliases here silently widens it. One code, verbatim.
const isUnknownAffordance = (r) => r && r.ok === false && r.error === 'unknown_affordance';

/** The substrate's honest degrade on a derived read (pgCK#4 wire contract, ≥0.4.16): the value is
 *  materializing over budget — `recompute_in_progress: true` is the answer, never a stale/guessed value. */
export const isRecomputing = (r) => !!(r && r.ok === true && r.recompute_in_progress === true);

/** The three-outcome split as data (v1.5.13, T-D5) — a PURE structural read of flags the
 *  substrate sent; decides nothing, computes nothing:
 *    'result'  — ok:true. The data is the answer.
 *    'refusal' — ok:false + refused:true. A RESULT: the gate spoke; `error` names the clause
 *                (render it verbatim) and `sqlstate` names the class.
 *    'fault'   — everything else (timeout, transport death, refused unknown). NO VERDICT WAS
 *                REACHED — never render as a judgment on the request; query before retrying. */
/** v1.6.1 (R0.6): a refusal reaches the caller as a THROWN error carrying the substrate's
 *  verdict VERBATIM — refused, sqlstate, and the untouched error body (R5.4: a SHACL
 *  ValidationReport and a procedural refusal are different planes; neither is flattened). */
export function refusalError(op, r) {
  const e = new Error(`${op}: ${r?.refused ? 'refused' : 'error'} — ${String(r?.error ?? 'unknown').slice(0, 300)}`);
  e.refused = r?.refused === true; e.sqlstate = r?.sqlstate ?? null; e.reply = r; e.verb = r?.verb ?? null;
  return e;
}

export const outcomeOf = (r) => (r && r.ok === true) ? 'result' : (r && r.refused === true) ? 'refusal' : 'fault';

// pgCK ≤0.4.x replies carry no uniform `.result`; each verb returns its own field. Map them so the
// `.result`-keyed ingest + typed reads fire. (Reply-envelope normalization is pgCK design-Q1; per-verb
// adapters until pgCK confirms the uniform reply envelope.)
const REPLY_FIELD = {
  'instance.query': 'rows', 'instance.get': 'instance',
  'instance.reach': 'reached', 'concept.match': 'candidates',
  'instance.snapshot': 'instances',
};

/** pgCK 0.4.8 read rows are envelopes (`{id,type,body,…}` from list/get) or `{id,body}` (T1 query);
 *  flatten each to a typed instance `{'@id', …body}` so the cache keys on @id and body fields surface flat. */
const flattenRow = (row) => (row && typeof row === 'object' && row.body && typeof row.body === 'object')
  ? { '@id': row.id ?? row['@id'], ...row.body } : row;

/** Populate a canonical `.result` from pgCK's per-verb reply field (flattening read rows) so ingest +
 *  typed reads fire. Reply fields are pinned per-verb (pgCK Q1); see SPEC.CK-OPERATIONS §wire-contract. */
function normalizeReply(verb, reply) {
  if (!reply || typeof reply !== 'object' || reply.result != null) return reply;
  const field = REPLY_FIELD[verb];
  if (field && reply[field] != null) {
    const v = reply[field];
    reply.result = Array.isArray(v) ? v.map(flattenRow) : flattenRow(v);
  }
  return reply;
}

/** Convert the facade filter object `{key:{op:val}}` / `{key:val}` into pgCK's `[{op,key,value}]` array.
 *  Keys are SHORT localnames — pgCK's QueryShape (T1) resolves each to the type's declared property IRI. */
function toFilterArray(filter) {
  if (Array.isArray(filter)) return filter;
  const out = [];
  for (const [key, cond] of Object.entries(filter || {})) {
    if (['order_by', 'limit', 'offset'].includes(key)) continue;
    if (cond && typeof cond === 'object' && !Array.isArray(cond)) {
      for (const [op, value] of Object.entries(cond)) out.push({ op, key, value });
    } else { out.push({ op: 'eq', key, value: cond }); }
  }
  return out;
}

/** Derive the stable write-result shape from a dispatch reply. On success also carries a typed Ref:
 *  `.urn` (full IRI form) + `.local` (bare local part) so callers never do URN surgery (`bare()`) or
 *  guess between `.id`/`.iri`. `.id` is preserved unchanged (non-breaking). */
function writeResult(reply) {
  // D2 (v1.5.13): the refusal class survives the envelope. A refusal ({refused:true, sqlstate})
  // is a RESULT — the gate spoke; a fault (refused absent → null = unknown) reached no verdict
  // and must never render as a judgment on the request. Dropping these two keys made the
  // three-outcome split (result/refusal/fault) unimplementable for every consumer.
  // v1.5.14: `hint` passes through too — measured on the live wire (2026-08-26): the dispatch
  // refusal envelope is {ok:false, req, hint, error}, and the hint IS the substrate teaching
  // ("must be the full class IRI…"). Dropping it threw away the best documentation on the wire.
  if (!reply || reply.ok === false) return { ok: false, id: reply?.id ?? null, error: reply?.error, hint: reply?.hint ?? null, refused: reply?.refused ?? null, sqlstate: reply?.sqlstate ?? null, violations: reply?.violations, allowed: reply?.allowed };
  const id = reply.id ?? reply.result?.['@id'] ?? null;
  const urn = reply.result?.['@id'] ?? reply.id ?? null;
  const local = id != null ? String(urn ?? id).split(/[#/]/).pop() : null;
  // U7 (#16): `verified` means VALIDATED, never HASHED. A proof digest attests that bytes were hashed
  // and chained; it says NOTHING about whether a shape gated the body. Absent `verified` is UNKNOWN —
  // `null`, never `true`. This client renders server verdicts verbatim and must not manufacture a
  // conformance claim out of an integrity artifact. OBSERVABLE CHANGE: a reply carrying a
  // proof_digest and no `verified` used to report true and now reports null (falsy either way for
  // `if (w.verified)`, but no longer an affirmative claim).
  //
  // #15, extended to ALL FOUR STAMPS: `createdBy` / `sealedAtEpoch` / `producedBy` /
  // `conformsToShape` are PASS-THROUGH — surfaced verbatim, never interpreted, null when absent.
  // The substrate derives all four at seal (an A3-adopted project targets InstanceShape, so they are
  // REQUIRED there, not merely stored). createdBy: a caller comparing what it sent against what came
  // back learns its own identity claim had no effect, with no differential refusal to use as an
  // oracle. sealedAtEpoch: lets the L1 cache detect it holds pre-change data. producedBy: which
  // kernel processed the instance into being. conformsToShape: WHICH shape gated the body — its
  // absence on a reply is itself information (a vacuous / pre-adoption seal, per the epoch-0 fence),
  // which is why null is surfaced rather than papered over.
  return {
    ok: true, id, urn, local,
    verified: reply.verified ?? null,
    proof_digest: reply.proof_digest ?? null,
    // v1.5.15 (T-D9): the snake_case shim is RETIRED — its stated removal condition arrived.
    // pgCK 0.4.84 (ckp._stamped) declares the reply envelope; measured on the live wire, the
    // stamps ride camelCase. A snake-only reply now reads null-honest, exactly like any other
    // absent field — the shim died the release after the declaration, as promised in v1.5.12.
    createdBy: reply.createdBy ?? null,
    sealedAtEpoch: reply.sealedAtEpoch ?? null,
    producedBy: reply.producedBy ?? null,
    conformsToShape: reply.conformsToShape ?? null,
    seq: reply.seq,
  };
}

/** Wrap a successful write-result as a live Ref bound to the handle — callable sugar so the caller
 *  operates on the new instance without juggling its id. Non-breaking: the data fields (ok/id/urn/local/…)
 *  stay; methods are added. Failures / receiptless replies pass through unchanged. */
function makeRef(handle, w) {
  if (!w || w.ok !== true || w.id == null) return w;
  return Object.assign(w, {
    transition: (toState, evidence) => handle.transition(w.id, toState, evidence),
    update: (patch) => handle.update(w.id, patch),
    link: (predicate, target) => handle.link(w.id, predicate, target),
    verify: () => handle.verify(w.id),
    get: () => handle.get(w.id),
  });
}

/**
 * ConceptKernel — the live handle returned by `CK.activate`. Affordance-projected (what `do` may
 * invoke and what `activate` subscribed = the kernel's affordance rows ∩ the verified identity's
 * grants). The handle is NOT the authorization boundary; pgCK is (SPEC §4.10).
 */
export class ConceptKernel {
  constructor(kernelUrn, transport, store, affordances = [], opts = {}) {
    this.kernelUrn = kernelUrn;
    this.name = kernelUrn.replace('ckp://Kernel#', '');
    this._transport = transport;
    this._store = store;
    this._affordances = affordances;
    this._opts = opts;
    this._closed = false;
    this._unsubs = [];
    // v1.6.1 (R6.1 / A-9): the handle OWNS its bus — one handle = one kernel = one bus, scoped
    // by construction (one transport per activation). No consumer types a NATS subject: every
    // selector is semantic (kind · verb · type · mine). Built once, three ergonomics on top.
    this._busFns = new Set();
    if (transport && typeof transport.on === 'function') {
      const mySub = () => transport.auth?.claims?.sub ?? transport.auth?.userId ?? null;
      for (const kind of ['result', 'event', 'error', 'status', 'late']) {
        transport.on(kind, (m) => {
          const by = m?.by ?? null;
          const sub = mySub();
          const frame = {
            kind,
            verb: m?.verb ?? null,
            type: m?.conceptType ?? null,
            subjectIri: m?.subjectIri ?? null,
            by,
            // R6.3 (A-12): a comparison of two SERVER-attributed values (frame `by` header vs the
            // connection's own verified sub) — never a client assertion of identity.
            mine: !!(by && sub && (by === `urn:ckp:participant:${sub}` || by.endsWith(sub))),
            // R6.5 (A-14): the consistency token, surfaced on every frame when the reply carries it.
            sealedAtEpoch: m?.data?.sealedAtEpoch ?? m?.data?.sealed_at_epoch ?? null,
            seq: m?.seq ?? null,
            traceId: m?.traceId ?? null,
            data: m?.data ?? m,
          };
          for (const f of this._busFns) { try { f(frame); } catch {} }
        });
      }
    }
  }

  // ── R6: the promise-first, subject-free event surface ──────────────────────
  _matches(sel, fr) {
    if (!sel) return true;
    if (typeof sel === 'string') return fr.kind === sel;
    if (sel.kind != null && fr.kind !== sel.kind) return false;
    if (sel.verb != null && fr.verb !== sel.verb) return false;
    if (sel.type != null && fr.type !== sel.type) return false;
    if (sel.mine != null && fr.mine !== sel.mine) return false;
    return true;
  }

  /** Callback form. `on({kind:'result', verb:'instance.create'}, fn)` — returns an unsubscribe fn. */
  on(selector, fn) {
    this._assertOpen();
    const wrapped = (fr) => { if (this._matches(selector, fr)) fn(fr); };
    wrapped.__inner = fn;
    this._busFns.add(wrapped);
    return () => this._busFns.delete(wrapped);
  }
  off(selector, fn) { for (const w of this._busFns) if (w.__inner === fn) this._busFns.delete(w); }
  once(selector, fn) { const off = this.on(selector, (fr) => { off(); fn(fr); }); return off; }

  /** Promise form (charter §4). REJECTS on timeout — deterministic: a frame, or an error. */
  next(selector, { timeout = 15000 } = {}) {
    this._assertOpen();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { off(); reject(new Error(`next: no matching frame in ${timeout}ms (selector ${JSON.stringify(selector)})`)); }, timeout);
      const off = this.on(selector, (fr) => { clearTimeout(timer); off(); resolve(fr); });
    });
  }

  /** Async-iterator form — `for await (const e of k.stream({mine:false})) …`. Bounded queue. */
  stream(selector, { buffer = 256 } = {}) {
    this._assertOpen();
    const queue = []; const waiters = [];
    const off = this.on(selector, (fr) => {
      const w = waiters.shift();
      if (w) w({ value: fr, done: false });
      else { queue.push(fr); if (queue.length > buffer) queue.shift(); }
    });
    return {
      [Symbol.asyncIterator]() { return this; },
      next() { return queue.length ? Promise.resolve({ value: queue.shift(), done: false }) : new Promise((r) => waiters.push(r)); },
      return() { off(); while (waiters.length) waiters.shift()({ value: undefined, done: true }); return Promise.resolve({ value: undefined, done: true }); },
    };
  }

  /** R6.6: the ONLY subject-exposing call — diagnostic, never the consumption path. */
  subjects() { return typeof this._transport.subjects === 'function' ? this._transport.subjects() : []; }

  _assertOpen() { if (this._closed) throw new Error(`ConceptKernel ${this.name} is closed`); }

  // ── The open affordance surface ────────────────────────────────────────────

  /** Invoke any affordance the kernel declares and the identity is granted. Compiles to ckp.dispatch. */
  async do(verb, payload = {}, opts = {}) {
    this._assertOpen();
    const reply = normalizeReply(verb, await this._transport.dispatch(verb, this.kernelUrn, payload, opts));
    if (reply && reply.result != null) this._store.ingest(reply);
    return reply;
  }

  /** The kernel's declared, identity-granted affordance descriptors (sourced from sealed rows). */
  affordances() { return this._affordances.slice(); }

  /** v1.6.1 (R4.1 / N-1): act one, first-class. `projectKind` is REQUIRED and never guessed —
   *  the throw is local (cheaper than a wire round-trip to be told). Payload key is `project`
   *  (never `kernel` — measured: a `kernel:` key produced a 30s fault, no verdict). */
  async germinate({ projectKind, label } = {}) {
    this._assertOpen();
    if (!projectKind) throw new Error(
      "germinate: `projectKind` is required and has no default — supply 'personal' or 'shared' " +
      "(SPEC.MCP-pgCK §5: supplied, never guessed).");
    const r = await this.do('kernel.germinate', { project: this.name, projectKind, ...(label ? { label } : {}) });
    if (r && r.ok === false) throw refusalError('germinate', r);
    return r;
  }

  /** v1.6.1 (R4.2 / N-2, N-3): the read-only checker surface, learnable BEFORE writing.
   *  `declared({type})` is the property contract; `refusals()` the closed refusal set. */
  get surface() {
    const call = (verb) => async (payload = {}) => {
      this._assertOpen();
      const r = await this.do(verb, payload);
      if (r && r.ok === false) throw refusalError(verb, r);
      return r;
    };
    return {
      check: call('surface.check'),
      refusals: call('surface.refusals'),
      typecheck: call('surface.typecheck'),
      declared: call('surface.declared'),
      unshaped: call('surface.unshaped'),
      grounding: call('surface.grounding'),
    };
  }

  /** `do` + honest-fresh polling for derived reads (pgCK#4 contract). While the reply is the honest
   *  `recompute_in_progress` degrade, re-dispatches with backoff — safe: the substrate JOINS the
   *  in-flight build (per-scope dedup), so polling never duplicates work. This helper decides WHEN
   *  to ask again, never WHAT the value is: on budget exhaustion the last honest reply is returned
   *  as-is (the caller surfaces `recomputing`; nothing is fabricated or served from cache). */
  async doFresh(verb, payload = {}, opts = {}) {
    const { attempts = 8, delayMs = 250, factor = 2, maxDelayMs = 4000, onRecomputing, ...dispatchOpts } = opts;
    let reply = await this.do(verb, payload, dispatchOpts);
    let wait = delayMs;
    for (let i = 1; i < attempts && isRecomputing(reply); i++) {
      if (onRecomputing) { try { onRecomputing(i, reply); } catch { /* observer must not break the poll */ } }
      await new Promise((r) => setTimeout(r, wait));
      wait = Math.min(wait * factor, maxDelayMs);
      reply = await this.do(verb, payload, dispatchOpts);
    }
    return reply;
  }

  // ── Named conveniences (sugar over `do`, mapped via OP_VERB) ────────────────

  async create(type, body = {}) {
    // Uniform create-by-declared-type. pgCK routes instance.create → ckp.create_typed when {type} is
    // top-level with NO `task` key, sealing against the kernel's OWN declared SHACL shape (sh:targetClass =
    // type; each caller field local-name → declared property IRI). `type` MUST be the declared class IRI;
    // the server rejects a bare name (`type_must_be_iri`). Drops the transient `task`/`name` nesting.
    //
    // FIX (v1.5.2): pass ALL caller fields through. v1.5.1 STRIPPED `target_kernel` (wrongly assumed
    // server-scoped) — but a kernel may DECLARE it required (the demo Task shape does), so under real
    // enforcement (BLK-1 fixed, ociger v0.7.20) the create failed `missing required …#target_kernel` even
    // when the caller passed it. The caller owns the shape-required fields; the client never drops them.
    const w = writeResult(await this.do(OP_VERB.create, { type, ...body }));
    // Receipt-only reply → optimistically surface the sealed instance for cache-first reads; the
    // authoritative sealed event reconciles it (replace-by-id).
    if (w.ok && w.id) this._store.ingest({ '@id': w.id, '@type': type, ...body });
    return makeRef(this, w);
  }
  /** TE-6: generic declared-shape patch (pgCK T4, ≥0.4.11) — instance.update {id, patch:{…}} → update_typed,
   *  patched by the type's declared properties (re-sealed; undeclared keys rejected). */
  async update(id, patch = {}) { return writeResult(await this.do(OP_VERB.update, { id, patch })); }
  // TE-8 (live-verified vs pgCK 0.4.13): `target` is a PLAIN IRI — edge.create puts it straight into the
  // materialized turtle, so an {'@id':…} wrapper turtle-parse-errors. `predicate` must be a declared IRI.
  async link(source, predicate, target) { return writeResult(await this.do(OP_VERB.link, { source, predicate, target })); }
  // NAMED FOR WHAT IT IS: a sealed EDGE that also emits an event — `instance.link` with `event:true`.
  // It is NOT a notification channel, and the older reading of it as one is wrong in two ways.
  // (1) It is addressed: source→target. v3.11's notification concept is `wave:Finding` — "something
  //     measured that is not work", UNOWNED by default (measured: FindingShape requires label,
  //     core:reason and findingState; it has NO owner property). A recipient is not addressed; they
  //     read it, and it becomes work only if THEY seal `promotedTo` a Ticket.
  // (2) `from` here is the edge's SOURCE INSTANCE, never a sender claim. The sender is `ckp:createdBy`,
  //     derived from the verified connection — measured 2026-08-12, and a payload asserting a different
  //     identity is ignored, not merged. Do not read `from` as "who sent this".
  // To notify, CREATE a Finding — `k.create(<wave:Finding IRI>, {label, reason, findingState})`. There is
  // deliberately no `finding()` helper: it would have to hardcode a core IRI, and this client hardcodes
  // none (CL-D2). The caller supplies the IRI, as with every other type.
  async retire(id, reason) { return writeResult(await this.do(OP_VERB.retire, { id, reason })); }
  // U7 (v1.5.13, D1): same rule as writeResult — `verified` is the substrate's verdict verbatim,
  // absent means null. A proof digest attests hashing/chaining, never conformance; manufacturing
  // one from the other was the exact defect #16 removed one function over.
  async verify(id) { const r = await this.do(OP_VERB.verify, { id }); return { verified: r?.verified ?? null, proof_digest: r?.proof_digest ?? null, seq: r?.seq }; }
  async provenance(id, depth) { const r = await this.do(OP_VERB.provenance, { id, depth }); return r?.result ?? r; }
  async snapshot(scope) { const r = await this.do(OP_VERB.snapshot, scope ? { scope } : {}); return r?.result ?? []; }
  /** TE-4: governed concept.match (pgCK T6, ≥0.4.13) — full-text or token match against the kernel's
   *  declared concept index; returns the `candidates` array (REPLY_FIELD normalised to `.result`). */
  async match(term) { const r = await this.do(OP_VERB.match, { term }); return r?.result ?? []; }

  /** TE-7: native sealed-map transition (pgCK T3, ≥0.4.10). The kernel reads the instance type's OWN sealed
   *  transition map; an illegal move returns {error:'invalid_transition', from, to, allowed} — `allowed` is
   *  surfaced so the caller can offer only the legal to_states. No client-side ride-on-update. */
  async transition(id, toState, evidence) {
    // Lossless: surface the sealed-map reply verbatim — {from, to, source} on success, plus `allowed`
    // WHEN the server sends it (optional — live pgCK 0.4.21 omitted it for a nonexistent target). No
    // dropping to raw do() just to read the from-state.
    const r = await this.do(OP_VERB.transition, { id, to_state: toState, evidence });
    return { ...writeResult(r), from: r?.from, to: r?.to, allowed: r?.allowed, source: r?.source };
  }

  /** TE-5: the full SHACL ValidationReport (pgCK T5, ≥0.4.12). Send {type:<declared IRI>,…fields} flat;
   *  validate_instance returns {conforms, violations:[…typed W3C SHACL results…]}. Surfaced verbatim — no
   *  boolean-grade local reduction. */
  async validate(body) {
    const r = await this.do(OP_VERB.validate, body);
    if (r?.ok === false) return { conforms: false, violations: r.violations ?? [], error: r.error };
    return { conforms: r?.conforms === true, violations: r?.violations ?? [] };
  }

  // ── Reads without a query language (named, typed, grantable — §4.5) ─────────

  /** Cache-first; dispatch `instance.get` on miss; ingest + return the typed instance. */
  async get(id) {
    const cached = this._store.get(id);
    if (cached) return cached;
    const r = await this.do(OP_VERB.get, { id });
    return this._store.get(id) ?? r?.result ?? null;
  }

  /** `instance.query` — pgCK's derived-QueryShape read (T1, ≥0.4.8): `type` is the declared class IRI;
   *  filter keys are short localnames the kernel resolves to its declared properties (undeclared rejected).
   *  v1.6.1 (R0.6, charter §2): a refusal THROWS, verdict verbatim — an empty array is a lie
   *  about a refusal. An honest empty read (ok:true, zero rows) still returns []. */
  async query(type, filter = {}) {
    const payload = { type, filter: toFilterArray(filter) };
    if (filter && !Array.isArray(filter)) { if (filter.limit != null) payload.limit = filter.limit; if (filter.offset != null) payload.offset = filter.offset; }
    const r = await this.do(OP_VERB.query, payload);
    if (r && r.ok === false) throw refusalError('query', r);
    const rows = (r && Array.isArray(r.result)) ? r.result : [];
    // v1.6.1 (R5.1 / A-5): the substrate says complete/truncated on every enumerable read —
    // dropping it was a green-tick collapse (T13). Attached NON-enumerably: spread, JSON,
    // for…of are byte-identical to before; callers who want it read .completeness or use
    // queryWithVerdict(). Never dropped again.
    const verdict = r?.complete ?? r?.completeness ?? (r?.truncated != null ? (r.truncated ? 'truncated' : 'complete') : null);
    Object.defineProperty(rows, 'completeness', { value: verdict, enumerable: false, configurable: true });
    return rows;
  }

  /** R5.1 explicit form: rows + the completeness verdict, verbatim. */
  async queryWithVerdict(type, filter = {}) {
    const rows = await this.query(type, filter);
    return { rows, completeness: rows.completeness ?? null };
  }

  /** Bounded traversal. Gated on pgCK CI-E-4; returns [] honestly if unavailable. */
  async reach(from, via, opts = {}) {
    const r = await this.do(OP_VERB.reach, { from, via, ...opts });
    if (r && r.ok === false) throw refusalError('reach', r);   // R0.6 — includes unknown_affordance
    if (r && Array.isArray(r.result)) { this._store.ingest(r.result); return r.result; }
    return [];
  }

  // ── Governance plane (gated on pgCK CI-D; honest stub until then — §4.6) ────

  // Governance plane — server shapes (pgCK 0.4.x): propose {op,requires_quorum,detail}; vote {about,value}; apply {about}.
  async propose(op, detail = {}, requires_quorum = 1) {
    const r = await this._gov(OP_VERB.propose, { op, requires_quorum, detail });
    // Normalize the proposal handle to a stable `.iri` (the reply names it proposal_iri/proposal/id/about)
    // so callers — and govern() — read r.iri instead of a 5-way OR-guess.
    if (r && typeof r === 'object' && r.iri == null) r.iri = r.proposal_iri ?? r.proposal ?? r.id ?? r.about ?? r.result?.['@id'] ?? null;
    return r;
  }
  async vote(proposalIri, value) { return this._gov(OP_VERB.vote, { about: proposalIri, value }); }
  async apply(proposalIri) { return this._gov(OP_VERB.apply, { about: proposalIri }); }

  /** Single-actor governance: propose → vote(approve) → apply at the given quorum (default 1), returning a
   *  stable { ok, proposal, state, epoch } — no manual proposal-id extraction. For a real multi-party quorum,
   *  use propose()/vote()/apply() directly. */
  async govern(op, detail = {}, opts = {}) {
    const quorum = opts.quorum ?? 1;
    const p = await this.propose(op, detail, quorum);
    if (p && p.ok === false) throw refusalError('govern.propose', p);        // R0.6
    if (!p?.iri) throw refusalError('govern.propose', { ok: false, error: 'no_proposal_iri', reply: p });
    const vote = await this.vote(p.iri, opts.value ?? 'approve');
    if (vote && vote.ok === false) throw refusalError('govern.vote', vote);
    const applied = await this.apply(p.iri);
    if (applied && applied.ok === false) throw refusalError('govern.apply', applied);
    // v1.6.1 (R5.2 / A-6): single-actor at quorum 1 is REHEARSAL and the return value says so.
    // Client-derived until pgCK stamps it server-side (R5.3) — the label survives the cutover.
    const rehearsal = quorum <= 1;
    return { ok: !!(applied && applied.ok), proposal: p.iri, state: applied?.state,
             epoch: applied?.epoch, rehearsal, rehearsalSource: 'client-derived', vote, applied };
  }
  /** Sugar: seal a type's transition map in one governed act (single-actor by default). */
  async setTransitionMap(targetClass, map, opts = {}) { return this.govern('set_transition_map', { targetClass, map }, opts); }

  async _gov(verb, payload) {
    const r = await this.do(verb, payload);
    if (isUnknownAffordance(r)) return { ok: false, error: 'gov_plane_unavailable' };
    return r;
  }

  // ── Reactive reads + lifecycle (delegate to L1) ────────────────────────────

  view(urn, opts) { this._assertOpen(); return this._store.view(urn, opts); }
  urn(urn) { return this._store.urn(urn); }
  bind(pattern, fn, opts) { this._assertOpen(); return this._store.bind(pattern, fn, opts); }
  bindOnce(pattern, fn, opts) { this._assertOpen(); return this._store.bindOnce(pattern, fn, opts); }

  async close() {
    if (this._closed) return;
    this._closed = true;
    for (const u of this._unsubs) { try { u(); } catch { /* ignore */ } }
    this._unsubs = [];
    this._store.dispose();
    if (this._transport && typeof this._transport.close === 'function') await this._transport.close();
  }
  dispose() { return this.close(); }
}

/**
 * The application surface. `CK.activate(kernel, opts?)` brings a concept kernel to life: establishes
 * the authenticated identity (the transport's, derived from the Envoy-verified JWT — the client never
 * asserts identity), subscribes the kernel's granted scope, and returns a live handle.
 */
export const CK = {
  VERSION,
  async activate(kernel, opts = {}) {
    const kernelUrn = normalizeKernel(kernel);

    // L0 — the dispatch transport. Injectable (opts.transport) for testing/harnesses; otherwise the
    // recut CKClient is constructed (Track T). We import it lazily so this module loads without NATS.
    let transport = opts.transport;
    if (!transport) {
      const mod = await import('./ck-client.js');
      const CKClient = mod.CKClient ?? mod.default;
      transport = new CKClient({ ...opts, kernel: kernelUrn.replace('ckp://Kernel#', '') });
    }
    if (typeof transport.connect === 'function') await transport.connect();

    // L1 — the typed-instance cache, wired with a dispatcher so CKView.fetch() works.
    const store = new CKStore({
      replaceById: opts.replaceById,
      dedupBySeq: opts.dedupBySeq,
      recentCapacity: opts.recentCapacity,
      dispatch: (verb, payload) => transport.dispatch(verb, kernelUrn, payload),
    });

    // #19 — activate's OWN discovery calls (affordances, snapshot) are best-effort and already degrade
    // to []/skip. But a refused publish on an anonymous connection surfaces as a bare
    // 'PERMISSIONS_VIOLATION' with NO subject (measured — the client cannot correlate it to the
    // pending dispatch), so each call would otherwise wait out the full dispatchTimeout. An anonymous
    // connection would take 2×dispatchTimeout to hand back a handle it degrades to subscribe-only
    // anyway. `discoveryTimeout` (default 5s) bounds the degrade: a granted substrate answers in ms so
    // it never bites the healthy path; a refused one degrades in seconds, not minutes. The transport's
    // _onProtocolError still surfaces the violation on the `error` channel immediately, so the refusal
    // is diagnosed, not silent — it is only the WAIT that this bound removes.
    const discoveryTimeout = opts.discoveryTimeout ?? 5000;
    const withDeadline = (p, fallback) => {
      let t; const timer = new Promise((res) => { t = setTimeout(() => res(fallback), discoveryTimeout); });
      // Swallow the loser's eventual rejection/resolution so a late dispatch timeout is never an
      // unhandled rejection once activate has already moved on.
      Promise.resolve(p).catch(() => {}).finally(() => clearTimeout(t));
      return Promise.race([Promise.resolve(p).catch(() => fallback), timer]);
    };

    // Discover the kernel's affordances (sealed rows ∩ identity grants — degrades to [] honestly).
    let affordances = [];
    if (typeof transport.affordances === 'function') affordances = await withDeadline(transport.affordances(kernelUrn), []);
    else affordances = await withDeadline(transport.dispatch('affordances', kernelUrn, {}).then(r => (r && r.result) || []), []);

    const handle = new ConceptKernel(kernelUrn, transport, store, affordances, opts);

    // Subscribe the granted result/event scope; granted events feed the cache.
    if (typeof transport.subscribe === 'function') {
      const unsub = transport.subscribe(kernelUrn, (msg) => store.ingest(msg));
      if (typeof unsub === 'function') handle._unsubs.push(unsub);
    }

    // Hydrate current state when instance.snapshot is reachable + granted (closes F-E client-side).
    if (opts.hydrate !== false) {
      const snap = await withDeadline(handle.snapshot(), []);
      if (Array.isArray(snap) && snap.length) store.ingest(snap);
    }

    return handle;
  },
};

export default CK;
