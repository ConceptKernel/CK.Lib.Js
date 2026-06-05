/**
 * ck-hex-store.js — CKHexStore: URN-native, 6-way hex-indexed mirror of pgCK's governed graph.
 *
 * Specs:
 *   ./SPEC.CK.HEXSTORE.v0.1.md     — wire input, hex indexes, dictionary, projection rules
 *   ./SPEC.CK.HEXSTORE.v3.8.1.md   — URN-native developer surface (bind / invoke / view / urn)
 *
 * Status: skeleton implementation for pgCK review against the v3.8.1 spec.
 * Target ship: CK.Lib.Js v1.4 at /ck-hex-store.js (root). During incubation it
 * lives in this subfolder so the README + specs + skeleton co-evolve.
 *
 * Usage (minimum):
 *   import { CKClient }   from '../ck-client.js';
 *   import { CKHexStore } from './ck-hex-store.js';
 *
 *   const ck    = new CKClient({ kernel: 'pgCK.Task' });
 *   const store = new CKHexStore(ck);
 *   await ck.connect();
 *   ck.on('event',  m => store.insert(m));
 *   ck.on('result', m => store.insert(m));
 *
 *   store.bind('ckp://Kernel#pgCK.Task/sealed', e => console.log('sealed', e.subject));
 *   const result = await store.invoke('ckp://Action#pgCK.Task.create', { title: 'x' });
 *   const view   = store.view('ckp://Instance#FC-T-0001');
 *   view.on('change', d => render(view));
 *
 * Not shipped yet (pgCK side):
 *   - event.kernel.Dictionary.* publish (canonical handle allocation; v0.1 §5 local-dict workaround applies)
 *   - msgpack binary publish path (JSON-LD path is the v3.8.1 default; binary code-path is present but inert)
 *   - CK.Core resolve/affordances/proof/validate affordances (wrappers reject with 'NotShippedYet')
 */

// No top-level imports — CKClient is duck-typed via the constructor argument
// (read: ck.dictVersion, ck.handleForIri, ck.iriForHandle, ck.on, ck.off, ck.send,
// ck.kernel). This keeps the skeleton runnable in any ESM environment, including
// Node test runners that can't resolve esm.sh URLs at load time. The RDF/JS
// adapter (§8) is the only place an https:// import occurs, and it's lazy.

const LOCAL_HANDLE_START = 2147483648;   // 2^31 — keeps below server-assigned space
const DEFAULT_INVOKE_TIMEOUT_MS = 30000;
const RDF_TYPE_IRI = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const XSD = 'http://www.w3.org/2001/XMLSchema#';
const CONTROL_KEYS = new Set(['@id', '@type', '@context', 'id', 'type', 'trace_id', 'timestamp']);
const IRI_LOOK = /^(?:https?:\/\/|urn:|ckp:|did:|tag:)/;

export class CKHexStore {

    constructor(ck, opts = {}) {
        if (!ck) throw new Error('CKHexStore requires a CKClient');
        this.ck = ck;

        this.opts = {
            localHandleStart: opts.localHandleStart ?? LOCAL_HANDLE_START,
            dedupBySeq:       opts.dedupBySeq       ?? true,
            defaultGraph:     opts.defaultGraph     ?? 0,
            warnOnFullScan:   opts.warnOnFullScan   ?? true,
            timeoutMs:        opts.timeoutMs        ?? DEFAULT_INVOKE_TIMEOUT_MS,
        };

        // ── v0.1 §4 storage ─────────────────────────────────────────────
        this.quads = new Map();                // bigint quadId → { s, p, o, g }
        this.spo = new Map();
        this.sop = new Map();
        this.pso = new Map();
        this.pos = new Map();
        this.osp = new Map();
        this.ops = new Map();
        this.bySeq = new Map();                // Ck-Seq → quadId (replay correlation)

        // ── v0.1 §5 local dictionary ────────────────────────────────────
        this._localDict = {
            nextHandle: this.opts.localHandleStart,
            handles: new Map(),                // handle → iri
            reverse: new Map(),                // iri → handle
        };
        this._lastDictVersion = ck.dictVersion ?? 0;

        // ── v3.8.1 §4 URN bind registry ─────────────────────────────────
        // pattern URN string → Array<{ handler, opts, once }>
        this._binds = new Map();

        // ── v3.8.1 §5 invoke/ask trace correlation ──────────────────────
        // traceId → { resolve, reject, timeoutId }
        this._pending = new Map();

        // ── v0.1 §6.6 internal events ───────────────────────────────────
        this._listeners = { insert: [], remove: [], remap: [], snapshot: [], error: [] };

        // CKView retention — strong references to live views, keyed by subject handle
        this._views = new Map();

        // Auto-correlate result.* messages for invoke()/ask() promises.
        // The host CKClient's ck.on('result', fn) already covers result.*
        // — we listen here and pick out trace_ids we care about.
        this._resultUnsub = (ck.on && (() => ck.off('result', this._onResult.bind(this))));
        if (typeof ck.on === 'function') ck.on('result', this._onResult.bind(this));
    }

