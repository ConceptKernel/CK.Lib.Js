/**
 * CK Runtime — Orchestrator for Concept Kernel modules.
 *
 * Wires together CKClient (NATS), CKBus (local pub/sub), CKStore (persistence),
 * and CKKernel (lifecycle) into a unified runtime context.
 *
 * Usage:
 *   import { CKRuntime } from 'https://lib.tech.games/ck-runtime.js';
 *   const ctx = await CKRuntime.init({ kernel: 'CK.MyApp', mount: '#app' });
 *   // ctx.ck, ctx.bus, ctx.store, ctx.kernel, ctx.saveDB(), ctx.showToast(), ...
 *   await ctx.loadOverlay('transport', { htmlUrl: '...', jsUrl: '...', slot: el });
 *   ctx.refreshAll();
 *   await ctx.destroy();
 */

import { CKBus } from './ck-bus.js';
import { CKStore } from './ck-store.js';
import { CKClient } from './ck-client.js';

export class CKRuntime {

    /**
     * Initialize a full CK runtime context.
     * @param {object} config
     * @param {string} config.kernel — kernel name (e.g. 'CK.UI.2D.Physics')
     * @param {Element|string} config.mount — mount element or selector
     * @returns {Promise<object>} context object
     */
    static async init(config = {}) {
        const { kernel, mount } = config;
        if (!kernel) throw new Error('CKRuntime.init requires config.kernel');

        // Resolve mount element
        const mountEl = typeof mount === 'string'
            ? document.querySelector(mount)
            : mount || document.body;

        // 1. Create local event bus
        const bus = new CKBus();

        // 2. Create instance store
        const store = new CKStore(kernel);

        // 3. Create NATS client and connect
        const ck = new CKClient({ kernel });
        await ck.connect();

        // Internal state for helpers
        const _state = {};
        const _overlays = [];

        // 4. Build context object
        const ctx = {
            ck,
            bus,
            store,
            kernel,
            mount: mountEl,

            /** Persist current state snapshot via store. */
            saveDB() {
                const id = store.getActive(kernel) || 'default';
                store.save(kernel, {
                    id,
                    name: kernel,
                    createdAt: new Date().toISOString(),
                    state: { ..._state },
                });
            },

            /** Show a brief toast message (console for now). */
            showToast(msg) {
                console.log(`[${kernel}] ${msg}`);
            },

            /** Get a nested value from internal state by dot-separated path. */
            getStatePath(path) {
                return path.split('.').reduce((obj, key) => {
                    return obj != null ? obj[key] : undefined;
                }, _state);
            },

            /** Set a nested value in internal state by dot-separated path. */
            setStatePath(path, value) {
                const keys = path.split('.');
                let obj = _state;
                for (let i = 0; i < keys.length - 1; i++) {
                    const k = keys[i];
                    if (obj[k] == null || typeof obj[k] !== 'object') obj[k] = {};
                    obj = obj[k];
                }
                obj[keys[keys.length - 1]] = value;
            },

            /**
             * Load an overlay module (HTML + JS) into a slot element.
             * @param {string} name — overlay identifier
             * @param {object} opts
             * @param {string} opts.htmlUrl — URL to fetch HTML fragment
             * @param {string} opts.jsUrl  — URL to dynamically import JS module
             * @param {Element|string} opts.slot — target element or selector
             */
            async loadOverlay(name, { htmlUrl, jsUrl, slot }) {
                const slotEl = typeof slot === 'string'
                    ? document.querySelector(slot)
                    : slot || mountEl;

                // Fetch and inject HTML
                if (htmlUrl) {
                    const res = await fetch(htmlUrl);
                    if (res.ok) {
                        slotEl.innerHTML = await res.text();
                    }
                }

                // Dynamically import JS module and call setup(ctx)
                let mod = null;
                if (jsUrl) {
                    mod = await import(jsUrl);
                    if (typeof mod.setup === 'function') {
                        mod.setup(ctx);
                    }
                }

                const overlay = { name, mod, slotEl };
                _overlays.push(overlay);
                return overlay;
            },

            /** Call refresh(ctx) on all loaded overlay modules. */
            refreshAll() {
                for (const o of _overlays) {
                    if (o.mod && typeof o.mod.refresh === 'function') {
                        try { o.mod.refresh(ctx); } catch (e) {
                            console.error(`[CKRuntime] refresh error in overlay "${o.name}":`, e);
                        }
                    }
                }
            },

            /** Disconnect NATS, destroy all overlays, clean up. */
            async destroy() {
                // Destroy overlays
                for (const o of _overlays) {
                    if (o.mod && typeof o.mod.destroy === 'function') {
                        try { o.mod.destroy(); } catch (e) {}
                    }
                }
                _overlays.length = 0;

                // Disconnect NATS
                if (ck.isConnected) {
                    await ck.disconnect();
                }
            },
        };

        return ctx;
    }
}

export default CKRuntime;
