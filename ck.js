// ck.js — CK.Lib.Js L2: the unified, dispatch-backed concept-kernel surface (v1.5.0).
//
// One import an app or LLM-agent harness needs:  import { CK } from '@conceptkernel/cklib';
// `await CK.activate('<kernel>')` brings a concept kernel to life (authenticate + subscribe granted
// scope); every operation on the returned `ConceptKernel` handle resolves to a single outbound
// primitive — `ckp.dispatch(verb, kernel_urn, payload, identity)` (SPEC.CK-LIB-JS.v1.5.0 §4).
//
// App code names concept kernels and concepts (URNs) — never NATS subjects, codecs, handles,
// trace ids, quads, graph ids, or query strings. The machinery underneath is exactly two layers:
//   L0 — a dispatch transport (CKClient; carries the four-tuple to the single ingress)
//   L1 — a typed-instance cache (CKStore; this file imports it)
// There is no RDF, quad store, or query engine on the client.

import CKStore from './ck-store.js';

/** Normalize a kernel name or URN to the canonical `ckp://Kernel#<Name>` form. */
export function normalizeKernel(kernel) {
  if (typeof kernel !== 'string' || !kernel.length) throw new Error('CK.activate: kernel name or URN required');
  if (kernel.startsWith('ckp://Kernel#')) return kernel;
  if (kernel.startsWith('ckp://')) return kernel;
  return 'ckp://Kernel#' + kernel;
}

// The explicit operation→verb table — the stable floor mapped to v3.9 verbs (never by parsing an
// action-URN). Legacy v3.8 aliases are handled below L2 by the transport shim, not here.
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
};

const isUnknownAffordance = (r) => r && r.ok === false && (r.error === 'unknown_affordance' || r.error === 'unknown_verb');

