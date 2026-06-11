// ck-store.js — CK.Lib.Js L1: CKStore, the typed-instance cache (v1.5.0, dispatch-only).
//
// A Map of `@id`/URN → typed JSONB instance, fed ONLY by `ckp.dispatch` replies and granted-scope
// events. It is **explicitly not an RDF store**: no quads, no 6-way hex index, no DatasetCore, no
// SPARQL, no `toQuads`. It addresses URNs and typed instances — never triples, graphs, or storage
// layout (SPEC.CK-LIB-JS.v1.5.0 §0.1, §5 L1, §4.5).
//
// Projection rules carried from the former hex-store's *instance* projection (the *triple*
// projection is gone): replace-by-id, dedup-by-seq, recent ring.
//
// Exports: CKStore (default — the cache), CKSubject, CKView, ckBind.

const ID_KEYS = ['@id', 'id', 'urn'];
const TYPE_KEYS = ['@type', 'type'];

/** Extract the URN/@id that keys an instance in the cache. */
export function instanceUrn(inst) {
  if (!inst || typeof inst !== 'object') return null;
  for (const k of ID_KEYS) {
    const v = inst[k];
    if (typeof v === 'string' && v.length) return v;
  }
  return null;
}

/** Extract the concept type of an instance (`@type` preferred, `type` accepted). */
export function instanceType(inst) {
  if (!inst || typeof inst !== 'object') return null;
  for (const k of TYPE_KEYS) {
    const v = inst[k];
    if (typeof v === 'string' && v.length) return v;
  }
  return null;
}

/**
 * The linked `@id` refs an instance carries — object refs are `{"@id": "..."}` id-nodes
 * (SPEC §4.2). Scans top-level property values (and arrays of them) for id-nodes. Returns a
 * de-duplicated array of referenced URNs the cache could traverse to. No triple/quad accessor.
 */
export function instanceEdges(inst) {
  if (!inst || typeof inst !== 'object') return [];
  const out = new Set();
  const consider = (v) => {
    if (v && typeof v === 'object' && typeof v['@id'] === 'string') out.add(v['@id']);
  };
  for (const [k, v] of Object.entries(inst)) {
    if (ID_KEYS.includes(k) || TYPE_KEYS.includes(k)) continue;
    if (Array.isArray(v)) v.forEach(consider);
    else consider(v);
  }
  return [...out];
}

/**
 * CKSubject — a synchronous, allocation-light view of ONE instance in the cache (pure read;
 * no fetch). Carries no physical token. `.get()` returns the JSONB instance; `.edges()` returns
 * the linked `@id` refs the cache has seen. There is no triple/quad accessor.
 */
export class CKSubject {
  constructor(store, urn) {
    this._store = store;
    this.urn = urn;
  }
  exists() { return this._store._map.has(this.urn); }
  get() { return this._store._map.get(this.urn) ?? null; }
  edges() { return instanceEdges(this.get()); }
  type() { return instanceType(this.get()); }
}

/**
 * CKView — a reactive, typed-instance view over one URN. `.on('change', {added, removed})` fires
 * microtask-batched (added/removed are the edge-ref delta); `.fetch()` dispatches `instance.get`
 * through the store's dispatcher when one is wired; `.dispose()` tears the view down.
 */
export class CKView {
  constructor(store, urn, opts = {}) {
    this._store = store;
    this.urn = urn;
    this._opts = opts;
    this._listeners = new Set();
    this._lastEdges = new Set(instanceEdges(store._map.get(urn)));
    store._attachView(this);
  }
  exists() { return this._store._map.has(this.urn); }
  get() { return this._store._map.get(this.urn) ?? null; }
  edges() { return instanceEdges(this.get()); }
  on(event, cb) {
    if (event === 'change' && typeof cb === 'function') this._listeners.add(cb);
    return this;
  }
  off(event, cb) { this._listeners.delete(cb); return this; }
  /** Dispatch `instance.get` through the store's wired dispatcher. */
  async fetch() {
    if (typeof this._store._dispatch !== 'function') {
      throw new Error('CKView.fetch() requires a dispatcher wired into CKStore (set via the L2 handle)');
    }
    const reply = await this._store._dispatch('instance.get', { id: this.urn });
    this._store.ingest(reply);
    return this.get();
  }
  /** Internal: invoked by the store on a microtask flush when this URN changed. */
  _notify() {
    const next = new Set(instanceEdges(this.get()));
    const added = [...next].filter((e) => !this._lastEdges.has(e));
    const removed = [...this._lastEdges].filter((e) => !next.has(e));
    this._lastEdges = next;
    for (const cb of this._listeners) cb({ added, removed, urn: this.urn });
  }
  dispose() {
    this._listeners.clear();
    this._store._detachView(this);
  }
}

