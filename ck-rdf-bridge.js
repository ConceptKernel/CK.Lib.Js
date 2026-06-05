/**
 * ck-rdf-bridge.js — convert CKClient envelopes to RDF/JS Quad[].
 *
 * Zero runtime dependencies. No CDN imports. No @rdfjs/* packages.
 *
 * The DataFactory (NamedNode / BlankNode / Literal / DefaultGraph / Variable /
 * Quad) is implemented natively below — ~60 lines that conform to the W3C
 * RDF/JS DataFactory interface. Consumers who want spec-compliant RDF/JS terms
 * get them without any external library.
 *
 * Rationale (per pgCK NOTIFY thread `v1.3.11.rdfjs-typed-message-store`
 * RESPONSE-RESPONSE, 2026-06-04): a runtime CDN dependency would break the
 * offline / air-gapped / attested-bundle posture. A browser opened against an
 * air-gapped pgck deployment must not reach out to esm.sh to mint a quad. So
 * CK.Lib.Js implements the spec interface natively.
 *
 * Usage:
 *   import { CKClient } from '/cklib/ck-client.js';
 *   import { toQuads, dataFactory } from '/cklib/ck-rdf-bridge.js';
 *
 *   const ck = new CKClient({ kernel: 'pgCK.Task' });
 *   await ck.connect();
 *   ck.on('event', (msg) => {
 *     const quads = ck.toQuads(msg);              // instance form
 *     // … push to your in-memory store
 *   });
 *
 * Supported envelope shapes:
 *   (a) JSON-LD-shaped body — { "@id":"…", "type":"…", "<predIri>":<value>, … }
 *   (b) Binary-delta single-fact — { e, p, o, g?, seq? }  (handles inflated via ck.iriForHandle)
 *
 * Codec-agnostic: reads the already-decoded msg.data (CKClient's codec layer
 * handles JSON vs MessagePack per the v1.3.0 stable surface contract).
 */

import { CKClient } from './ck-client.js';

// ─── Native RDF/JS DataFactory (W3C-spec compliant; zero deps) ────────────────

const RDF_LANGSTRING = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#langString';
const XSD_STRING = 'http://www.w3.org/2001/XMLSchema#string';
const XSD_INTEGER = 'http://www.w3.org/2001/XMLSchema#integer';
const XSD_DECIMAL = 'http://www.w3.org/2001/XMLSchema#decimal';
const XSD_BOOLEAN = 'http://www.w3.org/2001/XMLSchema#boolean';
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';

class NamedNode {
    constructor(value) { this.value = value; }
    get termType() { return 'NamedNode'; }
    equals(o) { return !!o && o.termType === 'NamedNode' && o.value === this.value; }
}

class BlankNode {
    constructor(value) { this.value = value; }
    get termType() { return 'BlankNode'; }
    equals(o) { return !!o && o.termType === 'BlankNode' && o.value === this.value; }
}

class Literal {
    constructor(value, languageOrDatatype) {
        this.value = String(value);
        if (typeof languageOrDatatype === 'string') {
            this.language = languageOrDatatype;
            this.datatype = new NamedNode(RDF_LANGSTRING);
        } else if (languageOrDatatype && languageOrDatatype.termType === 'NamedNode') {
            this.language = '';
            this.datatype = languageOrDatatype;
        } else {
            this.language = '';
            this.datatype = new NamedNode(XSD_STRING);
        }
    }
    get termType() { return 'Literal'; }
    equals(o) {
        return !!o && o.termType === 'Literal'
            && o.value === this.value && o.language === this.language
            && o.datatype.equals(this.datatype);
    }
}

class Variable {
    constructor(value) { this.value = value; }
    get termType() { return 'Variable'; }
    equals(o) { return !!o && o.termType === 'Variable' && o.value === this.value; }
}

class DefaultGraph {
    constructor() { this.value = ''; }
    get termType() { return 'DefaultGraph'; }
    equals(o) { return !!o && o.termType === 'DefaultGraph'; }
}

class Quad {
    constructor(subject, predicate, object, graph) {
        this.subject = subject;
        this.predicate = predicate;
        this.object = object;
        this.graph = graph || _defaultGraph;
    }
    get termType() { return 'Quad'; }
    get value() { return ''; }
    equals(o) {
        return !!o && o.termType === 'Quad'
            && o.subject.equals(this.subject) && o.predicate.equals(this.predicate)
            && o.object.equals(this.object) && o.graph.equals(this.graph);
    }
}

const _defaultGraph = new DefaultGraph();
let _blankCounter = 0;

export const dataFactory = {
    namedNode: (value) => new NamedNode(value),
    blankNode: (value) => new BlankNode(value ?? `b${++_blankCounter}`),
    literal: (value, languageOrDatatype) => new Literal(value, languageOrDatatype),
    variable: (value) => new Variable(value),
    defaultGraph: () => _defaultGraph,
    quad: (s, p, o, g) => new Quad(s, p, o, g),
};

// ─── Envelope-to-Quad conversion ──────────────────────────────────────────────

const CONTROL_KEYS = new Set(['@id', '@type', '@context', 'type', 'trace_id', 'timestamp']);

function looksLikeIri(s) {
    return typeof s === 'string' && /^(https?:\/\/|urn:|ckp:|did:|tag:)/.test(s);
}

function makeObject(df, v) {
    if (v == null) return null;
    if (typeof v === 'string') {
        return looksLikeIri(v) ? df.namedNode(v) : df.literal(v);
    }
    if (typeof v === 'boolean') return df.literal(String(v), df.namedNode(XSD_BOOLEAN));
    if (typeof v === 'number') {
        return Number.isInteger(v)
            ? df.literal(String(v), df.namedNode(XSD_INTEGER))
            : df.literal(String(v), df.namedNode(XSD_DECIMAL));
    }
    if (typeof v === 'bigint') return df.literal(v.toString(), df.namedNode(XSD_INTEGER));
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
 * Synchronous (the native DataFactory needs no async setup — only the previous
 * esm.sh-loaded version was async). Callers may use it directly without await.
 *
 * @param {object}   msg                          CKClient envelope (v1.3.12 typed-envelope fields preferred)
 * @param {object}   [opts]
 * @param {Function} [opts.inflate]               uint32 → IRI string for binary-delta path
 * @param {object}   [opts.graph]                 rdf.js named-graph term (default: defaultGraph())
 * @param {object}   [opts.factory]               override the DataFactory (defaults to our native one)
 * @returns {Array}                                array of rdf.js Quad
 */
export function toQuads(msg, opts = {}) {
    const df = opts.factory ?? dataFactory;
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

    // Shape (a): JSON-LD-shaped body — needs a subject IRI to mint quads.
    // Defensive: never pick urn:ckp:participant:* values as subjects (per pgCK NOTIFY thread §2).
    // Prefer msg.subjectIri (v1.3.12 typed envelope) → data['@id'] → null (skip).
    const subjectIri = msg.subjectIri ?? data['@id'];
    if (!subjectIri || typeof subjectIri !== 'string') return [];
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
