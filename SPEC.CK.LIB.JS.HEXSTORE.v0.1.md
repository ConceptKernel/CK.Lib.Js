# SPEC.CK.LIB.JS.HEXSTORE v0.1

**Status:** Draft — under pgCK review before v1.4 implementation  
**Date:** 2026-06-04  
**Scope:** Optional in-memory quad store shipped by CK.Lib.Js v1.4 as `ck-hex-store.js`  
**Decision locked at:** `_WIP/NOTIFIES.pgCK.v1.4.0.ckhexstore-decision-locked-roadmap.md` (CKHexStore is the only in-client store flavor — CKQuadStore option dropped per pgCK board card "CORRECTION · rdfjs store = native CKHexStore ONLY")

---

## 1. Purpose

CKHexStore is the canonical browser-side replica of a slice of pgCK's governed graph. Sealed instances arrive on `event.kernel.<K>.<event>` (and adjacent subjects) and are projected into a 6-way hex-indexed store keyed by uint32 dictionary handles — the same ID space pgCK / pgRDF use server-side (Oxigraph-style hexagonal indexing). IRI strings are materialized only on `inflate()` at presentation time.

### 1.1 Non-goals

- **No parsers / no serializers.** Browsers receive facts via NATS; they never parse Turtle / RDF-XML / JSON-LD. If a consumer needs to export to a serialized format, they call `store.toRdfJs()` and run rdflib.js / n3 themselves.
- **No reasoning / OWL inference.** That's pgCK's job server-side; the browser sees only sealed facts.
- **No SPARQL query engine.** `store.match(s, p, o)` is the only query surface in v1.4. Anything richer plugs in via the rdf.js adapter and downstream tooling.
- **No persistence.** CKStore (`ck-store.js`, IndexedDB-backed) is a separate concern; CKHexStore is RAM-only and discarded on page reload (rehydrated from snapshot subscription on next connect).

---

## 2. Wire input

CKHexStore consumes the two shapes already defined by v1.3.x CKClient and the v1.3.0 binary-codec contract:

### 2.1 JSON-LD-shaped body (current default)

```
event.kernel.pgCK.Task.sealed  (Content-Encoding: <none>  → JSON)
{
  "@id": "ckp://Task#FC-T-0001",
  "type": "https://conceptkernel.org/ontology/v3.8/Task",
  "https://conceptkernel.org/ontology/v3.8/title": "Rotate SPIFFE SVIDs",
  "https://conceptkernel.org/ontology/v3.8/priority": 4,
  "https://conceptkernel.org/ontology/v3.8/lifecycle_state": "pending"
}
```

Each property of the body becomes one quad with subject = `@id`, predicate = the property's IRI key, object = the value. The body's `type` becomes one or more `rdf:type` quads.

### 2.2 Binary delta (v1.3.x binary path, when pgCK v0.2 ships its dictionary)

```
event.kernel.pgCK.Task.lifecycle_changed  (Content-Encoding: msgpack)
{ e: 42, p: 17, o: "active", g: 0, seq: 1234 }
```

`e`, `p`, `o`, `g` are uint32 dictionary handles (per `event.kernel.Dictionary.snapshot` / `v_bumped`). `seq = ckp.ledger.id` from pgCK's seal projection. Single quad per delta.

### 2.3 Hybrid

Both shapes may arrive concurrently during pgCK's v0.2 transition. CKHexStore handles them uniformly via the same `insert()` entry point — see §4.

---

## 3. In-memory representation

### 3.1 Term IDs

Internally CKHexStore stores **uint32 handles** for every term (subject, predicate, object IRI, named graph). Literal objects (strings, numbers, booleans) are stored inline with their datatype tag — they're not handle-coded since their cardinality is unbounded and most are unique.

```
TermId = uint32             // dictionary handle for an IRI / blank node
Literal = { v: any, dt: uint32 | undefined, lang: string | undefined }
ObjectTerm = TermId | Literal
```

