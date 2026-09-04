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
export const VERSION = '1.6.5';
const CORE_NS = 'https://conceptkernel.org/ontology/v3.11/core#';   // v3.12 root keeps the v3.11 core ns (measured in core.ttl)

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
  // v1.6.3 (R11.1, pgCK 0.4.108/109): the clock surface — exposed via `k.clock`.
  nextCrossing: 'orbit.next',
  tick: 'score.tick',
  boundary: 'signal.boundary',
};

// v1.6.1 (R3.3) / v1.6.3 (R10.1): the refusal set is the substrate's CLOSED registry
// (surface.refusals) — cache on registryDigest, NEVER on a count: the registry moves
// (C-15 alone added five codes) and a count is a coincidence waiting to happen.
// Carrying extra aliases here silently widens the set. One code, verbatim.
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

/** v1.6.3 (R10.3, pgCK C-15/B7-L7): with every refusal site typed (89→0 at 0.4.106), the
 *  classifier finally runs on data — FOUR outcomes: 'result' · 'refusal' · 'fault' · 'delegated'.
 *  sqlstate 0A000 is the DELEGATE SEAM (verb_delegated: "not refused-by-law — not served at
 *  THIS tier") — neither a law refusal nor a fault; flattening it into either misreports which
 *  plane spoke. And pgRDF's stronger rule: ok:false with a non-XX sqlstate IS a refusal even
 *  without the flag — XX is the only class a genuine fault carries. No sqlstate, no flag
 *  (timeout, transport death) stays 'fault': no verdict was reached. */