// pgCK ≤0.4.x replies carry no uniform `.result`; each verb returns its own field. Map them so the
// `.result`-keyed ingest + typed reads fire. (Reply-envelope normalization is pgCK design-Q1; per-verb
// adapters until pgCK confirms — see _WIP NOTIFIES.pgCK.v0.4.2.wire-contract-pin-operations.)
const REPLY_FIELD = {
  'instance.query': 'rows', 'instances.list': 'instances',
  'kernels.list': 'kernels', 'instance.get': 'instance',
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

/** Derive the stable write-result shape from a dispatch reply. */
function writeResult(reply) {
  if (!reply || reply.ok === false) return { ok: false, id: reply?.id ?? null, error: reply?.error, violations: reply?.violations, allowed: reply?.allowed };
  return { ok: true, id: reply.id ?? reply.result?.['@id'] ?? null, verified: reply.verified ?? !!reply.proof_digest, proof_digest: reply.proof_digest ?? null, seq: reply.seq };
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
  }

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

  // ── Named conveniences (sugar over `do`, mapped via OP_VERB) ────────────────

  async create(type, body = {}) {
    // TE-10 (v1.6.0 Typed Edge): uniform create-by-declared-type. pgCK ≥0.4.4 routes instance.create →
    // ckp.create_typed when {type} is top-level with NO `task` key, sealing against the kernel's OWN
    // declared SHACL shape (sh:targetClass = type; each caller field local-name → declared property IRI).
    // `type` MUST be the kernel's declared class IRI (e.g. urn:ckp:<project>/type/Ship); the server
    // rejects a bare name (`type_must_be_iri`). The kernel is conveyed by the handle (transport routes by
    // kernelUrn) and the project is server-scoped (ckp.project) — so `target_kernel` is no longer sent.
    // This drops the transient type→payload-key (`task`/`name`) nesting.
    const { target_kernel, ...fields } = body;            // target_kernel: handle/server-scoped now — stripped, not sent
    const w = writeResult(await this.do(OP_VERB.create, { type, ...fields }));
    // Receipt-only reply → optimistically surface the sealed instance for cache-first reads; the
    // authoritative sealed event reconciles it (replace-by-id).
    if (w.ok && w.id) this._store.ingest({ '@id': w.id, '@type': type, ...fields });
    return w;
  }
  /** TE-6: generic declared-shape patch (pgCK T4, ≥0.4.11) — instance.update {id, patch:{…}} → update_typed,
   *  patched by the type's declared properties (re-sealed; undeclared keys rejected). */
  async update(id, patch = {}) { return writeResult(await this.do(OP_VERB.update, { id, patch })); }
  // TE-8 (live-verified vs pgCK 0.4.13): `target` is a PLAIN IRI — edge.create puts it straight into the
  // materialized turtle, so an {'@id':…} wrapper turtle-parse-errors. `predicate` must be a declared IRI.
  async link(source, predicate, target) { return writeResult(await this.do(OP_VERB.link, { source, predicate, target })); }
  async notify(to, predicate, body = {}) { return writeResult(await this.do(OP_VERB.link, { source: to, predicate, body, event: true })); }
  async retire(id, reason) { return writeResult(await this.do(OP_VERB.retire, { id, reason })); }
  async verify(id) { const r = await this.do(OP_VERB.verify, { id }); return { verified: r?.verified ?? !!r?.proof_digest, proof_digest: r?.proof_digest ?? null, seq: r?.seq }; }
  async provenance(id, depth) { const r = await this.do(OP_VERB.provenance, { id, depth }); return r?.result ?? r; }
  async snapshot(scope) { const r = await this.do(OP_VERB.snapshot, scope ? { scope } : {}); return r?.result ?? []; }

  /** TE-7: native sealed-map transition (pgCK T3, ≥0.4.10). The kernel reads the instance type's OWN sealed
   *  transition map; an illegal move returns {error:'invalid_transition', from, to, allowed} — `allowed` is
   *  surfaced so the caller can offer only the legal to_states. No client-side ride-on-update. */
  async transition(id, toState, evidence) {
    return writeResult(await this.do(OP_VERB.transition, { id, to_state: toState, evidence }));
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
   *  Degrades to the `instances.list` alias if query isn't an affordance; no client-side cache-filter. */
  async query(type, filter = {}) {
    const payload = { type, filter: toFilterArray(filter) };
    if (filter && !Array.isArray(filter)) { if (filter.limit != null) payload.limit = filter.limit; if (filter.offset != null) payload.offset = filter.offset; }
    let r = await this.do(OP_VERB.query, payload);
    if (isUnknownAffordance(r)) r = await this.do('instances.list', payload); // v3.8 alias (retires on the clock)
    if (r && Array.isArray(r.result)) return r.result; // do() already ingested the flattened rows
    return []; // governed read: no rows or a shape rejection → honest empty (TE-9 dropped the cache-filter)
  }
  async list(type, filter = {}) { return this.query(type, filter); }

  /** Bounded traversal. Gated on pgCK CI-E-4; returns [] honestly if unavailable. */
  async reach(from, via, opts = {}) {
    const r = await this.do(OP_VERB.reach, { from, via, ...opts });
    if (isUnknownAffordance(r)) return [];
    if (r && Array.isArray(r.result)) { this._store.ingest(r.result); return r.result; }
    return [];
  }

  // ── Governance plane (gated on pgCK CI-D; honest stub until then — §4.6) ────

  // Governance plane — server shapes (pgCK 0.4.x): propose {op,requires_quorum,detail}; vote {about,value}; apply {about}.
  async propose(op, detail = {}, requires_quorum = 1) { return this._gov(OP_VERB.propose, { op, requires_quorum, detail }); }
  async vote(proposalIri, value) { return this._gov(OP_VERB.vote, { about: proposalIri, value }); }
  async apply(proposalIri) { return this._gov(OP_VERB.apply, { about: proposalIri }); }
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

    // Discover the kernel's affordances (sealed rows ∩ identity grants — degrades to full surface
    // honestly until pgCK can answer "what may this identity do here?").
    let affordances = [];
    try {
      if (typeof transport.affordances === 'function') affordances = await transport.affordances(kernelUrn);
      else { const r = await transport.dispatch('kernel.affordances', kernelUrn, {}); affordances = (r && r.result) || []; }
    } catch { affordances = []; }

    const handle = new ConceptKernel(kernelUrn, transport, store, affordances, opts);

    // Subscribe the granted result/event scope; granted events feed the cache.
    if (typeof transport.subscribe === 'function') {
      const unsub = transport.subscribe(kernelUrn, (msg) => store.ingest(msg));
      if (typeof unsub === 'function') handle._unsubs.push(unsub);
    }

    // Hydrate current state when instance.snapshot is reachable + granted (closes F-E client-side).
    if (opts.hydrate !== false) {
      try { const snap = await handle.snapshot(); if (Array.isArray(snap) && snap.length) store.ingest(snap); } catch { /* not granted yet */ }
    }

    return handle;
  },
};

/**
 * @ckOn(urn) — decorator sugar over `k.bind`. Records the binding on the class; wired when the
 * instance's handle field (`this.kernel` / `this.ck` / `this._ck`) is set. The function form
 * `k.bind(urn, fn)` is the canonical surface (§4.9).
 */
export function ckOn(urn, opts = {}) {
  return function (target, key) {
    const ctor = target?.constructor ?? target;
    (ctor.__ckOn ||= []).push({ urn, key, opts });
    return undefined;
  };
}

/** Wire @ckOn-decorated methods of `obj` onto a handle (call after assigning the handle field). */
export function wireCkOn(obj, handle) {
  const binds = obj?.constructor?.__ckOn || [];
  const unbinds = binds.map(({ urn, key, opts }) => handle.bind(urn, (...a) => obj[key](...a), opts));
  return () => unbinds.forEach((u) => u && u());
}

export default CK;