    // ──────────────────────────────────────────────────────────────────
    // v0.1 §6 — insert / remove / match / inflate
    // ──────────────────────────────────────────────────────────────────

    /**
     * Ingest a CKClient delivery envelope (v1.3.12 typed envelope shape).
     * Returns the array of newly added quadIds (empty if dedup'd or no projection).
     */
    insert(msg) {
        if (!msg || typeof msg !== 'object') return [];

        // Dictionary version watch — workaround for the absence of a
        // CKClient-side dict-change event (v3.8.1 §2.2). Cheap: integer compare.
        if (this.ck.dictVersion !== this._lastDictVersion) {
            this._runRemap();
            this._lastDictVersion = this.ck.dictVersion;
        }

        // §1: Ck-Seq dedup (replay correlation, in addition to CKClient's own per-subject dedup)
        const seq = msg.headers && (msg.headers['Ck-Seq'] || msg.headers['ck-seq']);
        if (this.opts.dedupBySeq && seq !== undefined && this.bySeq.has(seq)) return [];

        const data = msg.data;
        if (!data || typeof data !== 'object') return [];

        // §3.1 dispatch: binary delta vs JSON-LD body
        if (data.e !== undefined && data.p !== undefined && data.o !== undefined) {
            return this._insertBinaryDelta(msg, data, seq);
        }
        return this._insertJsonLd(msg, data, seq);
    }

    _insertJsonLd(msg, data, seq) {
        const subjectIri = msg.subjectIri ?? data['@id'] ?? data.id ?? null;
        if (!subjectIri) {
            this._emit('error', { reason: 'missing-subject-iri', msg });
            return [];
        }
        const s = this._handleFor(subjectIri);

        const added = [];

        // rdf:type quads
        const conceptType = msg.conceptType ?? data['@type'] ?? data.type ?? null;
        if (conceptType) {
            const types = Array.isArray(conceptType) ? conceptType : [conceptType];
            const pType = this._handleFor(RDF_TYPE_IRI);
            for (const t of types) {
                if (typeof t !== 'string') continue;
                const oh = this._handleFor(t);
                const qid = this._addQuad(s, pType, oh, this.opts.defaultGraph);
                if (qid != null) added.push(qid);
            }
        }

        // Property quads
        for (const [key, value] of Object.entries(data)) {
            if (CONTROL_KEYS.has(key)) continue;
            const p = this._handleFor(key);
            const values = Array.isArray(value) ? value : [value];
            for (const v of values) {
                const o = this._objectFrom(v);
                if (o == null) continue;
                const qid = this._addQuad(s, p, o, this.opts.defaultGraph);
                if (qid != null) added.push(qid);
            }
        }

        if (seq !== undefined && added.length) this.bySeq.set(seq, added[0]);

        if (added.length) {
            this._emit('insert', { quadIds: added, msg });
            this._dispatchBinds(msg, subjectIri, added);
            this._notifyViews(subjectIri, added, /*removed*/ []);
        }
        return added;
    }

    _insertBinaryDelta(msg, data, seq) {
        const s = typeof data.e === 'number' ? data.e : this._handleFor(String(data.e));
        const p = typeof data.p === 'number' ? data.p : this._handleFor(String(data.p));
        let o;
        if (typeof data.o === 'number') o = data.o;
        else if (typeof data.o === 'string') o = looksLikeIri(data.o) ? this._handleFor(data.o) : { v: data.o };
        else if (typeof data.o === 'object' && data.o !== null && 'v' in data.o) {
            o = { v: data.o.v };
            if (data.o.dt !== undefined) o.dt = typeof data.o.dt === 'number' ? data.o.dt : this._handleFor(String(data.o.dt));
            if (data.o.lang !== undefined) o.lang = String(data.o.lang);
        } else return [];
        const g = data.g !== undefined ? (typeof data.g === 'number' ? data.g : this._handleFor(String(data.g))) : this.opts.defaultGraph;

        const qid = this._addQuad(s, p, o, g);
        if (qid == null) return [];

        if (seq !== undefined) this.bySeq.set(seq, qid);

        const subjectIri = this.ck.iriForHandle?.(s) ?? this._localDict.handles.get(s) ?? null;
        this._emit('insert', { quadIds: [qid], msg });
        if (subjectIri) {
            this._dispatchBinds(msg, subjectIri, [qid]);
            this._notifyViews(subjectIri, [qid], []);
        }
        return [qid];
    }

    remove(quadId) {
        const q = this.quads.get(quadId);
        if (!q) return false;
        this._removeQuad(quadId, q);
        this._emit('remove', { quadId });
        const subjectIri = this.ck.iriForHandle?.(q.s) ?? this._localDict.handles.get(q.s) ?? null;
        if (subjectIri) this._notifyViews(subjectIri, [], [quadId]);
        return true;
    }