export const outcomeOf = (r) => (r && r.ok === true) ? 'result'
  : (r && r.sqlstate === '0A000') ? 'delegated'
  : (r && r.refused === true) ? 'refusal'
  : (r && r.ok === false && typeof r.sqlstate === 'string' && r.sqlstate.length > 0 && !r.sqlstate.startsWith('XX')) ? 'refusal'
  : 'fault';

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
  // #15, extended to ALL FIVE STAMPS (v1.6.3 R8, pgCK C-7 0.4.107): `createdBy` /
  // `sealedAtEpoch` / `producedBy` / `conformsToShape` / `onBehalfOf` are PASS-THROUGH —
  // surfaced verbatim, never interpreted, null when absent. NEVER aggregated into one boolean:
  // they answer five different questions and fail five different ways.
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
    // v1.6.4 (R24.1): ownedBy joins the pass-through — and it is the ODD ONE OUT. The other
    // stamps are server-derived and a forged value is stripped; `ownedBy` is measured
    // CLIENT-ASSERTED at create (2026-09-04: a forged urn:ckp:participant:00000000-… sealed
    // verbatim). Surfacing it is how a caller can SEE who a row claims to belong to, since the
    // door does not decide it. Null-honest when absent, like every other stamp.
    ownedBy: reply.ownedBy ?? null,
    conformsToShape: reply.conformsToShape ?? null,
    // v1.6.3 (R8.3): ABSENCE IS THE SIGNAL — null means the participant acted directly.
    // The substrate never stamps "on behalf of myself"; this client never synthesises one,
    // and never renders absence as unknown or an error. Present ⇒ an Agent sealed for a
    // participant. It says WHO WAS ACTED FOR, never what did the acting (processRef/
    // executingHost stay unfilled — the Run model-identity gap is not closed by this stamp).
    onBehalfOf: reply.onBehalfOf ?? null,
    // v1.6.5 (R27.3, PASS-16 §1.2): THE AT BAND. An Adoption seal reply carries `reference`
    // {sourceDigestMatch, sourceRecorded, moduleResolves, targetHasGraphs} and check-keyed
    // `warnings[]` — THE SEAL STANDS either way (B4), and a caller reading its own receipt knows
    // at the act. Passed through on EVERY write, null-honest when absent: only Adoption seals
    // carry `reference` today, but any seal may carry warnings, and dropping them was the lie
    // the ck-traps entry "validate can affirm a body that create then warns about" describes.
    reference: reply.reference ?? null,
    warnings: Array.isArray(reply.warnings) ? reply.warnings : null,
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
            // R6.5 (A-14) + Q-4 contract (pgCK PASS-7 §4): NEVER in headers. Result replies carry
            // flat camelCase; EVENT bodies are the sealed instance verbatim, so the key is the full
            // IRI. Two spellings by frame class — both in the contract, no invented aliases.
            sealedAtEpoch: m?.data?.sealedAtEpoch
              ?? m?.data?.['https://conceptkernel.org/ontology/v3.11/core#sealedAtEpoch'] ?? null,
            // v1.6.3 (R8.2): the fifth stamp rides the same two-spellings-by-frame-class
            // contract as sealedAtEpoch — flat camelCase on result replies, FULL-IRI key on
            // event bodies, NEVER read from headers, no invented third alias.
            onBehalfOf: m?.data?.onBehalfOf
              ?? m?.data?.['https://conceptkernel.org/ontology/v3.11/core#onBehalfOf'] ?? null,
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

  /** v1.6.4 (R18, PASS-14 C-3): capability is a TWO-ARRAY answer, and `affordances: []` is not
   *  "this kernel has no capabilities".
   *
   *  Measured 2026-09-04 on pgck.localhost: a kernel germinated after the last boot answers
   *  `affordances: []` with **40 verbs in `unsealed`**. Germination does not seal affordances
   *  and the backfill is boot-only, so the LEDGER is empty while the ROUTER is full. Reading
   *  only the first array reports 40 routed verbs as an absence.
   *
   *  Dispatched fresh rather than read off activation state: `[]` is an answer about THIS
   *  moment, and the boot backfill can change it under a long-lived handle.
   *
   *  RENDERING RULE (R18.3): never gate capability on `declared.length` alone. With
   *  `declared 0 / routed 40` the honest rendering is "declared: none yet · routed: 40" — the
   *  #56 declared/routed gap made visible, never mistaken for absence. */
  async capabilities() {
    const r = await this.do('affordances', {});
    if (r && r.ok === false) throw refusalError('affordances', r);
    const declared = Array.isArray(r?.affordances) ? r.affordances : [];
    const unsealed = Array.isArray(r?.unsealed) ? r.unsealed : [];
    const routed = [...new Set([...declared, ...unsealed])];
    return { declared, routed, unsealed, gap: routed.length - declared.length };
  }

  /** v1.6.5 (R29): the seat's ledger health — `integrity.check`, verbatim. Measured 2026-09-04 @
   *  0.4.111: healthy:false with findings naming Adoptions whose claimed digest no sealed Module
   *  vouches for. Same _nsCall contract; a refusal throws. */
  async integrity(payload = {}) { return this._nsCall('integrity.check')(payload); }

  /** v1.6.1 (R4.2 / N-2, N-3): the read-only checker surface, learnable BEFORE writing.
   *  `declared({type})` is the property contract; `refusals()` the closed refusal set. */
  /** One refusal-throwing call shape for every read-namespace verb (surface.* and clock.*) —
   *  a single helper, so the refusal contract cannot drift between namespaces (v1.6.3 dedup). */
  _nsCall(verb) {
    return async (payload = {}) => {
      this._assertOpen();
      const r = await this.do(verb, payload);
      if (r && r.ok === false) throw refusalError(verb, r);
      return r;
    };
  }

  get surface() {
    // memoized — one object per handle, stable identity, zero per-access allocation
    return this._surfaceNS ??= {
      check: this._nsCall('surface.check'),
      refusals: this._nsCall('surface.refusals'),
      typecheck: this._nsCall('surface.typecheck'),
      declared: this._nsCall('surface.declared'),
      unshaped: this._nsCall('surface.unshaped'),
      grounding: this._nsCall('surface.grounding'),
      /** v1.6.4 (R20) — the ONLY honest cache key for a surface-derived read.
       *  `surface.*` answers about the COMPOSED SURFACE OF THE ACTING KERNEL, not the door:
       *  measured 2026-09-04, one door, same minute — seat `ck-lib-js` reads
       *  `core#Kernel → shaped false` over `urn:ckp:ck-lib-js/shapes/composed` (b62f4618…)
       *  while seat `pgck`, with wave+lexicon adopted, reads materially different values.
       *  Neither is wrong. So the key binds (kernel, surfaceDigest) and a reply without a
       *  digest yields NO key — throwing beats silently keying on the door and serving one
       *  seat's law to another. `surface.grounding` is the door-scoped question; these are not. */
      key: (reply) => {
        const d = reply?.surfaceDigest;
        if (!d) throw new Error('surface.key: reply carries no surfaceDigest — a surface read is SEAT-scoped (CK-DOOR v1.6.4 R-29) and cannot be cached on the door alone');
        return `${reply.kernel ?? this.name}|${d}`;
      },
      /** v1.6.4 (R21) — cache the refusal registry on `registryDigest`, NEVER on `count`.
       *  Measured + sourced: at least one code (`dependent_objects`) is seeded in
       *  pgck-baseline.sql and in NO migration, so a fresh CREATE EXTENSION and a door walked
       *  up the ALTER EXTENSION chain end up with DIFFERENT registries — permanently, at the
       *  SAME extversion. A door's refusal set is a property of its INSTALL HISTORY, not its
       *  version, so never infer a code's existence from a version comparison: gate on presence
       *  in the fetched set. The exact totals are deliberately NOT written here — baking one in
       *  is the very defect this key exists to prevent (and the purge gate enforces it). */
      refusalsKey: (reply) => {
        const d = reply?.registryDigest;
        if (!d) throw new Error('surface.refusalsKey: reply carries no registryDigest — the code COUNT is a coincidence, never a cache key (CK-DOOR v1.6.4 R-30)');
        return d;
      },
    };
  }

  /** v1.6.4 (R21.3) — door identity, with `build_id` beside `version`.
   *  Two doors reporting `0.4.109` are distinguishable ONLY by build_id, and one such id
   *  (`v0.4.108-1-g1e5ff13`) names a commit present in no branch — a third party cannot fetch
   *  it. Surfacing it makes that visible instead of mysterious. Absent identity reads null
   *  across the board: never inferred from the version, never invented. */
  async doorIdentity() {
    const r = await this.do('surface.check', {});
    if (r && r.ok === false) throw refusalError('surface.check', r);
    const e = r?.engineIdentity ?? {};
    const out = { state: e.state ?? null, version: e.version ?? null, buildId: e.build_id ?? null,
                  extversion: e.extversion ?? null, agreement: e.agreement ?? null,
                  // v1.6.5 (R31, PASS-16 §0): THE LAW SURFACE IS extversion — never version(), and
                  // never the version string. Measured 2026-09-04: extversion 0.4.112 with every
                  // 0.4.112 capability LIVE while version() read 0.4.111 (the loaded .so trails until
                  // a natural restart). `diverged` is the documented lag, rendered with its cure —
                  // not an error, not 0.4.111. Capability is probed by REPLY SHAPE (validate's
                  // `reference`), never gated on either string. `agreement` is passed through
                  // untouched: reporting the lag is not softening it.
                  lawSurface: e.extversion ?? null, note: null };
    if (out.state === 'diverged') out.note =
      `extversion ${out.extversion} is the law surface in force; version() ${out.version} is the loaded .so and trails until a natural restart — the documented lag, not a fault (pgCK PASS-16 §0). Never gate on version() or wait for agreement; probe capability by reply shape.`;
    return out;
  }

  /** v1.6.3 (R11): the clock surface — three verbs, zero interpretation, one rendered limit.
   *  THE CONSTITUTIONAL LIMIT (CK-DOOR v1.6.3 R-20, law predating the mechanism): a Score
   *  crossing thresholdPromote DRAFTS a Proposal — the tick never seals content, votes, or
   *  applies. A tick result is an agenda item with its evidence already gathered, NEVER a
   *  decision; a draft's one affordance is PROMOTE, a person's own sealed act.
   *  Two clocks, never collapsed (R-21): the tick is an escapement (bounded interval, no
   *  opinion about the hour); orbits are the gear train (period/lead/seat/anchor — LAW on the
   *  sealed Kernel, seat server-driven, all governed via set_kernel_policy). The escapement
   *  is not a scheduler: crossings ENQUEUE, the drain is fair, failing jobs park at five. */
  get clock() {
    // no_orbit_declared (42704) throws via _nsCall verbatim: "no orbit is a real answer, not
    // a zero" — this client renders "this kernel keeps no clock", never a fabricated time.
    // Memoized — one object per handle, stable identity, zero per-access allocation.
    return this._clockNS ??= {
      /** orbit.next — the next crossing, third-party re-derivable: the reply's `method`
       *  string IS the formula (anchor + ceil((now-anchor)/period)*period). Render the
       *  server's value as the answer (zero client authority); re-derive only to corroborate
       *  — a disagreement is a finding to file, not a value to prefer. Geometry MAY be drawn
       *  (nextCrossing, prepareOpensAt — labelled as law-derived); outcomes MAY NOT. */
      next: this._nsCall(OP_VERB.nextCrossing),
      /** score.tick — Scores DERIVED under the kernel's own law; the reply's `law` object
       *  says which value governed each number (declared override or NAMED substrate
       *  default — absence means "the substrate default governs", a real answer). Computes
       *  the PROMOTE half only: defer/discard stay human-read until the weights are earned,
       *  and decay is declared law, NOT applied — present neither as computed. One standing
       *  draft per CONCEPT, never per crossing. */
      tick: async (payload = {}) => {
        const r = await this._nsCall(OP_VERB.tick)(payload);
        if (r && r.epochUnchanged === false) {
          // The one interpretation the limit itself licenses: a tick that moved the epoch is
          // a DOOR VIOLATION of CK-DOOR R-20 — said, with the reply attached, never rendered
          // as a result. File it as a ledger regression with this reply verbatim (§11.10).
          const e = new Error('score.tick: door reported epochUnchanged:false — the tick may DRAFT only (CK-DOOR v1.6.3 R-20); a tick that advances the epoch is a door violation, not a result');
          e.reply = r;
          throw e;
        }
        return r;
      },
      /** signal.boundary — ONE hash-chained boundary head per boundary, never per event; the
       *  raw presence trace stays organ-local (R-14).
       *
       *  v1.6.4 (R23, PASS-14 §6) — THE PAYLOAD CONTRACT IS `{about, dwellMillis, events}`:
       *  `about` is the concept IRI, `dwellMillis` the dwell, `events` the count. Measured
       *  2026-09-04: `{concept, boundary, dwellMillis}` is refused `missing_param` / 22004 with
       *  the hint naming the right keys. The semantics were documented upstream WITHOUT the
       *  keys, so a client written from that prose hits the refusal on its first call — this
       *  comment is cheaper than the round trip. **No local requiredness check is added**
       *  (R23.2): the substrate's hint is better than anything this client would invent, and
       *  inventing one would be a default carrying wire meaning. {ok:true, sealed:false, reason:
       *  'never_saw'} is a SUCCESS and returns normally: the absence of a Signal is correctly
       *  free, and sealing a zero would manufacture evidence of an encounter that did not
       *  happen. Never rendered as a failure, an error, or a retryable condition. */
      boundary: this._nsCall(OP_VERB.boundary),
    };
  }

  /** v1.6.4 (R17, PASS-14 §2/§3): the adoption surface — the ONLY verification path for a
   *  module's sealed `sourceDigest` against the bytes the loader actually consumed.
   *
   *  A fabricated digest still SEALS — deliberate, and correct: a report may be wrong cheaply,
   *  a gate may not, and a byte gate in the composition hot path is the s68 deadlock class. It
   *  is detectable ON DEMAND, and that is the whole contract. Same `_nsCall` as surface/clock,
   *  so the refusal behaviour cannot drift. Memoized. */
  get adoption() {
    return this._adoptionNS ??= {
      check: this._nsCall('adoption.check'),
      /** v1.6.5 (R29): the census — the DOWNSTREAM rung `dryRun()` mirrors word for word. */
      census: this._nsCall('fleet.adoptions'),
      /** v1.6.5 (R25.1, PASS-15 §3.1 / PASS-16 §1): THE LOADER RECORD for one module IRI, readable
       *  BEFORE adoption — one read, zero writes, no digest sent.
       *
       *  MEASURED 2026-09-04 @ extversion 0.4.112: `instance.validate {type: core#Adoption, adopts}`
       *  answers `reference.sourceRecorded` (sha256 of the bytes the parser consumed, pgRDF#118)
       *  for a module this seat has NEVER adopted — the reference band is computed beside the
       *  SHACL report, independent of `conforms`. That is the pre-adoption read PASS-15 assumed
       *  and 0.4.111 lacked (CK-DOOR R-34, met at 0.4.112 through this band). `adoption.check`
       *  carries the same column but only for modules already adopted into the acting project
       *  (payload-blind, R-35) — it stays the CONFIRMATION read (sourceLoads, drift, both pin
       *  planes): see `row()`.
       *
       *  Returns `{ module, moduleResolves, sourceRecorded, reference }` from the band, verbatim.
       *  `moduleResolves:false` is absence (the census's malformed class); `sourceRecorded:null` on
       *  a resolving module is the pgRDF#120 boundary (an unrecorded load), never "fine". A door
       *  WITHOUT the band (pre-0.4.112) answers `reference:null` + a note — the caller sees the
       *  door's capability, never a guess, and nothing is read from a second source. */
      recorded: async (adopts) => {
        if (!adopts) throw new Error('adoption.recorded: `adopts` (the module graph IRI, e.g. urn:ckp:module:wave) is required and has no default');
        const r = await this.validate({ type: `${CORE_NS}Adoption`, adopts });
        if (!r.reference) return { module: adopts, moduleResolves: null, sourceRecorded: null, reference: null,
          note: 'this door answered no reference band on instance.validate — a pre-0.4.112 law surface, where the loader record is unreadable before adoption (CK-DOOR R-34). Probe capability by reply shape, never by version string.' };
        return { module: adopts, moduleResolves: r.reference.moduleResolves ?? null,
                 sourceRecorded: r.reference.sourceRecorded ?? null, reference: r.reference };
      },
      /** v1.6.5 (R25.3): the seat's ADOPTION ROW for one module — `adoption.check`, filtered
       *  client-side because the verb is payload-blind (R-35). Null before this seat adopts it.
       *  Carries what the reference band does not: `sourceLoads`, `drifted`, both pin planes. */
      row: async (adopts) => {
        if (!adopts) throw new Error('adoption.row: `adopts` (the module graph IRI) is required and has no default');
        const r = await this.adoption.check();
        const rows = Array.isArray(r?.modules) ? r.modules : [];
        return rows.find((m) => m && m.module === adopts) ?? null;
      },
      /** v1.6.5 (R32, PASS-16 T5): the repair half of the cure — a core#Supersession citing the
       *  Adoption's SEALED @id. Never the module IRI: the door refuses that form with misdirecting
       *  text (SPORE §5.1b, known), so it is refused HERE by name first. Measured: the declared
       *  shape needs only `supersedes` (intoProject optional). */
      supersede: async (adoptionId) => {
        this._assertOpen();
        if (!adoptionId) throw new Error("adoption.supersede: the Adoption's sealed @id (the receipt's .urn / .id) is required and has no default");
        if (/^urn:ckp:module:/.test(String(adoptionId))) {
          const e = new Error(`adoption.supersede: ${adoptionId} is a MODULE IRI — a Supersession cites the ADOPTION's sealed @id (the receipt's .urn / .id), never the module. The door refuses the module form with misdirecting text (SPORE §5.1b, known); refused here by name instead.`);
          e.refused = false; e.sqlstate = null; e.localGuard = 'R32'; throw e;
        }
        // MEASURED 2026-09-04 @ 0.4.112, twice: (1) `supersedes` carries sh:nodeKind IRI — a BARE id
        // (what a create receipt's `id` holds) is refused as a literal; (2) the census (`fleet.adoptions`)
        // joins a Supersession to its Adoption on the EXACT STRING of the sealed @id (`ckp://Adoption#<id>`),
        // so a Supersession citing E-5's `urn:ckp:instance:<id>` form CONFORMS, SEALS, VERIFIES — and
        // supersedes nothing (specimen supersession-1788559143211182000). The only honest cite is the
        // sealed @id READ OFF THE DOOR, verbatim — derive, never compose (the digest rule, applied to ids).
        // One read; an unresolvable id is E-5's 42704 refusal, thrown verbatim.
        const g = await this.do(OP_VERB.get, { id: adoptionId });
        if (g && g.ok === false) throw refusalError('adoption.supersede', g);
        const sealed = g?.instance?.body?.['@id'] ?? g?.instance?.['@id'] ?? g?.result?.body?.['@id'] ?? g?.result?.['@id'] ?? null;
        if (!sealed) {
          const e = new Error(`adoption.supersede: the door answered instance.get for ${adoptionId} without a sealed @id — nothing to cite. A Supersession must name the Adoption's sealed @id verbatim (the census joins on that exact string); this client composes none.`);
          e.refused = false; e.sqlstate = null; e.localGuard = 'R32'; throw e;
        }
        const w = writeResult(await this.do(OP_VERB.create, { type: `${CORE_NS}Supersession`, supersedes: sealed }));
        return Object.assign(w, { supersedes: sealed });
      },
      /** v1.6.5 (R26): the dry-run — a REPORT in the census's own vocabulary. Never throws on a
       *  finding; throws only when a read is refused at the wire. See _adoptionDryRun. */
      dryRun: (opts) => this._adoptionDryRun(opts),
      /** v1.6.5 (R27): dry-run → seal → check, one gesture. See _adopt. */
      adopt: (opts) => this._adopt(opts),
      /** R17.3 — the verify-then-load gate, as a STRUCTURAL verdict, not a boolean dressed as
       *  authority. Reads flags the substrate sent; composes no new fact.
       *    adopt by digest → sourceDigestMatch === true AND sourceLoads === 1
       *                    → verify-proof over the code path → THEN load.
       *  `sourceLoads > 1` disqualifies for CODE: a graph loaded twice can match its LAST load
       *  and still not be what the first Adoption saw. */
      loadable: (report = {}) => {
        const { sourceDigestMatch = null, sourceLoads = null } = report ?? {};
        const reasons = [];
        // R17.2 — three values, three meanings. `null` is UNKNOWN, never "fine": sourceRecorded
        // is populated by pgRDF's turtle funnel ONLY, so staged/bulk/n-quads loads record
        // nothing. Until pgRDF#120 closes, anything loading CODE treats null exactly as false.
        if (sourceDigestMatch === false) reasons.push('sourceDigestMatch is false — the sealed claim does not equal the bytes the parser consumed. A finding, always.');
        if (sourceDigestMatch === null) reasons.push('sourceDigestMatch is null — one side absent, so this is UNKNOWN, never fine. sourceRecorded comes from pgRDF\'s turtle funnel only (staged/bulk/n-quads record nothing, pgRDF#120 open); for anything that loads CODE, treat null exactly like false.');
        if (sourceLoads !== 1) reasons.push(`sourceLoads is ${JSON.stringify(sourceLoads)} — code requires exactly 1. A graph loaded more than once can match its LAST load and still not be what the first Adoption saw.`);
        const verdict = (sourceDigestMatch === true && sourceLoads === 1) ? 'verified'
          : (sourceDigestMatch === null && sourceLoads === 1) ? 'unknown' : 'refused';
        return { verdict, sourceDigestMatch, sourceLoads, reasons };
      },
    };
  }

  /** v1.6.5 (R26, PASS-15 §3.2 → PASS-16 §2) — THE DRY-RUN. `instance.validate` IS the dry-run
   *  (0.4.112 PRE): the composed Adoption body goes through it and the reply's `reference` +
   *  check-keyed `warnings` come back verbatim. The wire-side approximation PASS-15 asked for was
   *  retired before it shipped — this facade keeps its result shape while the door does the work.
   *
   *  FINDINGS are the client's closed vocabulary over the door's own checks, each carrying the
   *  door's prose where it has some, and named for the DOWNSTREAM census verdict it predicts:
   *    module_absent     ← reference.moduleResolves:false   ⇒ would seal `malformed`
   *    target_no_graphs  ← reference.targetHasGraphs:false  ⇒ would seal `orphaned`
   *    digest_*          ← the R25.2 digest rule            ⇒ sourceDigestMatch false/null after
   *    shape_violation   ← conforms:false on the COMPOSED body ⇒ the seal would be REFUSED (the
   *                        SHACL plane — the other plane, stated, never folded)
   *    module_drifted · source_reloaded (warn) ← adoption.check row, on re-adoption
   *  RETRACTED (measured 2026-09-04): v1.6.5's first draft inferred `orphaned` from seat state
   *  (`state !== 'germinated'`); this `named` seat answers targetHasGraphs:TRUE — a ghost project
   *  holds graphs. The door's check replaces the inference. Nothing here is a client verdict.
   *
   *  SCOPE IS THE ACTING SEAT, stated: intoProject is DERIVED from the handle's kernel (the seat
   *  the caller chose at activate — not a default constant) and intoEpoch from surface.check.
   *  Adopting into a FOREIGN project is the raw door's job (k.do); the census judges it after.
   *
   *  R25.2 — THE DIGEST RULE, in order: a malformed value refuses before any I/O; a supplied value
   *  is validated as-composed and the door's sourceDigestMatch decides (false ⇒ refuse naming the
   *  record; `transcribed:true` does NOT override a record); no value ⇒ ONE probe read of the
   *  loader record (recorded()) derives it, and the composed body is validated again so the PRE
   *  verdict is on the exact bytes that will be sealed; no record ⇒ stop by name — the ONLY way
   *  past is a value the caller spells as transcribed. Derivation, not a failover (SPEC §0.5.1). */
  async _adoptionDryRun({ adopts, sourceDigest = null, transcribed = false } = {}) {
    this._assertOpen();
    if (!adopts) throw new Error('adoption.dryRun: `adopts` (the module graph IRI, e.g. urn:ckp:module:wave) is required and has no default');
    const findings = [];
    const f = (code, severity, message, check = null, read = 'instance.validate') => findings.push({ code, severity, check, message, read });
    const digest = { derived: null, supplied: sourceDigest ?? null, source: null, agrees: null };
    if (digest.supplied != null && !/^[0-9a-f]{64}$/.test(String(digest.supplied))) {
      f('digest_malformed', 'refuse', `sourceDigest ${JSON.stringify(digest.supplied)} is not 64 lowercase hex — AdoptionShape's own pattern (^[0-9a-f]{64}$, declared law), applied before any I/O. A truncated or padded digest is a fabricated pin.`, 'sourceDigestMatch', 'local');
      return { ok: false, findings, body: null, seat: null, reference: null, warnings: null, conforms: null, violations: null, row: null, digest };
    }
    // Reads — each through its facade: a wire REFUSAL throws verbatim; no finding stands in for one.
    const seatR = await this.surface.check();
    const seat  = { kernel: seatR?.kernel ?? this.name, state: seatR?.state ?? null, epoch: seatR?.epoch ?? null,
                    intoProject: `urn:ckp:project:${this.name}` };
    const row   = await this.adoption.row(adopts);
    const base  = { type: `${CORE_NS}Adoption`, adopts, intoProject: seat.intoProject, intoEpoch: seat.epoch };
    let pre;
    if (digest.supplied != null) {
      pre = await this.validate({ ...base, sourceDigest: digest.supplied });
      const ref = pre.reference;
      if (ref && ref.sourceDigestMatch === true)       { digest.derived = digest.supplied; digest.source = 'recorded'; digest.agrees = true; }
      else if (ref && ref.sourceDigestMatch === false) { digest.agrees = false; }
      else if (transcribed === true)                   { digest.derived = digest.supplied; digest.source = 'transcribed'; }
    } else {
      const rec = await this.adoption.recorded(adopts);
      if (rec.sourceRecorded) { digest.derived = rec.sourceRecorded; digest.source = 'recorded'; }
      pre = await this.validate(digest.derived ? { ...base, sourceDigest: digest.derived } : base);
    }
    const ref = pre?.reference ?? null;
    const doorSays = (check) => (pre?.warnings ?? []).find((w) => w && w.check === check)?.resultMessage ?? null;
    if (ref) {
      if (ref.moduleResolves === false) f('module_absent', 'refuse',
        doorSays('moduleResolves') ?? `${adopts} names no non-empty graph on this door — sealed, this adoption would compose NOTHING (the census's malformed class).`, 'moduleResolves');
      if (ref.targetHasGraphs === false) f('target_no_graphs', 'refuse',
        doorSays('targetHasGraphs') ?? `${seat.intoProject} holds no graphs on this door — the adoption would be reachable by no composed surface (the census's orphaned class).`, 'targetHasGraphs');
    } else {
      f('reference_unavailable', 'warn', 'this door answered no reference band on instance.validate (pre-0.4.112 law surface) — module presence and target graphs were not checked by the door. Probe capability by reply shape, never by version string.', null);
    }
    if (digest.agrees === false) f('digest_disagrees', 'refuse',
      (doorSays('sourceDigestMatch') ?? `the loader recorded ${ref?.sourceRecorded} for ${adopts}; you supplied ${digest.supplied}.`) +
      ` A record beats a transcription unconditionally (transcribed:true does not override it) — the PASS-15 §1 incident, caught before the wire. Drop the value and the record is used.`, 'sourceDigestMatch');
    if (digest.derived == null && digest.agrees !== false) {   // a DISAGREEING value is derivable — it is wrong, not unreadable
      if (!ref) f('digest_underivable', 'refuse',
        `this door exposes no loader record before adoption (no reference band — pre-0.4.112; CK-DOOR R-34). A transcribed digest is not constructible through adopt() unless you say so: pass { sourceDigest, transcribed: true } and it is checked against the door right after the seal.`, 'sourceDigestMatch');
      else if (ref.moduleResolves === false) f('digest_underivable', 'refuse',
        `nothing is recorded for ${adopts} because no graph by that IRI exists here — place the module first (proximity is not adoption).`, 'sourceDigestMatch');
      else f('digest_underivable', 'refuse',
        `${adopts} is placed on this door but its load was never recorded (sourceRecorded null — pgRDF#120: only the turtle funnel records; staged/bulk/n-quads loads do not). Nothing on the door can vouch for a digest. Pass { sourceDigest, transcribed: true } to say YOU are vouching — and expect sourceDigestMatch:null after the seal, which for anything loading code is exactly false.`, 'sourceDigestMatch');
    }
    if (digest.source === 'transcribed') f('digest_unverifiable', 'warn',
      `sourceDigest ${digest.supplied} is TRANSCRIBED — the door holds no record to check it against (sourceDigestMatch null). The receipt will say digestSource:'transcribed'; for anything loading code treat this exactly like false.`, 'sourceDigestMatch');
    if (digest.derived && pre && pre.conforms === false) f('shape_violation', 'refuse',
      `the composed body does not conform to AdoptionShape — the seal would be REFUSED on the SHACL plane (not the reference plane): ` +
      (pre.violations ?? []).map((v) => `${String(v.resultPath ?? '').split('#').pop()}: ${v.resultMessage}`).join(' · '), null);
    if (row?.drifted === true) f('module_drifted', 'warn',
      `${adopts} has drifted from its first-composition pin on this door (adoption.check drifted:true) — adopting now pins the MOVED bytes. A legitimate update arrives as a new Adoption + Supersession; say which this is.`, null, 'adoption.check');
    if (row && row.sourceLoads != null && row.sourceLoads > 1) f('source_reloaded', 'warn',
      `${adopts} was loaded ${row.sourceLoads} times on this door — whole-graph byte identity no longer holds, and for CODE the R17.3 gate will refuse.`, null, 'adoption.check');
    const ok = !findings.some((x) => x.severity === 'refuse');
    return { ok, findings, body: digest.derived ? { ...base, sourceDigest: digest.derived } : null, seat,
             reference: ref, warnings: pre?.warnings ?? null, conforms: pre?.conforms ?? null, violations: pre?.violations ?? null,
             row, digest };
  }

  /** v1.6.5 (R27, PASS-15 §3.3 / PASS-16 §2) — ADOPT: dry-run → seal → confirm, one gesture, no step
   *  skippable. A `refuse` finding throws LOCALLY in R24's shape (refused:false, sqlstate:null — no
   *  server refused anything; this client declined to send). The seal reply carries the AT band
   *  (`reference` + `warnings`, via writeResult) so reference health is on the receipt with zero
   *  extra round-trips; the post-seal `adoption.check` row is CONFIRMATION (sourceLoads, drift, pin
   *  planes) and yields the R17.3 verdict. A WIRE refusal at the seal returns the verdict-shaped
   *  writeResult (T-D2) and attempts no confirmation. R27.2 — a confirmation that cannot run
   *  NEVER hides a seal that landed: the receipt keeps the id and carries check:null + checkError. */
  async _adopt(opts = {}) {
    const dry = await this._adoptionDryRun(opts);
    if (!dry.ok) {
      const refuse = dry.findings.filter((x) => x.severity === 'refuse');
      const e = new Error(
        `adopt: refusing to originate an Adoption of ${opts.adopts} — ` +
        refuse.map((x) => `[${x.code}] ${x.message}`).join(' · ') +
        ` The door would have SEALED it (adoption.check reports and does not gate — CK-DOOR R-26, deliberate); ` +
        `this client is the gate the substrate deliberately is not (CK-DOOR R-36).`);
      e.refused = false; e.sqlstate = null; e.localGuard = 'R25'; e.findings = dry.findings; e.dryRun = dry;
      throw e;
    }
    const w = writeResult(await this.do(OP_VERB.create, dry.body));
    if (!w.ok) return w;                                        // T-D2: verdict-shaped, no confirmation
    Object.assign(w, { digestSource: dry.digest.source, dryRun: dry, check: null, checkError: null });
    try {
      const row = await this.adoption.row(opts.adopts);
      if (row) {
        const v = this.adoption.loadable(row);
        w.check = { sourceDigestMatch: row.sourceDigestMatch ?? null, sourceRecorded: row.sourceRecorded ?? null,
                    sourceLoads: row.sourceLoads ?? null, drifted: row.drifted ?? null, verdict: v.verdict, reasons: v.reasons };
      } else {
        w.checkError = `adoption.check answered after the seal but lists no row for ${opts.adopts} — the seal LANDED (id ${w.id}); its verdict is UNKNOWN. Re-read k.adoption.row() before loading anything.`;
      }
    } catch (e) {
      w.checkError = `post-seal adoption.check did not answer (${e.message}) — the seal LANDED (id ${w.id}); its verdict is UNKNOWN until k.adoption.row() answers. Never retry the seal.`;
    }
    if (w.id) this._store.ingest({ '@id': w.id, '@type': dry.body.type, ...dry.body });
    return makeRef(this, w);
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

  /** v1.6.4 (R24.2) — the ownership PRE-FLIGHT. Reads the target row and refuses to ORIGINATE
   *  a write against one this connection did not create.
   *
   *  ⚠ THIS IS A PATTERN GUARD, NOT A CONTROL (R24.5). Measured 2026-09-04 on a virgin
   *  pgck.localhost with two distinct verified bearers: the write SUCCEEDS server-side and
   *  REWRITES `createdBy` to the patcher. Nothing in this client closes that — the door
   *  authorises it (CK-DOOR v1.6.4 §13.4, R-33, declared UNMET). One `k.do()` bypasses this
   *  guard entirely, by design: it is here to make the exposure visible and to stop cklib
   *  callers doing it by accident, never to claim the floor exists.
   *
   *  R24.2a — it fires ONLY when it knows. A refused/faulted/empty pre-flight read, or an
   *  undeterminable own-sub, STANDS DOWN and lets the write proceed: the server's own answer
   *  is more informative than a client guess, and substituting an instance.get refusal for an
   *  instance.update one would be the failover the charter forbids. */
  async _assertMayWrite(op, id, opts = {}) {
    if (opts.crossOwner === true) return;                       // R24.3 — explicit, per-call
    const sub = this._transport?.auth?.claims?.sub ?? this._transport?.auth?.userId ?? null;
    if (!sub || id == null) return;                             // cannot know → stand down
    let row = null;
    try { row = await this.get(id); } catch { return; }         // refused/faulted → stand down
    if (!row) return;
    const CORE = 'https://conceptkernel.org/ontology/v3.11/core#createdBy';
    const by = row[CORE] ?? row.createdBy ?? row.body?.[CORE] ?? null;
    if (!by) return;                                            // unstamped → stand down
    const mine = by === `urn:ckp:participant:${sub}` || String(by).endsWith(sub);
    if (mine) return;
    // R24.4 — a LOCAL refusal. It is not dressed as a wire verdict: refused:false, sqlstate:null,
    // no `reply`, because no server refused this. The client declined to send.
    const e = new Error(
      `${op}: refusing to originate a write against a row created by ${by} — this connection is ` +
      `urn:ckp:participant:${sub}. The door does NOT gate this (CK-DOOR v1.6.4 R-33, measured UNMET): ` +
      `the write would SUCCEED and would rewrite createdBy to you, erasing the creator. ` +
      `This is a client pattern guard, not a control. Pass { crossOwner: true } if deliberate.`);
    e.refused = false; e.sqlstate = null; e.localGuard = 'R24';
    throw e;
  }

  // ── Named conveniences (sugar over `do`, mapped via OP_VERB) ────────────────

  async create(type, body = {}) {
    // v1.6.5 (R28): ONE way to compose an Adoption through this facade, and it is the checked one.
    // k.do('instance.create', …) remains the raw door, exactly as it bypasses R24 — a pattern guard
    // at the facade is never a claim about the wire.
    if (type === 'https://conceptkernel.org/ontology/v3.11/core#Adoption') return this._adopt(body);
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
  async update(id, patch = {}, opts = {}) {
    await this._assertMayWrite('update', id, opts);             // R24.2 — before the write
    return writeResult(await this.do(OP_VERB.update, { id, patch }));
  }
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
  async retire(id, reason, opts = {}) {
    await this._assertMayWrite('retire', id, opts);             // R24.2 — before the write
    return writeResult(await this.do(OP_VERB.retire, { id, reason }));
  }
  // U7 (v1.5.13, D1): same rule as writeResult — `verified` is the substrate's verdict verbatim,
  // absent means null. A proof digest attests hashing/chaining, never conformance; manufacturing
  // one from the other was the exact defect #16 removed one function over.
  // v1.6.3 (final audit, charter §2): READS THROW on a refusal; writes return the verdict-
  // shaped result (T-D2). These three were v1.6.1 leftovers on the wrong side of that split —
  // a refusal rendered as verdict-unknown / a raw body / an empty array respectively.
  async verify(id) { const r = await this.do(OP_VERB.verify, { id }); if (r && r.ok === false) throw refusalError('verify', r); return { verified: r?.verified ?? null, proof_digest: r?.proof_digest ?? null, seq: r?.seq }; }
  async provenance(id, depth) { const r = await this.do(OP_VERB.provenance, { id, depth }); if (r && r.ok === false) throw refusalError('provenance', r); return r?.result ?? r; }
  async snapshot(scope) { const r = await this.do(OP_VERB.snapshot, scope ? { scope } : {}); if (r && r.ok === false) throw refusalError('snapshot', r); return r?.result ?? []; }
  /** TE-4: governed concept.match (pgCK T6, ≥0.4.13) — full-text or token match against the kernel's
   *  declared concept index; returns the `candidates` array (REPLY_FIELD normalised to `.result`).
   *  v1.6.3 (R14.5) HONESTY CAVEAT, unchanged through pgCK 0.4.109 (F-P2-1): concept.match
   *  CANNOT SEE SEALED INSTANCES — it reads a plane sealed facts do not land on. This is NOT
   *  a search over sealed instances and must never be presented as one; grounding-for-
   *  outsiders has no path yet, per pgCK's own standing-gaps table (CK.v0.4.109 §3). */
  async match(term) { const r = await this.do(OP_VERB.match, { term }); if (r && r.ok === false) throw refusalError('match', r); return r?.result ?? []; }

  /** TE-7: native sealed-map transition (pgCK T3, ≥0.4.10). The kernel reads the instance type's OWN sealed
   *  transition map; an illegal move returns {error:'invalid_transition', from, to, allowed} — `allowed` is
   *  surfaced so the caller can offer only the legal to_states. No client-side ride-on-update. */
  async transition(id, toState, evidence, opts = {}) {
    await this._assertMayWrite('transition', id, opts);         // R24.2 — before the write
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
    // v1.6.3 (final audit, R5.4): the two refusal planes are never flattened. A reply carrying
    // `violations` IS the SHACL report — conforms:false verbatim. A PROCEDURAL refusal carries
    // none, and rendering it conforms:false manufactures a verdict the gate never reached — it
    // THROWS instead, clause intact. (No sourceConstraintComponent ⇒ not SHACL.)
    if (r?.ok === false && !Array.isArray(r.violations)) throw refusalError('validate', r);
    // v1.6.5 (R30, PASS-16 §2): TWO WARNING BANDS, never folded. `reference` (core#Adoption bodies
    // only, extversion ≥ 0.4.112) answers the STORE's state — moduleResolves / targetHasGraphs /
    // sourceDigestMatch / sourceRecorded — beside the SHACL report, which answers the LAW's shape.
    // `conforms` stays SHAPE-ONLY: measured 2026-09-04, a WRONG digest is conforms:true with
    // reference.sourceDigestMatch:false, and the v1.6.4 facade dropped both fields — a consumer
    // reading conforms:true would have loaded the wrong module. A warnings[] entry WITH a `check`
    // key is the reference band; WITHOUT one it is SHACL guidance. Both verbatim; the two filtered
    // views are conveniences over the same array, never interpretations. Null-honest when the door
    // has no band: the caller sees the door's capability, never a guess.
    const warnings = Array.isArray(r?.warnings) ? r.warnings : null;
    const bands = { referenceWarnings: warnings ? warnings.filter((w) => w && Object.prototype.hasOwnProperty.call(w, 'check')) : null,
                    shapeWarnings:     warnings ? warnings.filter((w) => !(w && Object.prototype.hasOwnProperty.call(w, 'check'))) : null };
    const reference = r?.reference ?? null;
    if (r?.ok === false) return { conforms: false, violations: r.violations, error: r.error, warnings, reference, ...bands };
    return { conforms: r?.conforms === true, violations: r?.violations ?? [], warnings, reference, ...bands };
  }

  // ── Reads without a query language (named, typed, grantable — §4.5) ─────────

  /** Cache-first; dispatch `instance.get` on miss; ingest + return the typed instance. */
  async get(id) {
    const cached = this._store.get(id);                      // L1 hit — a cache, not a fallback
    if (cached) return cached;
    const r = await this.do(OP_VERB.get, { id });
    // v1.6.3 (R12, pgCK E-5 0.4.102): instance.get REFUSES an unresolvable id (42704, naming
    // the accepted forms) where it once answered a confident null. A refusal is a result and
    // it THROWS (charter §2) — null below can only ever be a pre-floor door's honest
    // {ok:true, instance:null} miss, never a swallowed verdict.
    if (r && r.ok === false) throw refusalError('get', r);
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
    // v1.6.4 (R19, PASS-14 §5): `shaped` names TWO different properties, and this is the
    // misleading one. On `surface.typecheck` it means "some shape targets this type in the
    // COMPOSED surface" — the judgement question. On `instance.query` it means only
    // "declared property keys exist in the kernel graph", used to turn filter keys into a
    // refusal set. A reader concluding "shaped:false ⇒ unshaped ⇒ seals are vacuous" from a
    // QUERY reply is wrong wherever the composed surface does target the type. The client
    // therefore surfaces it under a name that cannot be misread, and does NOT re-expose the
    // word `shaped`. "Is this type judged?" is `k.surface.typecheck({type})` — never this.
    Object.defineProperty(rows, 'filterKeysConstrained', { value: r?.shaped ?? null, enumerable: false, configurable: true });
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
    // v1.6.3 (R9): pgCK 0.4.90 stamps it server-side — apply's success path now carries the
    // QUORUM PAIR (approvals beside the bar it cleared) plus rehearsal and a quorumNote.
    // The server value WINS; the client derivation survives only as the labelled fallback for
    // a door that does not send one — the label was designed to survive exactly this cutover.
    // An approval count without the bar it cleared is not a number.
    const serverSaid = applied?.rehearsal != null;
    const rehearsal = serverSaid ? applied.rehearsal : quorum <= 1;
    return { ok: !!(applied && applied.ok), proposal: p.iri, state: applied?.state,
             epoch: applied?.epoch, rehearsal,
             rehearsalSource: serverSaid ? 'server' : 'client-derived',
             approvals: applied?.approvals, quorum: applied?.quorum,
             quorumNote: applied?.quorumNote, vote, applied };
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
