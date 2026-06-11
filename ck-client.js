/**
 * CK Web Client — NATS WebSocket Client for Concept Kernels
 *
 * Self-contained ESM module. nats.ws + @msgpack/msgpack are vendored locally
 * under ./vendor/ (no runtime CDN fetch; air-gapped / supply-chain closed, v1.4.2).
 *
 * Usage:
 *   <script type="module" src="https://lib.tech.games/ck-client.js"></script>
 *   <script type="module">
 *     const ck = new CKClient({ kernel: 'TechGames.Cymatics' });
 *     await ck.connect();
 *     // subscribed to result + event (both short-form alias AND v3.8 long-form), anonymous ready
 *
 *     ck.send({ action: 'ping' });               // → input.TechGames.Cymatics  (short-form publish)
 *     await ck.login('test26', 'test26');         // Keycloak JWT upgrade → RECONNECTS with JWT
 *     ck.logout();                                // back to anonymous (reconnects)
 *
 *     ck.on('result',    msg => ...);  // { subject, headers, data, traceId }
 *     ck.on('event',     msg => ...);  // codec-transparent: data is decoded (JSON or MsgPack)
 *     ck.on('broadcast', msg => ...);  // non-kernel-derived subjects from extraSubjects:
 *     ck.on('status',    state => ...);// { connection, auth }
 *     ck.on('error',     err => ...);  // per-kernel errors on event.kernel.<K>.error
 *   </script>
 *
 * Constructor options (v1.3.0+):
 *   kernel            — kernel name (enables auto-subscribe to result/event)
 *   wssEndpoint       — NATS WSS URL
 *   realm, clientId   — Keycloak realm + client_id (default: 'pgck' or 'techgames', 'ck-browser')
 *   subscribe         — ['event','result'] (default). Set ['event'] for broadcast-only roles.
 *   extraSubjects     — ['broadcast.<project>.<channel>', ...] — emits on 'broadcast' channel
 *   topicDefs         — caller-supplied topic list (advanced; overrides kernel-derived)
 *   dictVersion       — current local dictionary version (default 0)
 *
 * Design (v1.3 contract per COMPLIANCE):
 *   - NATS-only data plane. No REST API surface. Auth bootstrap uses Keycloak HTTP only.
 *   - Control attributes in NATS headers; body is pure application data.
 *   - Codec transparent: msg.data is always decoded (JSON v1.2 / MsgPack v1.3); codec on msg.headers.
 *   - Per-subject dedup via Ck-Seq header (graceful: no header → no dedup).
 *   - Dual-subscribe v1.3: receives both short-form (input.<K>) and long-form (input.kernel.<K>.action.<verb>).
 *   - Auto-subscribe to event.kernel.Dictionary.* for internal IRI handle table maintenance.
 *   - Reconnect on auth upgrade (login/logout/token refresh) for consistent permission ACLs.
 */

import { connect, JSONCodec, headers } from "./vendor/nats.ws.js";
import { decode as msgpackDecode, encode as msgpackEncode } from "./vendor/msgpack.js";
const nats = { connect, JSONCodec, headers };

const DEDUP_MAX_PER_SUBJECT = 1000;