    removeBySubject(iriOrHandle) {
        const s = typeof iriOrHandle === 'number' ? iriOrHandle : this._handleFor(iriOrHandle);
        const ps = this.spo.get(s);
        if (!ps) return 0;
        const ids = [];
        for (const [, qidSet] of ps) for (const qid of qidSet) ids.push(qid);
        for (const qid of ids) this.remove(qid);
        return ids.length;
    }

    /**
     * v0.1 §4.4 — selectivity-aware match.
     * Bindings: { s?, p?, o?, g? } — each MAY be an IRI string or a uint32 handle.
     * Returns: bigint[] of quadIds (materialized snapshot per §6.4).
     */
    match(pattern = {}) {
        const sBound = pattern.s !== undefined ? this._asHandle(pattern.s) : null;
        const pBound = pattern.p !== undefined ? this._asHandle(pattern.p) : null;
        const oBound = pattern.o !== undefined ? this._asObject(pattern.o) : null;
        const gBound = pattern.g !== undefined ? this._asHandle(pattern.g) : null;

        const out = [];
        const push = (qid) => {
            if (gBound !== null) {
                const q = this.quads.get(qid);
                if (!q || q.g !== gBound) return;
            }
            out.push(qid);
        };

        if (sBound != null && pBound != null && oBound != null) {
            const ps = this.spo.get(sBound)?.get(pBound);
            if (ps) {
                const oKey = this._objectKey(oBound);
                for (const qid of ps) {
                    const q = this.quads.get(qid);
                    if (q && this._objectKey(q.o) === oKey) push(qid);
                }
            }
        } else if (sBound != null && pBound != null) {
            const set = this.spo.get(sBound)?.get(pBound);
            if (set) for (const qid of set) push(qid);
        } else if (sBound != null && oBound != null) {
            const oKey = this._objectKey(oBound);
            const set = this.sop.get(sBound)?.get(oKey);
            if (set) for (const qid of set) push(qid);
        } else if (pBound != null && oBound != null) {
            const oKey = this._objectKey(oBound);
            const set = this.pos.get(pBound)?.get(oKey);
            if (set) for (const qid of set) push(qid);
        } else if (pBound != null) {
            const ps = this.pso.get(pBound);
            if (ps) for (const [, set] of ps) for (const qid of set) push(qid);
        } else if (oBound != null) {
            const oKey = this._objectKey(oBound);
            const so = this.osp.get(oKey);
            if (so) for (const [, set] of so) for (const qid of set) push(qid);
        } else if (sBound != null) {
            const ps = this.spo.get(sBound);
            if (ps) for (const [, set] of ps) for (const qid of set) push(qid);
        } else {
            if (this.opts.warnOnFullScan) {
                console.warn('[CKHexStore] match({}) full scan over', this.quads.size, 'quads');
            }
            for (const qid of this.quads.keys()) push(qid);
        }

        return out;
    }

    /**
     * v0.1 §6.5 — inflate handles back to IRI strings / literal records.
     */
    inflate(quadId) {
        const q = this.quads.get(quadId);
        if (!q) return null;
        return {
            s: this._iriFor(q.s),
            p: this._iriFor(q.p),
            o: this._inflateObject(q.o),
            g: q.g === this.opts.defaultGraph ? '' : (this._iriFor(q.g) ?? ''),
        };
    }

    inflateAll(quadIds) { return quadIds.map((qid) => this.inflate(qid)).filter(Boolean); }

    get size() { return this.quads.size; }
    get dictVersion() { return this.ck.dictVersion ?? 0; }

    // ──────────────────────────────────────────────────────────────────
    // v0.1 §6.6 — diagnostic events (kept for compat)
    // ──────────────────────────────────────────────────────────────────

    on(eventName, fn) {
        const arr = this._listeners[eventName];
        if (!arr) throw new Error(`Unknown CKHexStore event: ${eventName}`);
        arr.push(fn);
        return () => { const i = arr.indexOf(fn); if (i > -1) arr.splice(i, 1); };
    }

    _emit(name, payload) {
        const arr = this._listeners[name];
        if (!arr) return;
        for (const fn of arr) { try { fn(payload); } catch (e) { console.error('[CKHexStore]', name, e); } }
    }

    // ──────────────────────────────────────────────────────────────────
    // v3.8.1 §4 — URN-based ingress
    // ──────────────────────────────────────────────────────────────────