/**
 * ckBind — build a URN-pattern matcher used by `CKStore.bind`. Patterns:
 *   '*'                       → any instance
 *   'ckp://Instance#<id>'     → exact URN
 *   'ckp://Kernel#<Name>'     → instances whose URN/type names that kernel
 *   'ckp://Edge#<predicate>'  → instances carrying that predicate
 * Returns `{ pattern, match(inst, urn) }`. Pure; carries no physical token.
 */
export function ckBind(pattern, opts = {}) {
  if (pattern === '*' || pattern == null) {
    return { pattern: '*', match: () => true, opts };
  }
  const hashIdx = pattern.indexOf('#');
  const kind = hashIdx >= 0 ? pattern.slice(0, hashIdx) : '';
  const tail = hashIdx >= 0 ? pattern.slice(hashIdx + 1) : pattern;

  let match;
  if (kind === 'ckp://Instance') {
    match = (_inst, urn) => urn === pattern || urn === tail;
  } else if (kind === 'ckp://Edge') {
    match = (inst) => instanceEdges(inst).some((e) => e === tail || e.endsWith('#' + tail)) ||
      Object.prototype.hasOwnProperty.call(inst || {}, tail);
  } else if (kind === 'ckp://Kernel') {
    match = (inst, urn) => (urn && urn.includes(tail)) || (instanceType(inst) || '').includes(tail);
  } else {
    // Bare string: treat as exact-URN or type match.
    match = (inst, urn) => urn === pattern || instanceType(inst) === pattern;
  }
  return { pattern, match, opts };
}

/**
 * CKStore — the typed-instance cache. Fed by dispatch replies + granted events via `ingest`.
 * Reactive reads via `view` / `urn` / `bind`. Zero dependencies; no RDF surface.
 */
export class CKStore {
  /**
   * @param {object} [opts]
   * @param {boolean} [opts.replaceById=true]   replace an existing instance with the same @id
   * @param {boolean} [opts.dedupBySeq=true]    drop an incoming instance whose `seq` <= stored `seq`
   * @param {number}  [opts.recentCapacity=256] size of the recent-insert ring
   * @param {function}[opts.dispatch]           optional dispatcher wired by the L2 handle for `.fetch()`
   */
  constructor(opts = {}) {
    this.replaceById = opts.replaceById !== false;
    this.dedupBySeq = opts.dedupBySeq !== false;
    this.recentCapacity = Number.isInteger(opts.recentCapacity) ? opts.recentCapacity : 256;
    this._dispatch = typeof opts.dispatch === 'function' ? opts.dispatch : null;

    this._map = new Map();          // urn → instance
    this._recent = [];              // ring of recently-inserted urns (most recent last)
    this._binds = new Set();        // { matcher, fn, once }
    this._views = new Map();        // urn → Set<CKView>
    this._pending = new Set();      // urns changed since last microtask flush
    this._flushQueued = false;
  }

  // ── Ingest ─────────────────────────────────────────────────────────────────

  /**
   * Ingest a dispatch reply or a granted-scope event. Accepts:
   *   - a typed instance ({ '@id', ... })
   *   - a dispatch reply ({ ok, result, ... }) whose `result` is an instance or instance[]
   *   - an array of instances
   * Returns the number of instances projected.
   */
  ingest(payload) {
    if (payload == null) return 0;
    if (Array.isArray(payload)) {
      let n = 0;
      for (const p of payload) n += this.ingest(p);
      return n;
    }
    if (typeof payload !== 'object') return 0;
    // A dispatch reply envelope carries `ok`/`result`/`violations` and NO instance markers
    // (`@id`/`@type`). Its top-level `id` is the affected instance's id, not an instance body —
    // so we must detect the envelope *before* the looser id-key extraction.
    const isEnvelope = !('@id' in payload) && !('@type' in payload) &&
      ('ok' in payload || 'result' in payload || 'violations' in payload);
    if (isEnvelope) {
      if (payload.ok === false) return 0;
      return 'result' in payload ? this.ingest(payload.result) : 0;
    }
    return this._insert(payload);
  }