class CKClient {
    constructor(config = {}) {
        this.kernel = config.kernel || null;

        this.config = {
            wssEndpoint: config.wssEndpoint || 'wss://stream.tech.games',
            authenticator: config.authenticator || null,
            authEndpoint: config.authEndpoint || 'https://id.tech.games',
            realm: config.realm || 'techgames',
            clientId: config.clientId || 'ck-browser',
            stateEndpoint: config.stateEndpoint || '/api/state',
            maxReconnectAttempts: config.maxReconnectAttempts || 10,
            reconnectDelay: config.reconnectDelay || 1000,
        };

        // Channels to auto-subscribe (v1.3 — default preserves v1.2 behavior)
        this._subscribeChannels = config.subscribe || ['event', 'result'];

        // Extra non-kernel-derived subjects (v1.3) — emit on 'broadcast'
        this._extraSubjects = config.extraSubjects || [];

        // Per-kernel topic derivation. v1.3 carries BOTH forms:
        //   short = input.<K> (v1.2 alias, deprecated, removed in v2.0)
        //   long  = input.kernel.<K>.action.<verb> (v3.8 canonical)
        this.topics = this.kernel ? {
            input:           `input.${this.kernel}`,                                  // short publish
            inputLongPrefix: `input.kernel.${this.kernel}.action.`,                   // long publish (append verb)
            result:          `result.${this.kernel}`,                                 // short subscribe
            resultLong:      `result.kernel.${this.kernel}.action.>`,                 // long subscribe wildcard
            event:           `event.${this.kernel}`,                                  // short subscribe
            eventLong:       `event.kernel.${this.kernel}.>`,                         // long subscribe wildcard
            error:           `event.kernel.${this.kernel}.error`,                     // per-kernel error (v1.3)
        } : null;

        // Allow advanced callers to override completely
        if (config.topicDefs) this.topicDefs = config.topicDefs;
        else this.topicDefs = this.kernel ? [
            { name: `input.${this.kernel}`,                       dir: 'pub', access: 'anon' },
            { name: `input.kernel.${this.kernel}.action.>`,       dir: 'pub', access: 'anon' },
            { name: `result.${this.kernel}`,                      dir: 'sub', access: 'anon' },
            { name: `result.kernel.${this.kernel}.action.>`,      dir: 'sub', access: 'anon' },
            { name: `event.${this.kernel}`,                       dir: 'sub', access: 'anon' },
            { name: `event.kernel.${this.kernel}.>`,              dir: 'sub', access: 'anon' },
            { name: `admin.${this.kernel}`,                       dir: 'pub', access: 'auth' },
            { name: `metrics.${this.kernel}`,                     dir: 'sub', access: 'auth' },
        ] : [];

        // v1.3 dictionary state (per-project IRI handle table). Maintained internally.
        this._dict = {
            version: config.dictVersion || 0,
            handles: new Map(),   // handle (int) → iri (string)
            reverse: new Map(),   // iri (string) → handle (int)
        };

        // v1.3 per-subject dedup state (Ck-Seq header)
        this._seenSeqs = new Map();   // subject → Set<seq>

        this.nc = null;
        this._subs = [];
        this._clientId = this._id();
        this.connection = 'disconnected';
        this.auth = { anonymous: true, userId: null, token: null, refreshToken: null };

        this._handlers = {
            result: [], event: [], status: [], error: [], broadcast: [],
        };

        // v1.5.0 dispatch-transport state (additive over the v1.3 NATS client).
        this._pending = new Map();          // traceId → { resolve, reject, timer } (request/reply correlation)
        this._scopeListeners = new Set();   // fn(instance|reply) — granted-scope delivery for subscribe()
        this._dispatchMode = config.dispatchMode || 'v3.8';      // v3.8 subject-grammar shim until pgCK CI-B
        this._dispatchIngress = config.dispatchIngress || 'ckp.dispatch';
        this._dispatchTimeout = config.dispatchTimeout || 15000;
    }

    // ── Public API ───────────────────────────────────────────────────────

    /** Connect to NATS, provision anonymous identity, auto-subscribe per channels + extraSubjects. */
    async connect() {
        this._setConnection('connecting');
        try {
            this._setAnonymous();
            this.nc = await this._openConnection();
            this._watchConnection();
            this._setConnection('connected');
            this._subscribeAll();
            return true;
        } catch (e) {
            this._setConnection('error', e);
            throw e;
        }
    }

    /**
     * Send data to this kernel. Publishes on short-form input.<K> for backwards compat;
     * if data.action is present, also publishes on long-form input.kernel.<K>.action.<verb>.
     * Returns the generated traceId.
     */
    async send(data) {
        if (!this.nc) throw new Error('Not connected');
        if (!this.topics) throw new Error('No kernel configured');
        await this._maybeRefreshToken();
        const traceId = this._traceId();
        const h = this._headers(traceId);
        const jc = nats.JSONCodec();
        const body = { timestamp: new Date().toISOString(), ...data };
        const encoded = jc.encode(body);
        // Short-form (deprecated, removed v2.0)
        this.nc.publish(this.topics.input, encoded, { headers: h });
        // Long-form (canonical v3.8) — only when caller provided an action verb
        if (data && data.action) {
            const longTopic = this.topics.inputLongPrefix + String(data.action);
            this.nc.publish(longTopic, encoded, { headers: h });
        }
        return traceId;
    }