    /**
     * Subscribe to a URN pattern. Returns an unsubscribe function.
     * URN forms supported (v3.8.1 §2.1):
     *   ckp://Kernel#K               — all events from kernel K
     *   ckp://Kernel#K/<verb>        — specific verb on K
     *   ckp://Instance#X             — events affecting instance X
     *   ckp://Edge#P                 — events writing predicate P
     *   *                            — catch-all
     */
    bind(urn, handler, opts = {}) {
        if (typeof handler !== 'function') throw new TypeError('CKHexStore.bind: handler must be a function');
        if (typeof urn !== 'string' || !urn.length) throw new TypeError('CKHexStore.bind: urn must be a non-empty string');

        const entry = { handler, opts, once: false };
        const arr = this._binds.get(urn) ?? [];
        arr.push(entry);
        this._binds.set(urn, arr);

        // Demand-driven subscription (v3.8.1 §10) — for kernel-scoped URNs we ensure
        // CKClient is subscribed to that kernel's event stream. When `urn` carries a
        // kernel name, that kernel's NATS subscription should already be open via
        // the constructor's `new CKClient({ kernel })`; we surface a warning if the
        // bind targets a different kernel.
        const parsed = parseSubscriptionUrn(urn);
        if (parsed.kernel && this.ck.kernel && parsed.kernel !== this.ck.kernel && parsed.kernel !== '*') {
            console.warn(`[CKHexStore] bind ${urn} targets kernel "${parsed.kernel}" but CKClient is on "${this.ck.kernel}". ` +
                         `Cross-kernel subscriptions require a separate CKClient.`);
        }

        // Replay: dispatch the handler once per existing matching subject.
        if (opts.replay) this._replayBind(urn, entry);

        return () => {
            const cur = this._binds.get(urn);
            if (!cur) return;
            const i = cur.indexOf(entry);
            if (i > -1) cur.splice(i, 1);
            if (cur.length === 0) this._binds.delete(urn);
        };
    }

    bindOnce(urn, handler, opts = {}) {
        const off = this.bind(urn, (event) => {
            off();
            try { handler(event); } catch (e) { console.error('[CKHexStore] bindOnce handler:', e); }
        }, opts);
        return off;
    }

    _dispatchBinds(msg, subjectIri, addedQuadIds) {
        if (this._binds.size === 0) return;
        const subjectHandle = this._handleFor(subjectIri);
        const predicates = new Set();
        for (const qid of addedQuadIds) {
            const q = this.quads.get(qid);
            if (q) predicates.add(q.p);
        }

        const ev = {
            urn: null,                                       // filled per match
            subject: subjectIri,
            kernel: msg.kernel ?? null,
            verb:   msg.verb ?? null,
            quadIds: addedQuadIds,
            data:    msg.data,
            traceId: msg.traceId ?? null,
        };

        for (const [pattern, entries] of this._binds) {
            if (!urnMatches(pattern, msg, subjectIri, subjectHandle, predicates, this)) continue;
            const eventForPattern = { ...ev, urn: pattern };
            for (const entry of entries) {
                try { entry.handler(eventForPattern); }
                catch (e) { console.error('[CKHexStore] bind', pattern, e); }
            }
        }
    }

    _replayBind(urn, entry) {
        const parsed = parseSubscriptionUrn(urn);
        if (parsed.kind !== 'instance') return;             // only replay for instance URNs
        const sHandle = this._handleFor(parsed.iri);
        if (!this.spo.has(sHandle)) return;
        const qids = [];
        for (const [, set] of this.spo.get(sHandle)) for (const qid of set) qids.push(qid);
        if (!qids.length) return;
        const ev = {
            urn, subject: parsed.iri, kernel: null, verb: null,
            quadIds: qids, data: null, traceId: null, replay: true,
        };
        try { entry.handler(ev); } catch (e) { console.error('[CKHexStore] replay:', e); }
    }

    // ──────────────────────────────────────────────────────────────────
    // v3.8.1 §5 — URN-based egress (invoke / ask + wrappers)
    // ──────────────────────────────────────────────────────────────────

    invoke(actionUrn, payload = {}, opts = {}) { return this._dispatch(actionUrn, payload, opts); }
    ask(actionUrn, params = {}, opts = {})    { return this._dispatch(actionUrn, params,  opts); }

