# CKHexStore

> Browser-side hexagonal-indexed quad store, populated from CKP NATS streams.
> Born inside [CK.Lib.Js](../) — destined to ship as its own library.

| | |
|---|---|
| **Component status** | Incubating — current spec v3.8.1 (CKP-aligned); no implementation in the bundle yet |
| **Hosted by** | [CK.Lib.Js](../README.md) v1.3.13 (latest) → v1.4 (CKHexStore lands) |
| **Unifies (the v1.4 thesis)** | (a) the **v1.3.12 typed envelope** (`msg.kind`, `msg.subjectIri`, `msg.conceptType`, `msg.kernel`, `msg.verb`) + (b) the **v1.3.13 RDF/JS bridge** (`ck-rdf-bridge.js` → `toQuads(msg)`) + (c) the **dictionary-handle ID space** (`ck.iriForHandle()` / `ck.handleForIri()` / `ck.dictVersion`) + (d) a **URN-native developer surface** (v3.8.1 spec — bind / invoke / view / resolve, no NATS subjects in app code) into one in-client store. CKHexStore is what makes those four surfaces coherent for app authors. |
| **Independence target** | Own repo + own npm package + own OCI bundle, after spec lock |
| **Decision** | CKHexStore is the **only** in-client store flavor CK.Lib.Js will ship. The CKQuadStore (n3-backed) option was dropped per the pgCK board card *"CORRECTION · rdfjs store = native CKHexStore ONLY"* (2026-06-04). |
| **Current spec** | [SPEC.CK.HEXSTORE.v3.8.1.md](./SPEC.CK.HEXSTORE.v3.8.1.md) — URN-native event surface. Adopts CKP-aligned versioning (major.minor matches the CKP protocol generation). |
| **Foundation spec** | [SPEC.CK.HEXSTORE.v0.1.md](./SPEC.CK.HEXSTORE.v0.1.md) — wire input, hex indexes, dictionary, projection rules. v3.8.1 inherits this and adds the developer-facing API on top. |
| **License** | MIT (will carry over to its own repo) |

---

## What CKHexStore is

CKHexStore is the browser's local replica of a slice of pgCK's governed graph.

- **In** — sealed events arriving on the v3.8 NATS subject families (`event.kernel.<K>.>` etc.) consumed by [`CKClient`](../ck-client.js), surfaced with the v1.3.12 typed envelope.
- **Stored as** — 6-way hexagonally indexed quads (SPO, SOP, PSO, POS, OSP, OPS), keyed by **uint32 dictionary handles**. Same ID space pgCK / pgRDF / Oxigraph use server-side.
- **Out** — `store.match({ s, p, o })` for in-browser queries; `store.inflate(quad)` to materialize IRI strings on demand; `store.toRdfJs()` for the rdf.js ecosystem (delegating to [`../ck-rdf-bridge.js`](../ck-rdf-bridge.js)).

It is **RAM-only**, **parser-less**, **reasoner-less**, and **single-process**. Anything outside that surface is by design out of scope (see [SPEC §1.3](./SPEC.CK.HEXSTORE.v0.1.md)).

## The v1.4 unification (why this is the convergence point)

CK.Lib.Js shipped three pieces in sequence:

| Version | What shipped | What it enabled |
|---|---|---|
| v1.3.11 | Wire contract (subjects, codec, dedup, dictionary) | A consistent way to *receive* sealed facts. |
| v1.3.12 | Typed envelope on the delivery handler | Consumers stopped re-parsing NATS subject grammar; `msg.subjectIri` / `msg.conceptType` / `msg.kernel` / `msg.verb` are pre-derived. |
| v1.3.13 | `ck-rdf-bridge.js` | Per-message JSON-LD body → `rdf.js Quad[]` conversion, lazy-loading `@rdfjs/data-model` only when called. |
| **v1.4 — CKHexStore** | **A store that consumes (1) the envelope, (2) the bridge, (3) the dictionary, and projects the result into the same hex-indexed handle space pgRDF/Oxigraph use server-side.** | App authors get *one* native store API that already speaks the v3.8 wire format end-to-end. No glue code. |

CKHexStore is the unification: it is the component that closes the loop between "facts arrive over NATS" and "the graph is queryable in the browser as the same shape pgCK governs server-side." That is the v1.4 thesis in one sentence.

## Why it lives here right now

CKHexStore can't ship before its NATS wire input is contractually pinned, and that pinning lives in CK.Lib.Js — specifically in [SPEC.CK-LIB-JS.v1.3.11.md §4](../SPEC.CK-LIB-JS.v1.3.11.md) (subject grammar, headers, codec, dedup, dictionary) and the v1.3.12/v1.3.13 additions in the CHANGELOG. Co-locating the spec while it stabilises avoids a cross-repo round-trip every time CK.Lib.Js advances. Once the API surface is locked and the v0.1.0 implementation lands in v1.4, the component graduates.