### 3.2 Quad IDs

Each quad gets a stable 128-bit identity packed as a BigInt:

```
quadId = (BigInt(s) << 96n) | (BigInt(p) << 64n) | (BigInt(o_or_lit_hash) << 32n) | BigInt(g)
```

For literal objects, the bottom 32 bits of `o_or_lit_hash` is a hash of `{v, dt, lang}` — collisions are checked in the per-bucket array (rare, cheap).

### 3.3 Six indexes

```
class CKHexStore {
  // payload
  quads: Map<bigint, { s: uint32, p: uint32, o: ObjectTerm, g: uint32 }>;

  // 6-way hex index — all uint32 keys, no string allocations
  spo: Map<uint32, Map<uint32, Set<bigint>>>;   // s → p → quadIds
  sop: Map<uint32, Map<bigint, Set<uint32>>>;   // s → o → predicates ... etc.
  pso: ...;
  pos: ...;
  osp: ...;
  ops: ...;

  // replay-dedup (Ck-Seq header)
  bySeq: Map<string|bigint, bigint>;            // seq → quadId
}
```

Six index dimensions (SPO, SOP, PSO, POS, OSP, OPS) match Oxigraph's hexagonal layout. Match patterns choose the most-selective index automatically — see §4.

### 3.4 Local-handle allocation (pre-dictionary transition)

Until pgCK v0.2 ships the `ckp.dictionary` table + handle allocator, CKClient's `ck._dict.handles` map is empty. CKHexStore handles this by **local handle allocation**:

- When a JSON-LD body arrives, the store walks `@id` / `type` / each predicate IRI.
- For each IRI not in `ck._dict.reverse`, allocate a new local handle (counter starting at `2^31` to avoid clashing with future server-assigned handles).
- Insert the IRI ↔ handle into a local-only side-map `_localDict` that mirrors the public dict API.
- Subsequent occurrences of the same IRI re-use the locally allocated handle.

When pgCK eventually publishes a `Dictionary.snapshot`, CKHexStore performs a **handle remap**: for each IRI now in the canonical dictionary, replace its local handle with the canonical one across all indexes. The remap walks the indexes once; cost is `O(quads_referring_to_remapped_handles)` which is fine for browser-scale data.

This means CKHexStore is **operational on day-zero** even though pgCK's dictionary won't ship until v0.2 — the user gets a working store immediately and gets de-dup-with-server when the canonical dictionary arrives.

---

## 4. Public API

```js
import { CKClient } from '/cklib/ck-client.js';
import { CKHexStore } from '/cklib/ck-hex-store.js';

const ck = new CKClient({ kernel: 'pgCK.Task' });
await ck.connect();
const store = new CKHexStore(ck);   // closes over ck for dictionary integration

ck.on('event', (msg) => store.insert(msg));        // ingest sealed events
ck.on('result', (msg) => store.insert(msg));       // optional: also ingest result envelopes

// Query: all quads where subject = ckp://Task#FC-T-0001
const matches = store.match({ s: 'ckp://Task#FC-T-0001' });

// Inflate at presentation time
for (const q of matches) {
  const inflated = store.inflate(q);
  // { s: 'ckp://Task#FC-T-0001', p: 'https://conceptkernel.org/ontology/v3.8/title',
  //   o: { v: 'Rotate SPIFFE SVIDs', dt: 'http://www.w3.org/2001/XMLSchema#string' }, g: '' }
}

// rdf.js adapter (lazy-loads @rdfjs/data-model + @rdfjs/dataset)
const dataset = await store.toRdfJs();        // returns @rdfjs/dataset Dataset view
```

### 4.1 Methods