    /**
     * URN form: ckp://Action#K.V — split on last '.' for kernel/verb.
     * Publishes via ck.send(); correlates by trace_id.
     */
    async _dispatch(actionUrn, payload, opts) {
        const parsed = parseActionUrn(actionUrn);
        if (!parsed) throw new TypeError(`Invalid action URN: ${actionUrn}`);
        const { kernel, verb } = parsed;

        // Cross-kernel dispatch needs a CKClient for that kernel. v3.8.1 leaves this
        // out of scope; for now we route through the bound CKClient regardless and
        // rely on its long-form publish to address the kernel correctly.
        // ck.send() at v1.3.11 publishes both short (input.<K>) and long
        // (input.kernel.<K>.action.<verb>) — the long form is what pgCK consumes
        // for non-bound kernels. CKClient's bound `kernel` field controls the
        // short alias only.
        const traceId = await this.ck.send({ action: verb, ...payload });

        // Future: when CK.Core ships affordances, we may need to publish on a
        // different kernel than the bound one. The CKClient surface for arbitrary
        // long-form publishes is not yet exposed; this is tracked as a v1.4 host-side
        // add.
        if (this.ck.kernel && this.ck.kernel !== kernel) {
            console.warn(`[CKHexStore] invoke(${actionUrn}): bound CKClient kernel "${this.ck.kernel}" != action kernel "${kernel}". ` +
                         `Long-form publish carries the correct subject; short-form alias is misaddressed.`);
        }

        const timeoutMs = opts.timeoutMs ?? this.opts.timeoutMs;
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                if (this._pending.delete(traceId)) reject(new Error('CKHexStore.invoke timeout'));
            }, timeoutMs);
            this._pending.set(traceId, { resolve, reject, timeoutId });
        });
    }

    _onResult(msg) {
        // CKClient v1.3.12 envelope: { subject, headers, data, traceId, kind, subjectIri, conceptType, kernel, verb }
        const traceId = msg.traceId || msg.data?.trace_id;
        if (!traceId) return;
        const pending = this._pending.get(traceId);
        if (!pending) return;
        clearTimeout(pending.timeoutId);
        this._pending.delete(traceId);
        // Also insert the result body so sealed facts arriving here land in the store.
        try { this.insert(msg); } catch (e) { console.error('[CKHexStore] result insert:', e); }
        pending.resolve(deflateResult(msg));
    }

    /** v3.8.1 §5.3 convenience wrappers (pgCK CK.Core affordances not yet shipped) */
    resolve(uri)              { return this._notShippedYet('resolve',     { uri }); }
    affordances(kernelUri)    { return this._notShippedYet('affordances', { kernel_uri: kernelUri }); }
    proof(uri)                { return this._notShippedYet('proof',       { uri }); }
    validate(shapeUri, body)  { return this._notShippedYet('validate',    { shape: shapeUri, body }); }

    async _notShippedYet(verb, params) {
        // When CK.Core ships, this becomes: return this.ask(`ckp://Action#CK.Core.${verb}`, params);
        // For now we fail-fast so consumers don't hang on a 30s timeout.
        return Promise.reject(new Error(`CKHexStore.${verb}: NotShippedYet (pending pgCK CKA-3/4 + CK.Core affordances)`));
    }

    // ──────────────────────────────────────────────────────────────────
    // v3.8.1 §6 — URN sync accessor
    // ──────────────────────────────────────────────────────────────────

    urn(iri) {
        // No handle allocation here — §6.3: urn() is a pure read.
        const h = this.ck.handleForIri?.(iri) ?? this._localDict.reverse.get(iri) ?? null;
        if (h == null) return null;
        if (!this.spo.has(h)) return null;
        return new CKSubject(this, iri, h);
    }

    // ──────────────────────────────────────────────────────────────────
    // v3.8.1 §7 — reactive views
    // ──────────────────────────────────────────────────────────────────

    view(iri, opts = {}) {
        const handle = this._handleFor(iri);                // §7: views MAY allocate
        let v = this._views.get(handle);
        if (v && !v._disposed) return v;
        v = new CKView(this, iri, handle, opts);
        this._views.set(handle, v);
        return v;
    }

    _notifyViews(subjectIri, addedQuadIds, removedQuadIds) {
        if (this._views.size === 0) return;
        const h = this.ck.handleForIri?.(subjectIri) ?? this._localDict.reverse.get(subjectIri);
        if (h == null) return;
        const v = this._views.get(h);
        if (v && !v._disposed) v._notify(addedQuadIds, removedQuadIds);
    }

    // ──────────────────────────────────────────────────────────────────
    // v0.1 §8 — RDF/JS adapter (delegates to v1.3.13 bridge if loaded)
    // ──────────────────────────────────────────────────────────────────

    async toRdfJs() {
        const [df, dataset] = await Promise.all([
            import('https://esm.sh/@rdfjs/data-model@2.1.0'),
            import('https://esm.sh/@rdfjs/dataset@2.0.0'),
        ]);
        const DF = df.default ?? df;
        const DS = dataset.default ?? dataset;
        const out = DS.dataset();
        for (const qid of this.quads.keys()) {
            const q = this.inflate(qid);
            if (!q) continue;
            const subj = DF.namedNode(q.s);
            const pred = DF.namedNode(q.p);
            const obj  = (typeof q.o === 'object' && q.o !== null && 'v' in q.o)
                ? DF.literal(String(q.o.v), q.o.dt ? DF.namedNode(q.o.dt) : undefined)
                : DF.namedNode(q.o);
            const grph = q.g ? DF.namedNode(q.g) : DF.defaultGraph();
            out.add(DF.quad(subj, pred, obj, grph));
        }
        return out;
    }

    // ──────────────────────────────────────────────────────────────────
    // Internal — handle resolution, quad insertion, index maintenance
    // ──────────────────────────────────────────────────────────────────

    _handleFor(iri) {
        if (typeof iri !== 'string') throw new TypeError('_handleFor: expected IRI string');
        const canon = this.ck.handleForIri?.(iri);
        if (canon != null) return canon;
        const local = this._localDict.reverse.get(iri);
        if (local != null) return local;
        const h = this._localDict.nextHandle++;
        this._localDict.handles.set(h, iri);
        this._localDict.reverse.set(iri, h);
        return h;
    }

    _iriFor(handle) {
        return this.ck.iriForHandle?.(handle) ?? this._localDict.handles.get(handle) ?? null;
    }

    _asHandle(v) { return typeof v === 'number' ? v : this._handleFor(v); }

    _asObject(v) {
        if (typeof v === 'number') return v;
        if (typeof v === 'string') return looksLikeIri(v) ? this._handleFor(v) : { v };
        if (v && typeof v === 'object' && 'v' in v) return v;
        return null;
    }

    _objectFrom(value) {
        if (value == null) return null;
        if (typeof value === 'string') {
            return looksLikeIri(value) ? this._handleFor(value) : { v: value };
        }
        if (typeof value === 'boolean') return { v: String(value), dt: this._handleFor(XSD + 'boolean') };
        if (typeof value === 'number') {
            return Number.isInteger(value)
                ? { v: String(value), dt: this._handleFor(XSD + 'integer') }
                : { v: String(value), dt: this._handleFor(XSD + 'decimal') };
        }
        if (typeof value === 'bigint') return { v: value.toString(), dt: this._handleFor(XSD + 'integer') };
        if (typeof value === 'object' && typeof value['@id'] === 'string') return this._handleFor(value['@id']);
        return null;
    }

    _inflateObject(o) {
        if (typeof o === 'number') return this._iriFor(o);
        if (o && typeof o === 'object' && 'v' in o) {
            const out = { v: o.v };
            if (o.dt !== undefined) out.dt = this._iriFor(o.dt);
            if (o.lang !== undefined) out.lang = o.lang;
            return out;
        }
        return null;
    }

    _objectKey(o) {
        // v0.1 §4.2 / §4.3: oKey occupies the 32-bit object slot of the quadId.
        // For IRI objects, the handle is the slot value directly.
        // For literal objects, a 32-bit hash of {v, dt, lang}; collisions are
        // resolved at the full-quadId identity check (Map<bigint, ...>).
        if (typeof o === 'number') return BigInt(o);
        const tag = `L:${o.v}|${o.dt ?? ''}|${o.lang ?? ''}`;
        return BigInt(hash32(tag));
    }

    _quadId(s, p, o, g) {
        const oKey = this._objectKey(o);
        return (BigInt(s) << 96n) | (BigInt(p) << 64n) | (oKey << 32n) | BigInt(g);
    }

    _addQuad(s, p, o, g) {
        const qid = this._quadId(s, p, o, g);
        if (this.quads.has(qid)) return null;               // identity dedup
        this.quads.set(qid, { s, p, o, g });

        const oKey = this._objectKey(o);
        addNested(this.spo, s, p, qid);
        addNested(this.sop, s, oKey, qid);
        addNested(this.pso, p, s, qid);
        addNested(this.pos, p, oKey, qid);
        addNested(this.osp, oKey, s, qid);
        addNested(this.ops, oKey, p, qid);
        return qid;
    }

    _removeQuad(qid, q) {
        const oKey = this._objectKey(q.o);
        this.quads.delete(qid);
        removeNested(this.spo, q.s, q.p, qid);
        removeNested(this.sop, q.s, oKey, qid);
        removeNested(this.pso, q.p, q.s, qid);
        removeNested(this.pos, q.p, oKey, qid);
        removeNested(this.osp, oKey, q.s, qid);
        removeNested(this.ops, oKey, q.p, qid);
        // bySeq cleanup
        for (const [k, v] of this.bySeq) if (v === qid) { this.bySeq.delete(k); break; }
    }

    _runRemap() {
        // v0.1 §5.3 — when ck.dictVersion changes, IRIs that we previously allocated
        // local handles for may now have canonical handles. Walk _localDict.reverse
        // and replace handles where ck.handleForIri() now returns a canonical one.
        let remapped = 0;
        const moves = [];                                   // { oldHandle, newHandle }
        for (const [iri, localHandle] of this._localDict.reverse) {
            const canon = this.ck.handleForIri?.(iri);
            if (canon != null && canon !== localHandle) moves.push({ oldHandle: localHandle, newHandle: canon, iri });
        }
        for (const { oldHandle, newHandle, iri } of moves) {
            this._remapHandle(oldHandle, newHandle);
            this._localDict.handles.delete(oldHandle);
            this._localDict.reverse.delete(iri);            // canonical is the source now
            remapped += 1;
        }
        if (remapped) this._emit('remap', { from: this._lastDictVersion, to: this.ck.dictVersion, count: remapped });
    }

    _remapHandle(oldH, newH) {
        // Rebuild every quad referring to oldH. Cheaper to rebuild than to mutate index keys.
        const affected = [];
        for (const [qid, q] of this.quads) {
            if (q.s === oldH || q.p === oldH || q.g === oldH || q.o === oldH ||
                (typeof q.o === 'object' && q.o.dt === oldH)) affected.push(qid);
        }
        for (const qid of affected) {
            const q = this.quads.get(qid);
            this._removeQuad(qid, q);
            const newQ = {
                s: q.s === oldH ? newH : q.s,
                p: q.p === oldH ? newH : q.p,
                g: q.g === oldH ? newH : q.g,
                o: typeof q.o === 'number'
                    ? (q.o === oldH ? newH : q.o)
                    : (q.o.dt === oldH ? { ...q.o, dt: newH } : q.o),
            };
            this._addQuad(newQ.s, newQ.p, newQ.o, newQ.g);
        }
    }
}