## Why it leaves later

CKHexStore is content-addressed by the *graph it stores*, not by the *NATS layer that delivers it*. Two consumers want it without CK.Lib.Js's full chrome:

1. **Non-browser environments** (Node, Deno, edge workers) that talk to pgCK over the same NATS subjects but don't want a page harness.
2. **Other transports** (REST replay, file-based bulk import) that produce the same JSON-LD-shaped facts.

Once the v0.1.x line is shipped from inside CK.Lib.Js v1.4 and the public API has held still for two minors, the component moves to its own repo with its own credit, its own changelog, and its own publish cadence. CK.Lib.Js will then import it back the same way any other consumer would.

## Status as of 2026-06-05

- **Spec:** v0.1 draft — [SPEC.CK.HEXSTORE.v0.1.md](./SPEC.CK.HEXSTORE.v0.1.md). Tracks CK.Lib.Js v1.3.13; under pgCK review.
- **CK.Lib.Js host:** v1.3.13 shipped (typed envelope + rdf-bridge). v1.4 is the target landing for `ck-hex-store.js`.
- **Distribution:** when shipped, the file lands at the OCI bundle root as `ck-hex-store.js` (the subfolder here is for incubation; the published artifact follows the flat-root convention of every other CK.Lib.Js module — per [SPEC.CK-LIB-JS.v1.3.11.md §2.1](../SPEC.CK-LIB-JS.v1.3.11.md)).
- **npm subpath (planned):** `@conceptkernel/cklib/hex-store` → `./ck-hex-store.js`. Standalone npm name TBD when the component graduates.

## Reading order

1. This README.
2. [SPEC.CK.HEXSTORE.v3.8.1.md](./SPEC.CK.HEXSTORE.v3.8.1.md) — **current spec**. URN-native event surface: `store.bind(urn, fn)`, `store.invoke(actionUrn, payload)`, `store.view(urn)`. What developers actually call.
3. [SPEC.CK.HEXSTORE.v0.1.md](./SPEC.CK.HEXSTORE.v0.1.md) — **foundation spec**. Wire input, hex indexes, dictionary, projection rules. v3.8.1 inherits this and adds the URN layer on top.
4. [../SPEC.CK-LIB-JS.v1.3.11.md](../SPEC.CK-LIB-JS.v1.3.11.md) §4 — the wire contract CKHexStore consumes (subject grammar, headers, codec, dedup, dictionary). Pre-v1.3.12 envelope, but the wire layer it documents is unchanged.
5. [../CHANGELOG.md](../CHANGELOG.md) §1.3.12 + §1.3.13 — the typed envelope and the RDF/JS bridge CKHexStore composes on top of.
6. [../ck-rdf-bridge.js](../ck-rdf-bridge.js) — the v1.3.13 file the spec's `toRdfJs()` delegates to.
7. [/Users/neoxr/git_conceptkernel/pgCK/_WIP/SPEC.URN.SCHEME.SPATIAL.ROUTING.v3.8.md](/Users/neoxr/git_conceptkernel/pgCK/_WIP/SPEC.URN.SCHEME.SPATIAL.ROUTING.v3.8.md) — the URN families and ontological-routing premise v3.8.1 implements browser-side.
8. [../SPEC.CK.LIB.JS.HEXSTORE.v0.1.md](../SPEC.CK.LIB.JS.HEXSTORE.v0.1.md) — the original draft at repo root (kept for history; the canonical specs now live here).

## Versioning scheme (the v0.1 → v3.8.1 jump explained)

- **v0.1** uses component-internal numbering (HexStore's own API maturity).
- **v3.8.1 onwards** uses CKP-aligned numbering: the **major.minor** matches the **CKP protocol generation** the spec is built against; the **patch** is the revision at that protocol version. This makes the protocol baseline explicit on the spec's face.
- The component **implementation** version is still independent. The next ship target is `0.1.0` inside CK.Lib.Js v1.4 (pre-1.0 API).
- A future CKP v3.9 would yield `SPEC.CK.HEXSTORE.v3.9.0.md`. A patch revision at v3.8 yields `SPEC.CK.HEXSTORE.v3.8.2.md`, leaving v3.8.1 in place for history.

## Architectural credit

The hexagonal-indexing approach (SPO/SOP/PSO/POS/OSP/OPS) is the same shape Oxigraph uses server-side. CKHexStore mirrors it client-side so that handle IDs flow end-to-end without a translation layer between server and browser.

## Not in v0.1

- No SPARQL engine. `match({s,p,o})` is the only query surface.
- No reasoning. The browser sees only what pgCK sealed.
- No persistence. Reloading the page drops the store; pgCK rehydrates via snapshot on the next CKClient connect.
- No parser. Facts arrive over NATS, never as Turtle/RDF-XML/JSON-LD text bodies.

These exclusions are deliberate and will not be added to v0.1.x. They may appear in a separate companion library later.
