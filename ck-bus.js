/**
 * CK EventBus — Local pub/sub with NATS-style wildcard subjects.
 *
 * Usage:
 *   import { CKBus } from 'https://lib.tech.games/ck-bus.js';
 *   const bus = new CKBus();
 *
 *   const sub = bus.on('action.*.fired', (data, subject, reply) => { ... });
 *   bus.emit('action.transport.fired', { bpm: 120 });
 *   sub.unsubscribe();
 *
 *   const resp = await bus.request('service.echo', { msg: 'hello' }, 2000);
 *
 * Wildcards (split on '.'):
 *   *  — matches exactly one token
 *   >  — matches one or more remaining tokens (must be last segment)
 */

class CKBus {
    constructor({ debug = false } = {}) {
        this._subs = new Map();   // pattern string → Set<{ pattern, parts, cb }>
        this._debug = debug;
    }

    /**
     * Subscribe to a subject pattern.
     * Callback receives (data, subject, reply).
     * reply is undefined unless triggered via request().
     * Returns { unsubscribe() }.
     */
    on(pattern, cb) {
        const parts = pattern.split('.');
        const entry = { pattern, parts, cb };
        if (!this._subs.has(pattern)) this._subs.set(pattern, new Set());
        this._subs.get(pattern).add(entry);
        if (this._debug) console.log('[CKBus] on', pattern);
        return {
            unsubscribe: () => {
                const set = this._subs.get(pattern);
                if (set) {
                    set.delete(entry);
                    if (set.size === 0) this._subs.delete(pattern);
                }
                if (this._debug) console.log('[CKBus] unsub', pattern);
            }
        };
    }

    /**
     * Emit data to all subscribers matching the subject.
     */
    emit(subject, data, _reply) {
        const tokens = subject.split('.');
        for (const [, entries] of this._subs) {
            for (const entry of entries) {
                if (this._match(entry.parts, tokens)) {
                    try { entry.cb(data, subject, _reply); }
                    catch (e) { console.error('[CKBus] handler error:', e); }
                }
            }
        }
    }

    /**
     * Request-reply: emit with a reply callback, resolve when reply is called.
     * Rejects on timeout.
     */
    request(subject, data, timeoutMs = 5000) {
        return new Promise((resolve, reject) => {
            let done = false;
            const timer = setTimeout(() => {
                if (!done) { done = true; reject(new Error(`CKBus request timeout: ${subject}`)); }
            }, timeoutMs);

            const reply = (responseData) => {
                if (!done) {
                    done = true;
                    clearTimeout(timer);
                    resolve(responseData);
                }
            };

            this.emit(subject, data, reply);
        });
    }

    // ── Internal ─────────────────────────────────────────────────────────

    /**
     * Match pattern parts against subject tokens.
     *   * — one token
     *   > — one or more remaining tokens (must be last segment)
     */
    _match(parts, tokens) {
        for (let i = 0; i < parts.length; i++) {
            const p = parts[i];
            if (p === '>') return i < tokens.length;         // rest-match, need >= 1 remaining
            if (i >= tokens.length) return false;             // pattern longer than subject
            if (p !== '*' && p !== tokens[i]) return false;   // literal mismatch
        }
        return parts.length === tokens.length;                // exact length match
    }
}

export { CKBus };
export default CKBus;