// ──────────────────────────────────────────────────────────────────────
// CKSubject — v3.8.1 §6 sync accessor
// ──────────────────────────────────────────────────────────────────────

export class CKSubject {
    constructor(store, urn, handle) {
        this.urn = urn;
        this.handle = handle;
        this._store = store;
    }
    exists() { return this._store.spo.has(this.handle); }
    types() {
        const pType = this._store._handleFor(RDF_TYPE_IRI);
        const ids = this._store.match({ s: this.handle, p: pType });
        return ids.map((qid) => this._store.inflate(qid)?.o).filter((v) => typeof v === 'string');
    }
    get(predUrn) {
        const p = this._store._handleFor(predUrn);
        const ids = this._store.match({ s: this.handle, p });
        if (!ids.length) return null;
        return this._store.inflate(ids[0])?.o ?? null;
    }
    getAll(predUrn) {
        const p = this._store._handleFor(predUrn);
        const ids = this._store.match({ s: this.handle, p });
        return ids.map((qid) => this._store.inflate(qid)?.o).filter((v) => v !== null);
    }
    has(predUrn, value) {
        const p = this._store._handleFor(predUrn);
        if (value === undefined) return (this._store.match({ s: this.handle, p }).length > 0);
        const o = this._store._asObject(value);
        return this._store.match({ s: this.handle, p, o }).length > 0;
    }
    *edges() {
        const ids = this._store.match({ s: this.handle });
        for (const qid of ids) {
            const q = this._store.inflate(qid);
            if (q) yield { p: q.p, o: q.o };
        }
    }
    *reverseEdges() {
        const oKey = BigInt(this.handle);
        const so = this._store.osp.get(oKey);
        if (!so) return;
        for (const [, set] of so) for (const qid of set) {
            const q = this._store.inflate(qid);
            if (q) yield { s: q.s, p: q.p };
        }
    }
}