    /** Keycloak login → upgrade anonymous to authenticated → RECONNECT with JWT (v1.3 locked). */
    async login(username, password) {
        const url = `${this.config.authEndpoint}/realms/${this.config.realm}/protocol/openid-connect/token`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ grant_type: 'password', client_id: this.config.clientId, username, password }),
        });
        if (!res.ok) throw new Error(`Auth failed: ${res.status}`);
        const d = await res.json();
        const jwt = this._parseJwt(d.access_token);
        this.auth = {
            anonymous: false,
            userId: jwt?.preferred_username || jwt?.sub || username,
            token: d.access_token,
            refreshToken: d.refresh_token,
            expiresAt: new Date(Date.now() + d.expires_in * 1000),
            claims: jwt,
        };
        if (this.nc) await this._reconnectWithCurrentAuth();
        this._emitStatus();
        return this.auth.userId;
    }

    /** Downgrade back to anonymous and reconnect (drops authenticated permissions). */
    async logout() {
        this._setAnonymous();
        if (this.nc) await this._reconnectWithCurrentAuth();
        this._emitStatus();
    }

    /** Disconnect from NATS. */
    async disconnect() {
        for (const s of this._subs) { try { s.unsubscribe(); } catch (e) {} }
        this._subs = [];
        for (const [, p] of this._pending) clearTimeout(p.timer);
        this._pending.clear();
        this._scopeListeners.clear();
        if (this.nc) { await this.nc.drain(); this.nc = null; }
        this._setConnection('disconnected');
    }

    /** Save state to filer by logical key. */
    saveState(key, data, { keepalive = false } = {}) {
        const url = `${this.config.stateEndpoint}/${key}.json`;
        const opts = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
            keepalive,
        };
        if (this.auth.token) opts.headers['Authorization'] = `Bearer ${this.auth.token}`;
        return fetch(url, opts);
    }

    /** Load state from filer by logical key. */
    async loadState(key) {
        await this._maybeRefreshToken();
        const url = `${this.config.stateEndpoint}/${key}.json`;
        const h = {};
        if (this.auth.token) h['Authorization'] = `Bearer ${this.auth.token}`;
        const res = await fetch(url, { headers: h });
        if (!res.ok) return null;
        return res.json();
    }

    /** Subscribe to events: 'result', 'event', 'status', 'error', 'broadcast'. */
    on(event, fn) { if (this._handlers[event]) this._handlers[event].push(fn); }
    off(event, fn) {
        const a = this._handlers[event];
        if (a) { const i = a.indexOf(fn); if (i > -1) a.splice(i, 1); }
    }

    // ── v1.5.0 dispatch-transport surface (the L0 interface the ck.js facade composes) ──

    /**
     * The single outbound primitive: carry the four-tuple ⟨verb, kernel_urn, payload, identity⟩ to
     * pgCK and await the typed reply. Identity is the verified JWT the connection already carries — the
     * client never asserts it. Against a pre-CI-B pgCK the transitional `v3.8` shim maps the verb to its
     * per-verb subject; switch `dispatchMode:'v3.9'` once pgCK presents `ckp.dispatch` natively.
     */
    async dispatch(verb, kernelUrn, payload = {}, opts = {}) {
        if (!this.nc) throw new Error('Not connected');
        await this._maybeRefreshToken();
        const traceId = this._traceId();
        const h = this._headers(traceId);
        h.set('Ck-Verb', String(verb));
        if (kernelUrn) h.set('Ck-Kernel', String(kernelUrn));
        const jc = nats.JSONCodec();

        let subject, body;
        if (this._dispatchMode === 'v3.9') {
            subject = this._dispatchIngress;                   // ckp.dispatch closed ingress
            body = { verb, kernel_urn: kernelUrn, payload };   // identity is server-derived (TR-02)
        } else {
            const name = (kernelUrn || '').replace('ckp://Kernel#', '') || this.kernel;
            subject = `input.kernel.${name}.action.${verb}`;   // v3.8 subject-grammar shim (removed at CI-B)
            body = { action: verb, ...payload };
        }

        return new Promise((resolve, reject) => {
            const timeout = opts.timeout || this._dispatchTimeout;
            const timer = setTimeout(() => {
                this._pending.delete(traceId);
                reject(new Error(`dispatch('${verb}') timed out after ${timeout}ms`));
            }, timeout);
            this._pending.set(traceId, { resolve, reject, timer });
            try {
                this.nc.publish(subject, jc.encode({ timestamp: new Date().toISOString(), ...body }), { headers: h });
            } catch (e) {
                clearTimeout(timer); this._pending.delete(traceId); reject(e);
            }
        });
    }

    _resolvePending(traceId, reply) {
        const p = this._pending.get(traceId);
        if (!p) return;
        clearTimeout(p.timer);
        this._pending.delete(traceId);
        p.resolve(reply);
    }

    /** Subscribe the kernel's granted result/event scope; each granted message → onMsg(instance|reply). */
    subscribe(kernelUrn, onMsg) {
        if (typeof onMsg !== 'function') return () => {};
        this._scopeListeners.add(onMsg);
        return () => this._scopeListeners.delete(onMsg);
    }

    /** Discover the kernel's declared, identity-granted affordances (degrades to [] honestly). */
    async affordances(kernelUrn) {
        try {
            const r = await this.dispatch('kernel.affordances', kernelUrn, {});
            return (r && (r.result || r.affordances)) || [];
        } catch (e) { return []; }
    }

    /** Transport close — alias for disconnect (the facade calls close()). */
    async close() { return this.disconnect(); }

    /** v1.3 — lookup dictionary handle for an IRI (returns null if unknown). */
    handleForIri(iri) { return this._dict.reverse.get(iri) ?? null; }
    /** v1.3 — lookup IRI for a dictionary handle (returns null if unknown). */
    iriForHandle(handle) { return this._dict.handles.get(handle) ?? null; }
    /** v1.3 — current local dictionary version. */
    get dictVersion() { return this._dict.version; }

    // ── Convenience getters ──────────────────────────────────────────────

    get isConnected() { return this.connection === 'connected'; }
    get isAnonymous() { return this.auth.anonymous; }
    get userId() { return this.auth.userId; }

    // ── Internal ─────────────────────────────────────────────────────────

    async _openConnection() {
        const connectOpts = {
            servers: this.config.wssEndpoint,
            maxReconnectAttempts: this.config.maxReconnectAttempts,
            reconnectTimeWait: this.config.reconnectDelay,
            // v1.3: embed dictionary version + browser identity in CONNECT `name` field
            // (NATS Core lacks structured CONNECT extensions; pgCK parses `name` server-side)
            name: `ck-browser;dict-v=${this._dict.version};client=${this._clientId}`,
        };
        if (this.config.authenticator) connectOpts.authenticator = this.config.authenticator;
        if (this.auth.token) connectOpts.token = this.auth.token;
        return nats.connect(connectOpts);
    }

    async _reconnectWithCurrentAuth() {
        for (const s of this._subs) { try { s.unsubscribe(); } catch (e) {} }
        this._subs = [];
        try { await this.nc.drain(); } catch (e) {}
        this.nc = null;
        this._setConnection('connecting');
        this.nc = await this._openConnection();
        this._watchConnection();
        this._setConnection('connected');
        this._subscribeAll();
    }

    _subscribeAll() {
        if (!this.topics) {
            // No kernel — still process extraSubjects
            for (const subject of this._extraSubjects) this._sub(subject, 'broadcast');
            return;
        }

        // result channel (short + long forms)
        if (this._subscribeChannels.includes('result')) {
            this._sub(this.topics.result,     'result');
            this._sub(this.topics.resultLong, 'result');
        }
        // event channel (short + long forms)
        if (this._subscribeChannels.includes('event')) {
            this._sub(this.topics.event,     'event');
            this._sub(this.topics.eventLong, 'event');
        }
        // error channel (always auto-subscribed when kernel is set; v1.3 §3 locked)
        this._sub(this.topics.error, 'error');

        // Dictionary subjects — internal handling, no user-facing emit
        this._subDict();

        // Extra subjects (broadcast.<project>.<channel> etc.)
        for (const subject of this._extraSubjects) this._sub(subject, 'broadcast');
    }

    _sub(topic, eventName) {
        const jc = nats.JSONCodec();
        const sub = this.nc.subscribe(topic);
        this._subs.push(sub);
        (async () => {
            for await (const msg of sub) {
                try {
                    // Read headers (NATS header values are arrays of strings)
                    const hdrs = {};
                    if (msg.headers) for (const [k, v] of msg.headers) hdrs[k] = v.join(',');

                    // Per-subject dedup via Ck-Seq header (graceful: no header → no dedup)
                    const seqRaw = hdrs['Ck-Seq'] || hdrs['ck-seq'];
                    if (seqRaw !== undefined) {
                        if (this._isSeen(msg.subject, seqRaw)) continue;
                        this._markSeen(msg.subject, seqRaw);
                    }

                    // Codec swap: Content-Encoding=msgpack → binary, else JSON
                    const enc = hdrs['Content-Encoding'] || hdrs['content-encoding'];
                    let data;
                    if (enc && enc.toLowerCase() === 'msgpack') {
                        data = msgpackDecode(msg.data);
                    } else {
                        data = jc.decode(msg.data);
                    }

                    const traceId = hdrs['Trace-Id'] || (data && data.trace_id) || '';

                    // v1.3.12 — typed envelope: derive kind/subjectIri/conceptType/kernel/verb.
                    // Additive fields; existing consumers reading only {subject,headers,data,traceId} unaffected.
                    const { kind, subjectIri, conceptType, kernel, verb } =
                        this._deriveEnvelope(eventName, msg.subject, data);

                    // v1.5.0 — resolve a pending dispatch by Trace-Id; deliver granted-scope to subscribe() listeners.
                    if (eventName === 'result' && traceId && this._pending.has(traceId)) this._resolvePending(traceId, data);
                    if (eventName === 'result' || eventName === 'event') {
                        for (const fn of this._scopeListeners) { try { fn(data); } catch (e) {} }
                    }

                    this._emit(eventName, {
                        subject: msg.subject, headers: hdrs, data, traceId,
                        kind, subjectIri, conceptType, kernel, verb,
                    });
                } catch (e) { console.error('[CKClient] decode error:', e, 'subject:', msg.subject); }
            }
        })();
    }

    /**
     * v1.3.12 — derive typed-envelope fields from the eventName + NATS subject + decoded body.
     * - kind         : 'event' | 'result' | 'broadcast' | 'error' (the channel the consumer is subscribed to)
     * - subjectIri   : data['@id'] when present (pgCK seal projection stamps this), else null
     * - conceptType  : data['type'] ?? data['@type'] — string | string[] | null
     * - kernel       : 'pgCK.Task' parsed from NATS subject (long-form `<kind>.kernel.<K>.<verb>` preferred,
     *                  short-form `<kind>.<K>` fallback; null for broadcast/extraSubjects)
     * - verb         : last subject segment in long-form (e.g. 'sealed'); null in short-form / broadcast
     */
    _deriveEnvelope(eventName, natsSubject, data) {
        const kind = eventName;

        let kernel = null, verb = null;
        // Long form: event.kernel.<K-with-dots>.<verb>  /  input.kernel.<K>.action.<verb>
        const longMatch = /^(?:event|input|result|stream)\.kernel\.(.+)\.([^.]+)$/.exec(natsSubject);
        if (longMatch) {
            kernel = longMatch[1];
            // For input/result subjects with .action.<verb>, strip the trailing '.action' off kernel
            if (kernel.endsWith('.action')) kernel = kernel.slice(0, -'.action'.length);
            verb = longMatch[2];
        } else {
            // Short form: event.<K-with-dots>  (deprecated v1.x alias)
            const shortMatch = /^(?:event|input|result|stream)\.(.+)$/.exec(natsSubject);
            if (shortMatch) kernel = shortMatch[1];
        }

        let subjectIri = null, conceptType = null;
        if (data && typeof data === 'object') {
            conceptType = data['@type'] ?? data['type'] ?? null;
            if (typeof data['@id'] === 'string') {
                subjectIri = data['@id'];
            } else if (conceptType) {
                // v1.3.14 defensive fallback (per pgCK NOTIFY thread §2): when @id is absent,
                // derive subjectIri from conceptType + the type's id predicate
                // (e.g. Task → .../task_id). NEVER pick `urn:ckp:participant:*` values as the
                // subject — those identify the actor of the action, not the affected resource.
                const typeStr = Array.isArray(conceptType) ? conceptType[0] : conceptType;
                if (typeof typeStr === 'string') {
                    const typeName = typeStr.split(/[/#]/).pop();
                    if (typeName) {
                        const idKeyTail = typeName.toLowerCase() + '_id';
                        for (const [k, v] of Object.entries(data)) {
                            if (k.endsWith(idKeyTail) && typeof v === 'string'
                                && !v.startsWith('urn:ckp:participant:')) {
                                subjectIri = v;
                                break;
                            }
                        }
                    }
                }
            }
        }

        return { kind, subjectIri, conceptType, kernel, verb };
    }

    _subDict() {
        const subject = 'event.kernel.Dictionary.>';
        const jc = nats.JSONCodec();
        const sub = this.nc.subscribe(subject);
        this._subs.push(sub);
        (async () => {
            for await (const msg of sub) {
                try {
                    const data = jc.decode(msg.data);
                    if (msg.subject.endsWith('.v_bumped')) {
                        // { from, to, delta: [{handle, iri}, ...] }
                        if (data.from === this._dict.version) {
                            for (const { handle, iri } of (data.delta || [])) {
                                this._dict.handles.set(handle, iri);
                                this._dict.reverse.set(iri, handle);
                            }
                            this._dict.version = data.to;
                        }
                        // Out-of-sync deltas are silently dropped; server resends snapshot on next CONNECT.
                    } else if (msg.subject.endsWith('.snapshot')) {
                        // { version, entries: [{handle, iri}, ...] }
                        this._dict.handles.clear();
                        this._dict.reverse.clear();
                        for (const { handle, iri } of (data.entries || [])) {
                            this._dict.handles.set(handle, iri);
                            this._dict.reverse.set(iri, handle);
                        }
                        this._dict.version = data.version;
                    }
                    // Intentionally do NOT emit on 'event' — dictionary is internal infrastructure.
                } catch (e) { console.error('[CKClient] dict decode error:', e); }
            }
        })();
    }

    _isSeen(subject, seq) {
        const set = this._seenSeqs.get(subject);
        return set ? set.has(seq) : false;
    }

    _markSeen(subject, seq) {
        let set = this._seenSeqs.get(subject);
        if (!set) { set = new Set(); this._seenSeqs.set(subject, set); }
        set.add(seq);
        // Simple eviction: when set exceeds cap, drop oldest half
        if (set.size > DEDUP_MAX_PER_SUBJECT) {
            const arr = Array.from(set);
            for (const s of arr.slice(0, Math.floor(DEDUP_MAX_PER_SUBJECT / 2))) set.delete(s);
        }
    }

    _headers(traceId) {
        const h = nats.headers();
        h.set('Nats-Msg-Id', this._id());
        h.set('Trace-Id', traceId);
        h.set('X-Kernel-ID', this._clientId);
        h.set('X-User-ID', this.auth.userId || 'anonymous');
        h.set('X-Anonymous', String(this.auth.anonymous));
        if (this.auth.token) h.set('Authorization', `Bearer ${this.auth.token}`);
        return h;
    }

    async _maybeRefreshToken() {
        if (!this.auth.refreshToken || !this.auth.expiresAt) return;
        if (Date.now() + 30000 < this.auth.expiresAt.getTime()) return;
        try {
            const url = `${this.config.authEndpoint}/realms/${this.config.realm}/protocol/openid-connect/token`;
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    grant_type: 'refresh_token',
                    client_id: this.config.clientId,
                    refresh_token: this.auth.refreshToken,
                }),
            });
            if (!res.ok) {
                // Refresh failed — fall back to anonymous + reconnect (v1.3 locked)
                this._setAnonymous();
                if (this.nc) await this._reconnectWithCurrentAuth();
                this._emitStatus();
                return;
            }
            const d = await res.json();
            this.auth.token = d.access_token;
            this.auth.expiresAt = new Date(Date.now() + d.expires_in * 1000);
            if (d.refresh_token) this.auth.refreshToken = d.refresh_token;
            this.auth.claims = this._parseJwt(d.access_token);
            // v1.3 locked: reconnect on token refresh to refresh server-side permissions
            if (this.nc) await this._reconnectWithCurrentAuth();
            this._emitStatus();
        } catch (e) {
            console.warn('[CKClient] Token refresh failed:', e.message);
        }
    }

    _setAnonymous() {
        this.auth = { anonymous: true, userId: `anon_${this._id()}`, token: null, refreshToken: null };
    }

    _setConnection(status, error = null) {
        this.connection = status;
        this._emitStatus(error);
    }

    _watchConnection() {
        if (!this.nc) return;
        this.nc.closed().then(e => { if (e) console.error('[CKClient] closed:', e); this._setConnection('disconnected'); });
        (async () => {
            for await (const s of this.nc.status()) {
                if (s.type === 'reconnecting') this._setConnection('connecting');
                else if (s.type === 'reconnect') this._setConnection('connected');
                else if (s.type === 'disconnect') this._setConnection('disconnected');
            }
        })();
    }

    _emitStatus(error = null) {
        this._emit('status', { connection: this.connection, auth: { ...this.auth }, error });
    }

    _emit(event, data) {
        const a = this._handlers[event];
        if (a) for (const fn of a) { try { fn(data); } catch (e) {} }
    }

    _id() { return 'xxxx-xxxx-xxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16)); }
    _traceId() { return 'tx-' + 'xxxxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16)); }
    _parseJwt(t) { try { return JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); } catch (e) { return null; } }
}

if (typeof window !== 'undefined') window.CKClient = CKClient;
export { CKClient, msgpackEncode, msgpackDecode };
export default CKClient;