  _insert(inst) {
    const urn = instanceUrn(inst);
    if (!urn) return 0;

    const prev = this._map.get(urn);
    if (prev) {
      if (this.dedupBySeq && Number.isFinite(inst.seq) && Number.isFinite(prev.seq) && inst.seq <= prev.seq) {
        return 0; // stale — keep the newer sealed fact
      }
      this._map.set(urn, this.replaceById ? inst : { ...prev, ...inst });
    } else {
      this._map.set(urn, inst);
      this._touchRecent(urn);
    }
    this._markChanged(urn);
    return 1;
  }

  _touchRecent(urn) {
    this._recent.push(urn);
    if (this._recent.length > this.recentCapacity) {
      const evicted = this._recent.shift();
      // Recent ring bounds *iteration order memory*, not the cache itself; the map keeps the instance.
      void evicted;
    }
  }

  // ── Reads ──────────────────────────────────────────────────────────────────

  get(urn) { return this._map.get(urn) ?? null; }
  has(urn) { return this._map.has(urn); }
  get size() { return this._map.size; }
  all() { return [...this._map.values()]; }
  /** Recently-ingested instances, newest last, bounded by recentCapacity. */
  recent() { return this._recent.filter((u) => this._map.has(u)).map((u) => this._map.get(u)); }

  /** Synchronous pure-cache subject for one URN (no fetch, no allocation of a reactive view). */
  urn(urn) { return this._map.has(urn) ? new CKSubject(this, urn) : null; }

  /** Reactive view over one URN. */
  view(urn, opts = {}) { return new CKView(this, urn, opts); }

  /**
   * Bind a callback to instances matching a URN pattern, fired after ingest (microtask-batched).
   * `pattern` is a string (see ckBind) or a prebuilt matcher from ckBind().
   */
  bind(pattern, fn, opts = {}) {
    const matcher = typeof pattern === 'object' && pattern.match ? pattern : ckBind(pattern, opts);
    const entry = { matcher, fn, once: !!opts.once };
    this._binds.add(entry);
    return () => this._binds.delete(entry); // unbind
  }
  bindOnce(pattern, fn, opts = {}) { return this.bind(pattern, fn, { ...opts, once: true }); }

  // ── Reactive plumbing (microtask-batched) ───────────────────────────────────

  _attachView(view) {
    if (!this._views.has(view.urn)) this._views.set(view.urn, new Set());
    this._views.get(view.urn).add(view);
  }
  _detachView(view) {
    const set = this._views.get(view.urn);
    if (set) { set.delete(view); if (!set.size) this._views.delete(view.urn); }
  }

  _markChanged(urn) {
    this._pending.add(urn);
    if (!this._flushQueued) {
      this._flushQueued = true;
      queueMicrotask(() => this._flush());
    }
  }

  _flush() {
    const changed = [...this._pending];
    this._pending.clear();
    this._flushQueued = false;
    for (const urn of changed) {
      const inst = this._map.get(urn);
      // Notify URN-pattern binds.
      for (const entry of [...this._binds]) {
        if (entry.matcher.match(inst, urn)) {
          try { entry.fn(inst, urn); } finally { if (entry.once) this._binds.delete(entry); }
        }
      }
      // Notify reactive views on this URN.
      const views = this._views.get(urn);
      if (views) for (const v of [...views]) v._notify();
    }
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  clear() {
    this._map.clear();
    this._recent = [];
    this._pending.clear();
  }
  dispose() {
    for (const set of this._views.values()) for (const v of [...set]) v.dispose();
    this._binds.clear();
    this._views.clear();
    this.clear();
  }
}

export default CKStore;