// ──────────────────────────────────────────────────────────────────────
// CKView — v3.8.1 §7 reactive view
// ──────────────────────────────────────────────────────────────────────

export class CKView {
    constructor(store, urn, handle, opts = {}) {
        this.urn = urn;
        this.handle = handle;
        this._store = store;
        this._opts = opts;
        this._disposed = false;
        this._listeners = [];
        this._pendingAdded = [];
        this._pendingRemoved = [];
        this._coalesceScheduled = false;
    }

    exists() { return this._store.spo.has(this.handle); }
    types()                 { return new CKSubject(this._store, this.urn, this.handle).types(); }
    get(predUrn)            { return new CKSubject(this._store, this.urn, this.handle).get(predUrn); }
    getAll(predUrn)         { return new CKSubject(this._store, this.urn, this.handle).getAll(predUrn); }
    edges()                 { return new CKSubject(this._store, this.urn, this.handle).edges(); }
    reverseEdges()          { return new CKSubject(this._store, this.urn, this.handle).reverseEdges(); }

    on(eventName, fn) {
        if (this._disposed) throw new Error('CKView is disposed');
        if (eventName !== 'change') throw new Error(`CKView events: 'change' (got '${eventName}')`);
        this._listeners.push(fn);
        return () => { const i = this._listeners.indexOf(fn); if (i > -1) this._listeners.splice(i, 1); };
    }

    async fetch()                    { return this._store.resolve(this.urn); }
    async proof()                    { return this._store.proof(this.urn); }
    async validate(candidateBody)    { return this._store.validate(this._inferShapeUrn(), candidateBody); }

    _inferShapeUrn() {
        const t = this.types();
        if (!t.length) throw new Error(`CKView.validate: no rdf:type on ${this.urn}`);
        // Convention: validate the first type. Caller MAY pass an explicit shape via store.validate().
        return `ckp://Shape#${t[0].split('#').pop()}`;
    }

    dispose() {
        if (this._disposed) return;
        this._disposed = true;
        this._listeners.length = 0;
        this._store._views.delete(this.handle);
    }

    _notify(addedQids, removedQids) {
        if (this._disposed || this._listeners.length === 0) return;
        this._pendingAdded.push(...addedQids);
        this._pendingRemoved.push(...removedQids);
        if (this._coalesceScheduled) return;
        this._coalesceScheduled = true;
        queueMicrotask(() => {
            this._coalesceScheduled = false;
            if (this._disposed) return;
            const delta = {
                added:   this._pendingAdded.map((q) => simplifyEdge(this._store.inflate(q))).filter(Boolean),
                removed: this._pendingRemoved.map((q) => simplifyEdge(this._store.inflate(q))).filter(Boolean),
            };
            this._pendingAdded.length = 0;
            this._pendingRemoved.length = 0;
            for (const fn of this._listeners) {
                try { fn(delta); } catch (e) { console.error('[CKView]', this.urn, e); }
            }
        });
    }
}

