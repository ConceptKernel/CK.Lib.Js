/**
 * CK Web Client — NATS WebSocket Client for Concept Kernels
 *
 * Self-contained ESM module. nats.ws + @msgpack/msgpack are vendored locally
 * under ./vendor/ (no runtime CDN fetch; air-gapped / supply-chain closed, v1.4.2).
 *
 * Usage:
 *   <script type="module" src="/cklib/ck-client.js"></script>
 *   <script type="module">
 *     const ck = new CKClient({ kernel: 'TechGames' });   // no '.' — see the constructor guard below
 *     await ck.connect();
 *     // subscribed to the long-form result + event subjects (door §4: the closed grammar)
 *
 *     ck.send({ action: 'ping' });               // → input.TechGames.Cymatics  (short-form publish)
 *     await ck.login(username, password);         // Keycloak JWT upgrade → RECONNECTS with JWT
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
 *   realm, clientId   — Keycloak realm + client_id (no hardcoded defaults — set all explicitly)
 *   subscribe         — ['event','result'] (default). Set ['event'] for broadcast-only roles.
 *   extraSubjects     — ['broadcast.<project>.<channel>', ...] — emits on 'broadcast' channel
 *   topicDefs         — caller-supplied topic list (advanced; overrides kernel-derived)
 *   dictVersion       — current local dictionary version (default 0)
 *
 * Design:
 *   - NATS-only data plane. No REST API surface. Auth bootstrap uses Keycloak HTTP only.
 *   - Control attributes in NATS headers; body is pure application data.
 *   - Codec transparent: msg.data is always decoded (JSON v1.2 / MsgPack v1.3); codec on msg.headers.
 *   - Per-subject dedup via Ck-Seq header (graceful: no header → no dedup).
 *   - Dual-subscribe v1.3: receives both short-form (input.<K>) and long-form (input.kernel.<K>.action.<verb>).
 *   - Reconnect on auth upgrade (login/logout/token refresh) for consistent permission ACLs.
 */

import { connect, JSONCodec, headers } from "./vendor/nats.ws.js";
import { decode as msgpackDecode, encode as msgpackEncode } from "./vendor/msgpack.js";
const nats = { connect, JSONCodec, headers };

const DEDUP_MAX_PER_SUBJECT = 1000;

/**
 * A kernel name's WIRE form — the token NATS actually routes on. Leave alone where facts
 * remember: a name with no '.'/'*'/'>'/whitespace already has a working literal subject (pgCK,
 * demo, ...) — the broker's grant and every sealed provenance record reference that
 * exact casing, so it passes through untouched. Lowercase where nothing remembers: a dotted name
 * (CK.Lib.Js, pgCK.MCP) has NO working literal form — pgCK's configured_kernels() drops any
 * '.'-bearing token unconditionally, so nothing has ever routed successfully under the raw name —
 * and adopts the same lowercase-dash form the credential plane already computes for its BOT
 * identity (pgCK.MCP/pgck-mcp:78's regex), rather than inventing a second convention.
 * Measured against pgCK's grant logic and pgck-mcp's BOT slug, 2026-08-11/12.
 */