| Method | Returns | Notes |
|---|---|---|
| `new CKHexStore(ck, opts?)` | instance | `opts.localHandleStart = 2^31` by default |
| `insert(msg)` | `quadId[]` | accepts the CKClient envelope (v1.3.12 typed); routes to JSON-LD or binary-delta path |
| `remove(quadId)` | `boolean` | removes from quads + 6 indexes + bySeq |
| `removeBySubject(iri \| handle)` | `count` | bulk; used by `delete.kernel.<K>` events |
| `match({s?, p?, o?, g?})` | `Iterable<quadId>` | s/p/o/g accept either IRI string or uint32 handle |
| `inflate(quadId)` | `{s, p, o, g}` of strings/literals | resolves handles via `ck.iriForHandle()` |
| `inflateAll(quadIds)` | array of inflated | batch form |
| `toRdfJs(opts?)` | `Promise<rdfjs.Dataset>` | lazy CDN load of `@rdfjs/dataset` |
| `size` | `number` | quad count |
| `dictVersion` | `number` | mirrors `ck.dictVersion` |
| `on(event, cb)` | unsubscribe fn | events: `'insert'`, `'remove'`, `'remap'`, `'snapshot'` |

### 4.2 Match selectivity

`match()` picks the index that minimizes the candidate set:

```
input bound positions       index used
─────────────────────────────────────────
s, p, o                     spo (point lookup)
s, p                        spo
s, o                        sop
p, o                        pos
p                           pso
o                           osp
s                           spo
(none)                      iterate quads (warn in dev mode)
```

Graph dimension is always filtered last (most queries use default graph).

---

## 5. Snapshot / replay protocol

CKHexStore auto-handles three pgCK message families (subjects fixed in v1.3.0 §3.2):

| Subject | Effect |
|---|---|
| `event.kernel.Dictionary.snapshot` | rebuild `_localDict` from the snapshot; trigger handle remap of all quads in indexes |
| `event.kernel.Dictionary.v_bumped` | apply delta entries (add new (handle, iri) pairs); no remap needed |
| `event.kernel.<K>.snapshot` (proposed for replay) | bulk-insert all quads in the snapshot body (subject of each becomes the inserted subject) |

On `(re)connect`, if `ck.dictVersion === 0`, CKClient already sends `Ck-Dict-V: 0` and pgCK responds with a dictionary snapshot. CKHexStore listens on the same subscription internally — no API surface needed for this; it just works.

---

## 6. rdf.js adapter

```js
async toRdfJs(opts = {}) {
  const [df, dataset] = await Promise.all([
    import('https://esm.sh/@rdfjs/data-model@2.1.0'),
    import('https://esm.sh/@rdfjs/dataset@2.0.0'),
  ]);
  const out = dataset.dataset();
  for (const qid of this.quads.keys()) {
    const inflated = this.inflate(qid);
    out.add(df.quad(
      df.namedNode(inflated.s),
      df.namedNode(inflated.p),
      typeof inflated.o === 'object' && inflated.o.v !== undefined
        ? df.literal(inflated.o.v, inflated.o.dt ? df.namedNode(inflated.o.dt) : undefined)
        : df.namedNode(inflated.o),
      inflated.g ? df.namedNode(inflated.g) : df.defaultGraph(),
    ));
  }
  return out;
}
```

Bundle cost paid only when called. Consumer can hold the returned `Dataset` and run any rdf.js-spec-compatible operations on it.

---

## 7. Memory + performance notes

For a working set of N quads with M unique IRIs:

| | Approximate cost |
|---|---|
| `quads` Map | N × (~80 bytes per entry: BigInt key + JS object value) ≈ **80N bytes** |
| 6 hex indexes | 6 × N × ~24 bytes (Map entry overhead with Set/Map inner) ≈ **144N bytes** |
| Local dict (when canonical dict empty) | M × (IRI string + ~40 bytes) ≈ **M × (len(IRI) + 40)** |
| **Total** | ~**(224N + M × (len(IRI) + 40))** bytes |

