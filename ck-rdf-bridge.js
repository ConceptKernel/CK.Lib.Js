/**
 * ck-rdf-bridge.js — convert CKClient envelopes to RDF/JS Quad[].
 *
 * Optional ESM. Import only when you need RDF/JS interop:
 *
 *   import { CKClient } from '/cklib/ck-client.js';
 *   import { toQuads } from '/cklib/ck-rdf-bridge.js';
 *
 *   const ck = new CKClient({ kernel: 'pgCK.Task' });
 *   await ck.connect();
 *   ck.on('event', async (msg) => {
 *     const quads = await ck.toQuads(msg);   // instance form: handle inflation auto-wired
 *     // … push to your in-memory store
 *   });
 *
 * Or static form (no CKClient):
 *
 *   import { toQuads } from '/cklib/ck-rdf-bridge.js';
 *   const quads = await toQuads(someEnvelope, { graph: df.defaultGraph() });
 *
 * Codec-agnostic: reads the already-decoded msg.data (CKClient's codec layer
 * handles JSON vs MessagePack per the v1.3.0 stable surface contract).
 *
 * Supported envelope shapes:
 *   (a) JSON-LD-shaped body — { "@id":"…", "type":"…", "<predIri>":<value>, … }
 *       Emits one quad per non-control property + rdf:type quads when
 *       msg.conceptType is set (v1.3.12 typed envelope).
 *   (b) Binary-delta single-fact — { e, p, o, g?, seq? }
 *       Emits exactly one quad. e/p/o are either inline IRI strings or
 *       uint32 dictionary handles (inflated via opts.inflate, auto-supplied
 *       by the instance form using ck.iriForHandle).
 *
 * Lazy-loads @rdfjs/data-model from esm.sh on first call; cached. Zero bundle
 * cost if this file is never imported.
 */

import { CKClient } from './ck-client.js';

let _df = null;
async function rdf() {
    if (_df) return _df;
    const mod = await import('https://esm.sh/@rdfjs/data-model@2.1.0');
    _df = mod.default ?? mod;
    return _df;
}

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const XSD = 'http://www.w3.org/2001/XMLSchema#';

const CONTROL_KEYS = new Set(['@id', '@type', '@context', 'type', 'trace_id', 'timestamp']);

function looksLikeIri(s) {
    return typeof s === 'string' && /^(https?:\/\/|urn:|ckp:|did:|tag:)/.test(s);
}

function makeObject(df, v) {
    if (v == null) return null;
    if (typeof v === 'string') {
        return looksLikeIri(v) ? df.namedNode(v) : df.literal(v);
    }
    if (typeof v === 'boolean') return df.literal(String(v), df.namedNode(XSD + 'boolean'));
    if (typeof v === 'number') {
        return Number.isInteger(v)
            ? df.literal(String(v), df.namedNode(XSD + 'integer'))
            : df.literal(String(v), df.namedNode(XSD + 'decimal'));
    }
    if (typeof v === 'bigint') return df.literal(v.toString(), df.namedNode(XSD + 'integer'));
    if (v && typeof v === 'object' && typeof v['@id'] === 'string') return df.namedNode(v['@id']);
    return null;
}

function inflateTermToIri(value, inflate) {
    if (typeof value === 'number') {
        const iri = inflate(value);
        return iri ?? `urn:ckp:handle:${value}`;
    }
    return String(value);
}

/**
 * Convert a CKClient delivery envelope into rdf.js Quad[].
 *
 * @param {object}   msg                          CKClient envelope (v1.3.12 typed-envelope fields preferred)
 * @param {object}   [opts]
 * @param {Function} [opts.inflate]               uint32 → IRI string for binary-delta path
 * @param {object}   [opts.graph]                 rdf.js named-graph term (default: defaultGraph())
 * @returns {Promise<Array>}                       array of rdf.js Quad
 */
export async function toQuads(msg, opts = {}) {
    const df = await rdf();
    const graph = opts.graph ?? df.defaultGraph();
    const inflate = opts.inflate ?? ((x) => x);
    const data = msg && msg.data;
    if (!data || typeof data !== 'object') return [];

    // Shape (b): single-fact binary delta — {e, p, o, g?, seq?}
    if (data.e !== undefined && data.p !== undefined && data.o !== undefined) {
        const s = df.namedNode(inflateTermToIri(data.e, inflate));
        const p = df.namedNode(inflateTermToIri(data.p, inflate));
        const o = typeof data.o === 'number'
            ? df.namedNode(inflateTermToIri(data.o, inflate))
            : makeObject(df, data.o);
        const g = (data.g !== undefined && data.g !== 0)
            ? df.namedNode(inflateTermToIri(data.g, inflate))
            : graph;
        return o ? [df.quad(s, p, o, g)] : [];
    }

    // Shape (a): JSON-LD-shaped body
    const subjectIri = msg.subjectIri ?? data['@id'];
    if (!subjectIri) return [];
    const subject = df.namedNode(subjectIri);
    const quads = [];

    // rdf:type from typed envelope (v1.3.12) or body
    const conceptType = msg.conceptType ?? data['@type'] ?? data['type'] ?? null;
    if (conceptType) {
        const types = Array.isArray(conceptType) ? conceptType : [conceptType];
        for (const t of types) {
            if (typeof t === 'string') {
                quads.push(df.quad(subject, df.namedNode(RDF_TYPE), df.namedNode(t), graph));
            }
        }
    }

    for (const [key, value] of Object.entries(data)) {
        if (CONTROL_KEYS.has(key)) continue;
        const predicate = df.namedNode(key);
        if (Array.isArray(value)) {
            for (const v of value) {
                const o = makeObject(df, v);
                if (o) quads.push(df.quad(subject, predicate, o, graph));
            }
        } else {
            const o = makeObject(df, value);
            if (o) quads.push(df.quad(subject, predicate, o, graph));
        }
    }
    return quads;
}

// Instance attachment — closes over `this.iriForHandle` so dictionary handles
// (binary-delta path) auto-inflate. Imported once → present on all CKClient instances.
CKClient.prototype.toQuads = function (msg, opts = {}) {
    const inflate = opts.inflate ?? ((h) => this.iriForHandle(h));
    return toQuads(msg, { ...opts, inflate });
};

export default toQuads;