function slugKernel(name) {
    if (!name) return name;
    // v1.6.1 (R1.2): lowercase UNCONDITIONALLY. The old early-return skipped case handling for
    // undotted names, so the one hardcoded uppercase default was the one name it could not fix —
    // and NATS subject tokens have no case folding, so an uppercase twin is a separate kernel
    // nothing can seal into (the substrate's own refusal text). Canonical form: ^[a-z0-9]+(-[a-z0-9]+)*$.
    return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const KNOWN_OPTIONS = new Set([
    'kernel', 'gov', 'wssEndpoint', 'authenticator', 'tokenProvider', 'authEndpoint',
    'realm', 'clientId', 'maxReconnectAttempts', 'reconnectDelay', 'subscribe',
    'extraSubjects', 'dispatchTimeout',
]);

class CKClient {
    constructor(config = {}) {
        // v1.6.1 (R0.4/R0.5, charter §3): STRICT options. An unknown key throws, naming it —
        // stronger than any per-key guard: it catches every typo AND every retired option
        // without carrying a single retired name in the file.
        for (const k of Object.keys(config)) {
            if (!KNOWN_OPTIONS.has(k)) throw new Error(
                `CKClient: unknown option '${k}'. Known: ${[...KNOWN_OPTIONS].join(', ')}. ` +
                `Retired options (v1.6.1 purge) are refused rather than ignored.`);
        }
        // charter §3: a kernel is a wire-meaning value — REQUIRED, no default, thrown before any I/O.
        if (!config.kernel) throw new Error(
            "CKClient: `kernel` is required and has no default — it selects every subject this " +
            "client touches. Pass the kernel this connection operates as.");
        this.kernel = config.kernel;

        // The wire form (see slugKernel above) — used for every NATS subject built below and in
        // dispatch(). `this.kernel` itself stays raw/dotted: it's what callers named, what shows
        // up in URNs and error messages, and what a caller compares against (e.g. G5a's
        // gov !== kernel check) — only the string actually handed to nc.publish/subscribe changes.
        this._wireKernel = this.kernel ? slugKernel(this.kernel) : null;

        // Fail fast only on the truly unroutable case — nothing left after normalization (a name
        // that was pure separators/wildcards, e.g. '...' or '***') — instead of building an empty
        // subject token and finding out on the first dispatch. A dotted name is no longer refused
        // here: it is translated (this._wireKernel), not rejected.
        if (this.kernel && !this._wireKernel) {
            throw new Error(
                `CKClient: kernel name '${this.kernel}' has no routable form — nothing but ` +
                `separators/wildcards remain after normalization. Choose a kernel segment with ` +
                `at least one letter or digit.`
            );
        }

        // Endpoints derive from the page origin (same-origin /wss behind Envoy) when a browser
        // location exists; otherwise they MUST be passed explicitly (guarded at connect/login). No
        // hardcoded deployment default — a no-config client must never auto-target a fixed host.
        const _loc = (typeof globalThis !== 'undefined' && globalThis.location && globalThis.location.host)
            ? globalThis.location : null;
        this.config = {
            wssEndpoint: config.wssEndpoint || (_loc ? `wss://${_loc.host}/wss` : null),
            authenticator: config.authenticator || null,
            tokenProvider: config.tokenProvider || null,   // #14 Mode A — app-owned token, forwarded
            authEndpoint: config.authEndpoint || (_loc ? `${_loc.protocol}//${_loc.host}` : null),
            realm: config.realm || null,
            // v1.6.1 (R0.5): no defaulted clientId — the old default was the realm's wide-open
            // client. login() requires it explicitly.
            clientId: config.clientId || null,
            maxReconnectAttempts: config.maxReconnectAttempts || 10,
            reconnectDelay: config.reconnectDelay || 1000,
        };

        // Channels to auto-subscribe (v1.3 — default preserves v1.2 behavior)
        this._subscribeChannels = config.subscribe || ['event', 'result'];

        // Extra non-kernel-derived subjects (v1.3) — emit on 'broadcast'
        this._extraSubjects = config.extraSubjects || [];

        // v1.6.1 (R0.1, door §4): the subject grammar is CLOSED and long-form only. The
        // pre-v3.11 short forms (result.<k>, event.<k>, input.<k>) are refused by every scoped
        // door — measured: three refused subscriptions per connect, invisible until the O-1 fix.
        const wk = this._wireKernel;
        this.topics = wk ? {
            resultLong: `result.kernel.${wk}.>`,        // replies — PUBLISHED, never an inbox
            eventLong:  `event.kernel.${wk}.>`,         // sealed events
            error:      `event.kernel.${wk}.error`,     // per-kernel error channel
        } : null;

        // v1.3 per-subject dedup state (Ck-Seq header)
        this._seenSeqs = new Map();   // subject → Set<seq>

        this.nc = null;
        this._subs = [];
        this._clientId = this._id();
        this.connection = 'disconnected';
        this.auth = { anonymous: true, userId: null, token: null, refreshToken: null };

        this._handlers = {
            result: [], event: [], status: [], error: [], broadcast: [], late: [],
        };
        // v1.6.1 (R6.4 / A-13): ring buffer of timed-out dispatches, so the reply that arrives
        // AFTER its timeout is emitted as 'late' — an observation, never an auto-retry. Only the
        // published-reply model makes this possible; an inbox client could not see it at all.
        this._expired = new Map();          // traceId → { verb, at }
        // v1.6.1 (R6.5 / A-14): per-subject subscription health. A refused subscription dies
        // alone while others flow — this map is what makes that visible. States: 'subscribed'
        // (grant not refused — NOT proof of liveness; granted-and-idle is indistinguishable,
        // Q-6 stands) · 'refused' (broker said no).
        this._subjectHealth = new Map();    // subject → { scope, state }

        // v1.5.0 dispatch-transport state (additive over the v1.3 NATS client).
        this._pending = new Map();          // traceId → { resolve, reject, timer } (request/reply correlation)
        this._scopeListeners = new Set();   // fn(instance|reply) — granted-scope delivery for subscribe()
        this._dispatchTimeout = config.dispatchTimeout || 15000;
        // Governance door: governed verbs (instance.*/kernel.*/concept.match/surface.*) are answered
        // HERE (input.kernel.<gov>.…action.<verb> → result.kernel.<gov>.<verb>), not on the target
        // kernel's subject. Only DELEGATED agent.* verbs ride the target kernel.
        // v1.6.1 (R1.1, M-1): gov DERIVES from the activated kernel — never a literal. The old
        // default was an uppercase kernel id the substrate refuses BY NAME (P0001, not canonical):
        // loud on wildcard doors, silent on scoped ones. No wire-meaning defaults, ever.
        this._gov = slugKernel(config.gov || this.kernel) || null;
    }

    // ── Public API ───────────────────────────────────────────────────────

    /** Connect to NATS, provision anonymous identity, auto-subscribe per channels + extraSubjects. */
    async connect() {
        if (!this.config.wssEndpoint) throw new Error("CKClient: `wssEndpoint` is required (no browser location to derive `wss://<host>/wss`) — pass it explicitly.");
        this._setConnection('connecting');
        try {
            this._setAnonymous();
            this.nc = await this._openConnection();
            this._watchConnection();
            this._setConnection('connected');
            // v1.6.1 (R0.9, charter §4): there is NO anonymous tier. A door that admits an
            // unverified connection is NON-CONFORMANT (CK-DOOR v1.6.1 §2/§3) — say so at once
            // instead of proceeding to measure grants that mean nothing. No flag, no opt-out.
            if (this.auth.anonymous) {
                try { await this.nc?.close?.(); } catch {}
                this._setConnection('disconnected');
                throw new Error(
                    'CKClient.connect: admitted WITHOUT a verified identity — this door is ' +
                    'non-conformant (every CK door requires a verified bearer). Pass a tokenProvider; ' +
                    'if one was passed, the bearer was not verified and this is a door defect.');
            }
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
    /** Keycloak login → upgrade anonymous to authenticated → RECONNECT with JWT (v1.3 locked). */
    async login(username, password) {
        if (!this.config.authEndpoint || !this.config.realm || !this.config.clientId) throw new Error("CKClient.login: `authEndpoint`, `realm` and `clientId` are required — pass them explicitly (no hardcoded default).");
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
     */
    async dispatch(verb, kernelUrn, payload = {}, opts = {}) {
        if (!this.nc) throw new Error('Not connected');
        await this._maybeRefreshToken();
        const traceId = this._traceId();
        const h = this._headers(traceId);
        h.set('Ck-Verb', String(verb));
        if (kernelUrn) h.set('Ck-Kernel', String(kernelUrn));
        const jc = nats.JSONCodec();

        // door §4: exactly ONE legal publish form — input.kernel.<gov>.id.<sub>.action.<verb>.
        // The unidentified bare form is RETIRED with the anonymous posture: every conformant door
        // verifies the bearer, so the connection always has a sub, and a forged segment is
        // broker-refused. Governed verbs ride the GOV kernel; only delegated agent.* verbs ride
        // the target (which travels in the Ck-Kernel header either way).
        const target = String(kernelUrn || '').replace('ckp://Kernel#', '') || this.kernel;
        const delegated = /^agent\./.test(verb) || verb === 'execute' || verb === 'presence' || verb === 'say';
        const routeKernel = slugKernel(delegated ? target : this._gov);
        const idSub = (!this.auth.anonymous && (this.auth.claims?.sub ?? this.auth.userId)) || null;
        if (!idSub) throw new Error(
            `dispatch('${verb}'): no verified identity on this connection. Every CK door requires ` +
            "a verified bearer (CK-DOOR v1.6.1 §2); an admitted-unverified connection is a " +
            "non-conformant door, not a tier to operate in.");
        const subject = `input.kernel.${routeKernel}.id.${idSub}.action.${verb}`;
        const body = { action: verb, ...payload };

        return new Promise((resolve, reject) => {
            const timeout = opts.timeout || this._dispatchTimeout;
            const timer = setTimeout(() => {
                this._pending.delete(traceId);
                // R6.4: remember the timeout so the late answer is recognizable when it lands.
                this._expired.set(traceId, { verb, at: Date.now() });
                if (this._expired.size > 64) this._expired.delete(this._expired.keys().next().value);
                reject(new Error(`dispatch('${verb}') timed out after ${timeout}ms`));
            }, timeout);
            // v1.5.9 (#19): store subject+verb so a broker permission violation on this subject can
            // reject THIS dispatch immediately — the refusal is known at once, not after the timeout.
            this._pending.set(traceId, { resolve, reject, timer, subject, verb });
            try {
                this.nc.publish(subject, jc.encode({ timestamp: new Date().toISOString(), ...body }), { headers: h });
            } catch (e) {
                clearTimeout(timer); this._pending.delete(traceId); reject(e);
            }
        });
    }

    _resolvePending(traceId, reply, meta = null) {
        const p = this._pending.get(traceId);
        if (!p) return;
        // door §5.2: id AND verb must agree before a published reply resolves a pending dispatch.
        // A collision that resolves a mismatched verb is a silently wrong answer, not a fault.
        if (meta && meta.verb && p.verb && meta.verb !== p.verb) return;
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
            const r = await this.dispatch('affordances', kernelUrn, {});
            return (r && (r.affordances || r.result)) || [];
        } catch (e) { return []; }
    }

    /** Transport close — alias for disconnect (the facade calls close()). */
    async close() { return this.disconnect(); }

    /** v1.3 — lookup dictionary handle for an IRI (returns null if unknown). */
    /** v1.3 — lookup IRI for a dictionary handle (returns null if unknown). */
    /** v1.3 — current local dictionary version. */

    // ── Convenience getters ──────────────────────────────────────────────

    get isConnected() { return this.connection === 'connected'; }
    get isAnonymous() { return this.auth.anonymous; }
    get userId() { return this.auth.userId; }

    // ── Internal ─────────────────────────────────────────────────────────

    async _openConnection() {
        // #14 Mode A — tokenProvider. The app owns the token; cklib forwards it into the CONNECT frame
        // and re-invokes the provider on EVERY (re)connect (refresh is free — _reconnectWithCurrentAuth
        // routes through here). cklib never mints, never manages a refresh lifecycle (refreshToken stays
        // null — that is login()'s job, which this retires), and never VALIDATES the token. It parses
        // the payload only to surface `sub` for the id-scoped subject — reading a claim to form
        // addressing the broker already permits (CL-C1), not asserting identity. Precedence: an explicit
        // `authenticator` wins; else `tokenProvider`; else whatever login()/anonymous already set.
        if (this.config.tokenProvider && !this.config.authenticator) {
            try {
                const jwt = await this.config.tokenProvider();
                if (jwt) {
                    const claims = this._parseJwt(jwt);
                    this.auth = { anonymous: false, userId: claims?.preferred_username || claims?.sub || null,
                                  token: jwt, refreshToken: null, claims };
                } else {
                    this.auth = { anonymous: true, userId: null, token: null, refreshToken: null };
                }
            } catch (e) {
                // Provider failed → stay anonymous and surface it; never throw (honest degrade, and the
                // substrate refuses a bad/absent token at admission anyway).
                this._emit('error', { kind: 'error', scope: 'tokenProvider', error: String(e?.message || e) });
                this.auth = { anonymous: true, userId: null, token: null, refreshToken: null };
            }
        }
        const connectOpts = {
            servers: this.config.wssEndpoint,
            maxReconnectAttempts: this.config.maxReconnectAttempts,
            reconnectTimeWait: this.config.reconnectDelay,
            name: `cklib;client=${this._clientId}`,
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
            for (const subject of this._extraSubjects) this._sub(subject, 'broadcast');
            return;
        }
        // door §4: subscribe set = the three long forms, nothing else. (R0.1 deleted the
        // pre-v3.11 short forms; R0.2 deleted the foreign-kernel Dictionary subscription.)
        if (this._subscribeChannels.includes('result')) {
            this._sub(this.topics.resultLong, 'result');
            // Governed replies arrive on the GOV kernel's result subject when it differs (G5a).
            if (this._gov && this._gov !== slugKernel(this.kernel)) this._sub(`result.kernel.${this._gov}.>`, 'result');
        }
        if (this._subscribeChannels.includes('event')) this._sub(this.topics.eventLong, 'event');
        this._sub(this.topics.error, 'error');
        for (const subject of this._extraSubjects) this._sub(subject, 'broadcast');
    }

    /** Fault-ISOLATED per subject. A broker that refuses ONE subject must not cost us the others.
     *  Before this, two failure points were unguarded and both are reachable with an anonymous grant
     *  that does not cover every declared subject:
     *    1. `nc.subscribe()` throwing SYNCHRONOUSLY aborted the whole subscribe sequence — and because
     *       the deprecated short form `result.<K>` is subscribed BEFORE the canonical
     *       `result.kernel.<K>.>`, a refusal on the alias meant the canonical subject was never
     *       subscribed at all and NO result ever arrived. That is a total outage caused by a subject
     *       we only carry for v1.2 back-compat.
     *    2. The `for await` rejecting escaped into an un-awaited async IIFE — an unhandled rejection,
     *       invisible to this client's own `error` channel.
     *  Now: each subject stands or falls alone, and a refusal is REPORTED rather than fatal or silent.
     *  A permissions refusal on a deprecated alias is degradation; on a canonical subject it is a real
     *  defect — either way the consumer is told, and the client keeps whatever it was granted. */
    _sub(topic, eventName) {
        const jc = nats.JSONCodec();
        this._guardedSubscribe(topic, 'subscription', (msg) => {
            {
                try {
                    // Read headers (NATS header values are arrays of strings)
                    const hdrs = {};
                    if (msg.headers) for (const [k, v] of msg.headers) hdrs[k] = v.join(',');

                    // Per-subject dedup via Ck-Seq header (graceful: no header → no dedup)
                    const seqRaw = hdrs['Ck-Seq'] || hdrs['ck-seq'];
                    if (seqRaw !== undefined) {
                        // callback body now, not a loop body: return skips THIS message.
                        if (this._isSeen(msg.subject, seqRaw)) return;
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

                    // v1.5.5 — server-attributed sender (pgCK F4): the `by` NATS header carries the
                    // server-DERIVED, verified sender (`urn:ckp:participant:<id>`); `seq` = ledger Ck-Seq.
                    // Read-only pass-through — the client never asserts, verifies, or derives identity.
                    const by = hdrs['by'] ?? hdrs['By'] ?? null;
                    const seq = seqRaw !== undefined ? seqRaw : null;

                    // v1.3.12 — typed envelope: derive kind/subjectIri/conceptType/kernel/verb.
                    // Additive fields; existing consumers reading only {subject,headers,data,traceId} unaffected.
                    const { kind, subjectIri, conceptType, kernel, verb } =
                        this._deriveEnvelope(eventName, msg.subject, data);

                    // v1.5.0 — resolve a pending dispatch by Trace-Id; deliver granted-scope to subscribe() listeners.
                    if (eventName === 'result' && traceId && this._pending.has(traceId)) {
                        // door §5.2: the verb for correlation is the FULL subject suffix after
                        // result.kernel.<k>. (multi-segment verbs like surface.grounding), never the
                        // envelope's display verb (last segment only — 'grounding' ≠ 'surface.grounding').
                        const m = /^result\.kernel\.[^.]+\.(?:action\.)?(.+)$/.exec(msg.subject);
                        this._resolvePending(traceId, data, { verb: m ? m[1] : null, subject: msg.subject });
                    }
                    // R6.4: the late answer to a write you were told had no verdict — say so.
                    if (eventName === 'result' && traceId && this._expired.has(traceId)) {
                        const ex = this._expired.get(traceId); this._expired.delete(traceId);
                        this._emit('late', { subject: msg.subject, data, traceId, verb: ex.verb, by, seq,
                                             note: 'reply arrived after its dispatch timed out — query-then-decide is now a signal' });
                    }
                    if (eventName === 'result' || eventName === 'event') {
                        for (const fn of this._scopeListeners) { try { fn(data); } catch (e) {} }
                    }

                    this._emit(eventName, {
                        subject: msg.subject, headers: hdrs, data, traceId, by, seq,
                        kind, subjectIri, conceptType, kernel, verb,
                    });
                } catch (e) { console.error('[CKClient] decode error:', e, 'subject:', msg.subject); }
            }
        });
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

    /** The ONE place a subscription is created. `_sub` and `_subDict` both route through it so the
     *  #17 fault isolation cannot drift apart again — which is exactly how it broke: #17 hardened
     *  every user-facing subject in `_sub` and MISSED `_subDict`, which carried its own copy of the
     *  raw subscribe + bare async IIFE. That one internal subject was a foreign-kernel feed,
     *  which an anonymous grant does not cover, so the single un-guarded path was also the first
     *  one every anonymous client hits — an unhandled rejection on connect, taking the whole client
     *  down, which is precisely what #17 exists to prevent. Two copies of a guard is one guard.
     *  Returns null when the subject is refused; callers must tolerate that. */
    _guardedSubscribe(subject, scope, onMsg) {
        let sub;
        try {
            sub = this.nc.subscribe(subject);
        } catch (e) {
            this._subjectHealth.set(subject, { scope, state: 'refused' });
            this._emit('error', { kind: 'error', scope: 'subscribe', subject, error: String(e?.message || e),
                                  note: 'subject refused at subscribe; other subjects unaffected' });
            return null;
        }
        this._subjectHealth.set(subject, { scope, state: 'subscribed' });
        this._subs.push(sub);
        (async () => { for await (const msg of sub) onMsg(msg); })().catch((e) => {
            this._emit('error', { kind: 'error', scope, subject, error: String(e?.message || e),
                                  note: 'subscription ended early; other subjects unaffected' });
        });
        return sub;
    }

    /** v1.6.1 (R6.5/R6.6): per-subject health, DIAGNOSTIC — the only place subjects surface.
     *  'subscribed' ≠ live (granted-and-idle is indistinguishable — Q-6); 'refused' is measured. */
    subjects() {
        return [...this._subjectHealth.entries()].map(([subject, v]) => ({ subject, ...v }));
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
        // D3 (v1.5.13): a dead auth endpoint is not retried unbounded. Consecutive failures back
        // off (30s→60s→120s→300s cap); after 5 the loop is TERMINAL — anonymous fallback (v1.3
        // rule) and ONE status emission carrying refreshExhausted. Re-auth is the app's move.
        if (this._refreshExhausted) return;
        if (this._refreshNextAttempt && Date.now() < this._refreshNextAttempt) return;
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
            this._refreshFailures = 0; this._refreshNextAttempt = 0;      // D3: success resets
            // v1.3 locked: reconnect on token refresh to refresh server-side permissions
            if (this.nc) await this._reconnectWithCurrentAuth();
            this._emitStatus();
        } catch (e) {
            this._refreshFailed();
            console.warn('[CKClient] Token refresh failed:', e.message);
        }
    }

    // D3 (v1.5.13): consecutive-failure accounting for _maybeRefreshToken's network-failure path.
    // (An auth-server refusal — !res.ok — already self-terminates via the anonymous fallback.)
    _refreshFailed() {
        this._refreshFailures = (this._refreshFailures || 0) + 1;
        const backoff = [30000, 60000, 120000, 300000];
        this._refreshNextAttempt = Date.now() + backoff[Math.min(this._refreshFailures - 1, backoff.length - 1)];
        if (this._refreshFailures >= 5) {
            this._refreshExhausted = true;
            this._setAnonymous();
            if (this.nc) this._reconnectWithCurrentAuth().catch(() => {});
            this._refreshExhaustedPending = true;                          // one-shot, consumed by _emitStatus
            this._emitStatus();
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
                else if (String(s.type).toLowerCase().includes('error') || s?.data?.permissionContext) this._onProtocolError(s);
            }
        })();
    }

    /** #19 — a broker permission violation must (1) never be silent, and (2) fail the dispatch it
     *  concerns AT ONCE, not after dispatchTimeout. Before this, a Publish Violation arrived here
     *  while the pending dispatch sat keyed by traceId with no correlation, so activate's discovery
     *  calls (affordances, snapshot) each waited out the full timeout before their existing try/catch
     *  could degrade — minutes of silence over a refusal known immediately. That is
     *  `sym-reports-not-refuses` in our own client. Once a publish is refused the reply can never
     *  come, so rejecting now is strictly correct, never premature. */
    _onProtocolError(s) {
        const d = s?.data;
        const pc = (d && d.permissionContext) || null;
        let op = pc?.operation, subject = pc?.subject;
        const msg = (d && d.message) || (typeof d === 'string' ? d : '') || String(d ?? s?.type ?? 'protocol error');
        if (!subject) {
            const m = /to\s+"?([^"\s]+)"?/i.exec(msg);
            if (m) { subject = m[1]; op = /sub/i.test(msg) ? 'sub' : 'pub'; }
        }
        // (1) Always surface — a refusal is never silent.
        if (subject && (op === 'subscription' || /sub/i.test(String(op || '')))) {
            const h = this._subjectHealth.get(subject);
            this._subjectHealth.set(subject, { scope: h?.scope ?? 'unknown', state: 'refused' });
        }
        this._emit('error', { kind: 'error', scope: 'protocol', op: op || null, subject: subject || null, error: msg });
        // (2) Fail-fast any dispatch whose publish subject the broker just refused.
        if (subject) {
            for (const [tid, p] of this._pending) {
                if (p.subject === subject) {
                    clearTimeout(p.timer); this._pending.delete(tid);
                    p.reject(new Error(`dispatch('${p.verb}') refused by broker: ${msg}`));
                }
            }
        }
    }

    _emitStatus(error = null) {
        // REDACTED BY DESIGN (pgCK finding-1786649692677093000): this event once spread the ENTIRE
        // auth object — the raw bearer AND the refresh token — to every in-process listener, and a
        // consumer app faithfully rendered a person's live credentials into its visible log. A
        // status event answers "am I connected, as whom, until when" — it never carries a
        // replayable credential. No spread here, ever: a spread leaks every FUTURE auth field by
        // default; the allowlist is the contract.
        const a = this.auth || {};
        // D4 (v1.5.13): tier is derived (never caller-supplied) and a CHANGE of tier is loud —
        // the same event carries tierChanged:{from,to}, because every write after a downgrade
        // attributes differently. refreshExhausted rides exactly one event (D3's give-up).
        // The allowlist rule stands: no spread, no credential, ever.
        const tier = (!a.anonymous && a.token) ? 'verified' : 'anonymous';
        const auth = { anonymous: !!a.anonymous, userId: a.userId ?? null, exp: a.claims?.exp ?? null, hasToken: !!a.token, tier };
        if (this._refreshExhaustedPending) { auth.refreshExhausted = true; this._refreshExhaustedPending = false; }
        const evt = { connection: this.connection, auth, error };
        if (this._lastTier && this._lastTier !== tier) evt.tierChanged = { from: this._lastTier, to: tier };
        this._lastTier = tier;
        this._emit('status', evt);
    }

    _emit(event, data) {
        const a = this._handlers[event];
        if (a) for (const fn of a) { try { fn(data); } catch (e) {} }
    }

    _id() { return 'xxxx-xxxx-xxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16)); }
    // v1.6.1 (R3.7 / A-11, door §5): replies are PUBLISHED to every subscriber, so correlation
    // ids must be >=128-bit (24-bit collided at 8,036 dispatches, measured) AND a reply resolves
    // a pending dispatch only when id + verb agree — entropy alone cannot close a cross-resolve.
    _traceId() { return 'tx-' + (globalThis.crypto?.randomUUID?.() ?? Array.from({length:32},()=>Math.floor(Math.random()*16).toString(16)).join('')); }
    _parseJwt(t) { try { return JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); } catch (e) { return null; } }
}

if (typeof window !== 'undefined') window.CKClient = CKClient;
// Self-identifying: the door serves ck-client.js separately, so a consumer may hold this file
// without ck.js. Pinned equal to ck.js VERSION and package.json by the smoke suite.
const VERSION = '1.6.5';

export { CKClient, VERSION, msgpackEncode, msgpackDecode };
export default CKClient;