For comparison: a typical n3 / rdflib.js store of the same data is roughly **5× larger** because every term is wrapped in a JS object with its IRI string kept hot, and each statement is itself a JS object. For N = 10,000 quads with M = 500 IRIs (avg 40 chars), CKHexStore is ~2.6 MB vs n3's ~12 MB.

Match latency: SPO point lookup is O(1) (Map → Map → Set). Range queries iterate at most one Set per result.

---

## 8. Open questions for pgCK

1. **`type` vs `@type` in seal projection?** Your example uses bare `type`; JSON-LD canonical is `@type`. Either works. Confirm intent so v1.3.12 envelope picks the right field (currently checks `@type` first, falls back to `type`).
2. **Object refs in JSON-LD body** — when an instance has a property whose object is another instance (e.g. `Task.goal_id → Goal#FC-G-0001`), is it sent as `{ "@id": "ckp://Goal#FC-G-0001" }` or as a bare string `"ckp://Goal#FC-G-0001"`? Current bridge handles both (looks for `@id` field; otherwise IRI-shape heuristic).
3. **`delete.kernel.<K>` and `event.kernel.<K>.deleted`** — are these the right subjects for retraction? CKHexStore needs them to remove quads from the indexes.
4. **`event.kernel.<K>.snapshot` body shape** — for bulk replay on reconnect. Is it (a) array of full JSON-LD bodies, or (b) array of binary deltas, or (c) some custom envelope?
5. **Named graphs in your model** — do sealed events carry a graph IRI distinct from default? CKHexStore stores `g` but doesn't require it.
6. **`type` cardinality** — single string or array? CKHexStore handles both; v1.3.12 envelope's `msg.conceptType` follows the same.

---

## 9. Implementation notes

- File: `ck-hex-store.js` at repo root (so it lands at `/cklib/ck-hex-store.js` after the Shape A bundle mount).
- Imports `CKClient` from `./ck-client.js` only — no other CK.Lib.Js coupling.
- No vendored deps. `@rdfjs/data-model` + `@rdfjs/dataset` are CDN-imported lazily on `toRdfJs()`.
- Estimated size: ~5 KB raw (~2 KB gzipped). Zero cost if not imported.
- Export entry in `package.json`: `"./hex-store": "./ck-hex-store.js"`.

---

## 10. Bootstrap test

Following the same pattern as `smoke-ck-lib-js.sh`: a tiny HTML page with mock NATS that:

1. Connects a CKClient
2. Imports CKHexStore
3. Feeds three sample JSON-LD bodies (one Task, one Goal, one Kernel)
4. Queries `store.match({s: 'ckp://Task#FC-T-0001'})` and asserts the expected 4 quads
5. Calls `await store.toRdfJs()` and asserts size

Ships under `tests/hex-store/` after pgCK review.

---

## 11. Status of this spec

- **v0.1 (this file)** — initial draft, posted for pgCK review. Will iterate to v0.2 after their feedback.
- **v1.0** — locks the API; implementation lands in CK.Lib.Js v1.4 and tracks v1.0 of this spec.

---

## 12. References

- Wire format: pgCK / CK.Lib.Js v1.3.0 §3.2 (binary delta + dictionary handles)
- pgCK seal projection that stamps `@id`: pgCK commit `7e94893`
- Decision lock (CKHexStore-only): `_WIP/NOTIFIES.pgCK.v1.4.0.ckhexstore-decision-locked-roadmap.md`
- pgCK CKHexStore correction (board card 2026-06-04): "CORRECTION · rdfjs store = native CKHexStore ONLY"
- Oxigraph hexagonal indexing: https://github.com/oxigraph/oxigraph (the architectural inspiration)
- CK.Lib.Js typed envelope (v1.3.12): see `CHANGELOG.md` §1.3.12
- CK.Lib.Js RDF/JS Quad bridge (v1.3.13): `ck-rdf-bridge.js`, see `CHANGELOG.md` §1.3.13
