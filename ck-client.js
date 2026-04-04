/**
 * CK Web Client — NATS WebSocket Client for Concept Kernels
 *
 * Self-contained ESM module. Loads nats.ws automatically.
 *
 * Usage:
 *   <script type="module" src="https://lib.tech.games/ck-client.js"></script>
 *   <script type="module">
 *     const ck = new CKClient({ kernel: 'TechGames.Cymatics' });
 *     await ck.connect();
 *     // done — subscribed to result + event, anonymous identity ready
 *
 *     ck.send({ action: 'ping' });              // → input.TechGames.Cymatics
 *     await ck.login('test26', 'test26');        // Keycloak JWT upgrade
 *     ck.logout();                               // back to anonymous
 *
 *     ck.on('result', msg => ...);   // { subject, headers, data, traceId }
 *     ck.on('event',  msg => ...);   // { subject, headers, data, traceId }
 *     ck.on('status', state => ...); // { connection, auth }
 *   </script>
 *
 * Design:
 *   - UI is dumb — CKClient owns all NATS complexity
 *   - Control attributes (Trace-Id, X-Kernel-ID, etc.) live in NATS headers, never in body
 *   - Body is pure application data
 *   - Anonymous-first, JWT hot-swap via Keycloak (techgames realm)
 *   - Future: subscription topics provided per-project per-user, upgradeable in-flight
 *   - Future: ontology-driven binary schemas pulled from each kernel
 */

import { connect, JSONCodec, headers } from "https://esm.sh/nats.ws@1.30.3";
const nats = { connect, JSONCodec, headers };

class CKClient {
    constructor(config = {}) {
        this.kernel = config.kernel || null;

        this.config = {
            wssEndpoint: config.wssEndpoint || 'wss://stream.tech.games',
            authenticator: config.authenticator || null,
            authEndpoint: config.authEndpoint || 'https://id.tech.games',
            realm: config.realm || 'techgames',
            clientId: config.clientId || 'ck-web',
            stateEndpoint: config.stateEndpoint || '/api/state',
            maxReconnectAttempts: config.maxReconnectAttempts || 10,
            reconnectDelay: config.reconnectDelay || 1000,
        };

        // Derive topics from kernel name
        this.topics = {
            input:  this.kernel ? `input.${this.kernel}`  : null,
            result: this.kernel ? `result.${this.kernel}` : null,
            event:  this.kernel ? `event.${this.kernel}`  : null,
        };

        // Topic definitions with access levels (anon vs auth)
        this.topicDefs = this.kernel ? [
            { name: `input.${this.kernel}`,   dir: 'pub', access: 'anon' },
            { name: `result.${this.kernel}`,  dir: 'sub', access: 'anon' },
            { name: `event.${this.kernel}`,   dir: 'sub', access: 'anon' },
            { name: `admin.${this.kernel}`,   dir: 'pub', access: 'auth' },
            { name: `metrics.${this.kernel}`, dir: 'sub', access: 'auth' },
        ] : [];

        this.nc = null;
        this._subs = [];
        this._clientId = this._id();
        this.connection = 'disconnected';   // disconnected | connecting | connected | error
        this.auth = { anonymous: true, userId: null, token: null, refreshToken: null };

        this._handlers = { result: [], event: [], status: [], error: [] };
    }

    // ── Public API ───────────────────────────────────────────────────────

    /** Connect to NATS, provision anonymous identity, auto-subscribe. */
    async connect() {
        this._setConnection('connecting');
        try {
            this._setAnonymous();
            const connectOpts = {
                servers: this.config.wssEndpoint,
                maxReconnectAttempts: this.config.maxReconnectAttempts,
                reconnectTimeWait: this.config.reconnectDelay,
            };
            if (this.config.authenticator) connectOpts.authenticator = this.config.authenticator;
            this.nc = await nats.connect(connectOpts);
            this._watchConnection();
            this._setConnection('connected');

            // Auto-subscribe to result + event topics
            if (this.topics.result) this._sub(this.topics.result, 'result');
            if (this.topics.event)  this._sub(this.topics.event, 'event');

            return true;
        } catch (e) {
            this._setConnection('error', e);
            throw e;
        }
    }

    /** Send data to this kernel's input topic. Returns the generated traceId. */
    async send(data) {
        if (!this.nc) throw new Error('Not connected');
        if (!this.topics.input) throw new Error('No kernel configured');
        await this._maybeRefreshToken();
        const traceId = this._traceId();
        const h = this._headers(traceId);
        const jc = nats.JSONCodec();
        const body = { timestamp: new Date().toISOString(), ...data };
        this.nc.publish(this.topics.input, jc.encode(body), { headers: h });
        return traceId;
    }

    /** Keycloak login — upgrades anonymous session to authenticated. */
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
        this._emitStatus();
        return this.auth.userId;
    }

    /** Downgrade back to anonymous. */
    logout() {
        this._setAnonymous();
        this._emitStatus();
    }

    /** Disconnect from NATS. */
    async disconnect() {
        for (const s of this._subs) { try { s.unsubscribe(); } catch (e) {} }
        this._subs = [];
        if (this.nc) { await this.nc.drain(); this.nc = null; }
        this._setConnection('disconnected');
    }

    /** Save state to filer by logical key. CKClient owns URL construction. */
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

    /** Load state from filer by logical key. Returns parsed JSON or null. */
    async loadState(key) {
        await this._maybeRefreshToken();
        const url = `${this.config.stateEndpoint}/${key}.json`;
        const h = {};
        if (this.auth.token) h['Authorization'] = `Bearer ${this.auth.token}`;
        const res = await fetch(url, { headers: h });
        if (!res.ok) return null;
        return res.json();
    }

    /** Subscribe to events: 'result', 'event', 'status', 'error'. */
    on(event, fn) { if (this._handlers[event]) this._handlers[event].push(fn); }
    off(event, fn) {
        const a = this._handlers[event];
        if (a) { const i = a.indexOf(fn); if (i > -1) a.splice(i, 1); }
    }

    // ── Convenience getters ──────────────────────────────────────────────

    get isConnected() { return this.connection === 'connected'; }
    get isAnonymous() { return this.auth.anonymous; }
    get userId() { return this.auth.userId; }

    // ── Internal ─────────────────────────────────────────────────────────

    _sub(topic, eventName) {
        const jc = nats.JSONCodec();
        const sub = this.nc.subscribe(topic);
        this._subs.push(sub);
        (async () => {
            for await (const msg of sub) {
                try {
                    const data = jc.decode(msg.data);
                    const hdrs = {};
                    if (msg.headers) { for (const [k, v] of msg.headers) { hdrs[k] = v.join(','); } }
                    const traceId = hdrs['Trace-Id'] || data.trace_id || '';
                    this._emit(eventName, { subject: msg.subject, headers: hdrs, data, traceId });
                } catch (e) { console.error('[CKClient] decode error:', e); }
            }
        })();
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
            if (!res.ok) { this._setAnonymous(); this._emitStatus(); return; }
            const d = await res.json();
            this.auth.token = d.access_token;
            this.auth.expiresAt = new Date(Date.now() + d.expires_in * 1000);
            if (d.refresh_token) this.auth.refreshToken = d.refresh_token;
            this.auth.claims = this._parseJwt(d.access_token);
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
export { CKClient };
export default CKClient;