// ──────────────────────────────────────────────────────────────────────
// ckBind — Stage-3 decorator (sugar over store.bind)
// ──────────────────────────────────────────────────────────────────────

export function ckBind(urn, opts = {}) {
    return function (value, context) {
        if (!context || context.kind !== 'method') {
            throw new TypeError('@ckBind must decorate a method');
        }
        context.addInitializer(function () {
            const store = this._store ?? this.store ?? this.ck;
            if (!store || typeof store.bind !== 'function') {
                throw new Error('@ckBind: expected this._store / this.store / this.ck to be a CKHexStore');
            }
            store.bind(urn, value.bind(this), opts);
        });
        return value;
    };
}

// ──────────────────────────────────────────────────────────────────────
// Helpers — kept module-local
// ──────────────────────────────────────────────────────────────────────

function looksLikeIri(s) { return typeof s === 'string' && IRI_LOOK.test(s); }

function addNested(outer, k1, k2, qid) {
    let inner = outer.get(k1);
    if (!inner) { inner = new Map(); outer.set(k1, inner); }
    let set = inner.get(k2);
    if (!set) { set = new Set(); inner.set(k2, set); }
    set.add(qid);
}

function removeNested(outer, k1, k2, qid) {
    const inner = outer.get(k1);
    if (!inner) return;
    const set = inner.get(k2);
    if (!set) return;
    set.delete(qid);
    if (set.size === 0) inner.delete(k2);
    if (inner.size === 0) outer.delete(k1);
}

function hash32(str) {
    // FNV-1a 32-bit. Good enough for in-RAM literal dedup; collisions
    // are caught at the full-quadId identity check.
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h;
}

function parseActionUrn(urn) {
    // ckp://Action#K.V  →  { kernel: K, verb: V }
    // K may contain dots (e.g. 'pgCK.Task'); V is the last segment.
    if (typeof urn !== 'string') return null;
    const m = /^ckp:\/\/Action#(.+)$/.exec(urn);
    if (!m) return null;
    const body = m[1].split('-')[0];                        // strip optional `-<timestamp>` suffix
    const dot = body.lastIndexOf('.');
    if (dot < 0) return null;
    return { kernel: body.slice(0, dot), verb: body.slice(dot + 1) };
}

function parseSubscriptionUrn(urn) {
    // Returns: { kind, kernel?, verb?, iri }
    if (urn === '*') return { kind: 'wildcard', iri: '*' };
    let m;
    if ((m = /^ckp:\/\/Kernel#([^/]+)(?:\/(.+))?$/.exec(urn))) {
        return { kind: m[2] ? 'kernel-verb' : 'kernel', kernel: m[1], verb: m[2] ?? null, iri: urn };
    }
    if ((m = /^ckp:\/\/Instance#(.+)$/.exec(urn))) {
        return { kind: 'instance', iri: urn };
    }
    if ((m = /^ckp:\/\/Edge#(.+)$/.exec(urn))) {
        return { kind: 'edge', iri: urn };
    }
    if ((m = /^ckp:\/\/Project#(.+)$/.exec(urn))) {
        return { kind: 'project', project: m[1], iri: urn };
    }
    if ((m = /^ckp:\/\/Domain#(.+)$/.exec(urn))) {
        return { kind: 'domain', domain: m[1], iri: urn };
    }
    return { kind: 'unknown', iri: urn };
}

function urnMatches(pattern, msg, subjectIri, subjectHandle, addedPredicateHandles, store) {
    if (pattern === '*') return true;
    const p = parseSubscriptionUrn(pattern);
    switch (p.kind) {
        case 'kernel':       return msg.kernel === p.kernel;
        case 'kernel-verb':  return msg.kernel === p.kernel && msg.verb === p.verb;
        case 'instance':     return subjectIri === p.iri;
        case 'edge': {
            const target = store._handleFor(p.iri);
            return addedPredicateHandles.has(target);
        }
        case 'project':      /* awaits pgCK project-index publish */ return false;
        case 'domain':       /* awaits pgCK domain-index publish */ return false;
        case 'wildcard':     return true;
        default:             return false;
    }
}

function deflateResult(msg) {
    return {
        outcome:    msg.data?.outcome ?? (msg.kind === 'error' ? 'error' : 'success'),
        subjectIri: msg.subjectIri ?? msg.data?.['@id'] ?? null,
        proof:      msg.data?.proof ?? null,
        data:       msg.data,
        headers:    msg.headers ?? {},
        traceId:    msg.traceId ?? null,
    };
}

function simplifyEdge(inflated) {
    if (!inflated) return null;
    return { p: inflated.p, o: inflated.o };
}

// ──────────────────────────────────────────────────────────────────────
// Module exports
// ──────────────────────────────────────────────────────────────────────

if (typeof window !== 'undefined') window.CKHexStore = CKHexStore;
export default CKHexStore;
