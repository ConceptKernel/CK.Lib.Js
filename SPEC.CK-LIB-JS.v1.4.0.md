# SPEC.CK-LIB-JS.v1.4.0 — CK.Lib.Js Normative Specification

**Status:** authoritative for the artifact published as `ghcr.io/conceptkernel/ck-lib-js:1.4.0`
**Date:** 2026-06-06
**Supersedes:** SPEC.CK-LIB-JS.v1.3.11 (2026-05-31) — kept for history
**Audience:** CK.Lib.Js consumers (concept-kernel page/app authors, bundle integrators), pgCK runtime authors, oci-germination spec maintainers
**Conformance language:** MUST / SHOULD / MAY per RFC 2119
**Companion docs:** [`COMPLIANCE.md`](./COMPLIANCE.md), [`LATEST.md`](./LATEST.md) (published digests + verification), [`PROVENANCE.md`](./PROVENANCE.md) (release policy), [`CHANGELOG.md`](./CHANGELOG.md) (per-version delta)

This document describes **what v1.4.0 IS and how it MUST be used**. It documents the
already-built, attested 1.4.0 artifact — it does not propose changes. Forward work
is confined to §13 (informational). Anything not in §1–§12 is not part of v1.4.0 and
MUST NOT be relied on.

> **Versioning discipline (important).** This spec follows the artifact; it never
> leads it. Any change to shipped code (`ck-*.js`, `package.json`, bundle contents)
> is a new version with its own built + attested artifact (per
> [`PROVENANCE.md`](./PROVENANCE.md)) — never a spec edit alone. The transitional and
> deprecated surfaces noted below (§4.2, §5.7, §6.6) are documented **as shipped**;
> their removal is future-versioned in §13.

---

## 1. Identity and scope

### 1.1 What CK.Lib.Js is

CK.Lib.Js is a self-contained ESM JavaScript library providing:

- A NATS WebSocket client (`CKClient`) speaking the CKP v3.8 wire protocol, with a
  **typed delivery envelope** (`msg.kind / subjectIri / conceptType / kernel / verb`).
- **`CKHexStore`** — a URN-native, 6-way hex-indexed in-memory quad store: the browser's
  local replica of a slice of pgCK's governed graph. **This is the v1.4 centerpiece.**
- **`ck-rdf-bridge`** — a per-message envelope → W3C RDF/JS `Quad[]` converter with a
  hand-rolled, dependency-free DataFactory.
- A page harness (`CKPage`), local pub/sub bus (`CKBus`), `localStorage` store
  (`CKStore`), runtime orchestrator (`CKRuntime`), base kernel class (`CKKernel`).
- A legacy Konva-based rendering surface (registry, materializer, shapes, anim, sound).

It targets the **browser** as the primary runtime. Node.js is not a supported runtime
at v1.4.0 (see §13 for the planned Node adapter).

### 1.2 Identifier

- npm name: `@conceptkernel/cklib` — staged in `package.json` at v1.4.0; **not yet
  published** to the npm registry. Consumers MUST treat OCI as the authoritative
  distribution today.
- OCI image: `ghcr.io/conceptkernel/ck-lib-js:1.4.0` (multi-arch index, also `latest`;
  aggregate digest `sha256:5b5d06…` in [`LATEST.md`](./LATEST.md)).
- Designation: `org.opencontainers.image.designation=ckp:static`. License: MIT.

### 1.3 Versioning

Semantic versioning (`MAJOR.MINOR.PATCH`). v1.4.0 is the first minor after the 1.3.x line.

- A wire-format change (subject grammar, header semantics, codec, dictionary protocol,
  dedup rules) MUST bump MINOR.
- A breaking API change to any export named in §3 MUST bump MAJOR.
- Additive modules/fields and pipeline/documentation changes MAY bump PATCH or MINOR
  as appropriate.

### 1.4 Out of scope for v1.4.0 (MUST be assumed absent)

- Server-side / Node runtime (browser-targeted; no Node adapter ships at v1.4.0).
- Client-side proof verification (the store trusts sealed facts; PROV-O verification
  is future — §13).
- A SPARQL engine or reasoner over `CKHexStore` (the only query surface is `match()`).
- Persistence of `CKHexStore` (RAM-only; reload drops the store).
- Per-type schema files baked into the bundle; a `Ck-Shape-V` codec or `shape.*` subject.
- JetStream-backed durability.

---

## 2. Distribution and bundle layout

### 2.1 OCI bundle (Shape A per SPEC.OCI.BUNDLE.v0.3)

Built `FROM scratch`; image root contains (the Dockerfile's `COPY ck-*.js index.html /`
picks up every module automatically):

```
/ck-anim-grammar.js   /ck-anim.js        /ck-bus.js          /ck-client.js
/ck-hex-store.js      /ck-kernel.js      /ck-materializer.js /ck-page.js
/ck-rdf-bridge.js     /ck-registry.js    /ck-runtime.js      /ck-shapes.js
/ck-sound.js          /ck-store.js
/index.html           /vendor/anime.esm.min.js
/README.md            /LICENSE
```

(New vs v1.3.11: `ck-hex-store.js`, `ck-rdf-bridge.js`.)

Required OCI labels: `title=CK.Lib.Js`, `description=CKP v3.8 JavaScript client library`,
`version=1.4.0`, `source=https://github.com/ConceptKernel/CK.Lib.Js`, `licenses=MIT`,
`designation=ckp:static`. CI injects `revision` (git SHA) + `created` (commit timestamp).

### 2.2 Provenance gate

Every digest in [`LATEST.md`](./LATEST.md) MUST verify under:

```sh
gh attestation verify oci://ghcr.io/conceptkernel/ck-lib-js:1.4.0 --repo ConceptKernel/CK.Lib.Js
```

SLSA Build Provenance v1, Sigstore-backed, pushed as an OCI referrer. Consumer bundles
SHOULD run this before incorporating the layer.

### 2.3 Consumer integration

A `bundle.yaml` MAY declare CK.Lib.Js as a routed `static_web` mount or an additive
`layer_sources` merge (per SPEC.OCI.BUNDLE.v0.3), pinned by `source_image` +
`attestation_repo: ConceptKernel/CK.Lib.Js`. Browsers address modules relative to the
mount (e.g. `/cklib/ck-hex-store.js`).

### 2.4 Runtime dependencies — the precise posture (MUST read)

CK.Lib.Js has **two dependency tiers**, and they differ:

| Layer | Modules | Runtime dependency |
|---|---|---|
| **Transport** | `ck-client.js` | **Loads `https://esm.sh/nats.ws@1.30.3` and `https://esm.sh/@msgpack/msgpack@3.0.0` at module load.** (CDN imports — lines 43–44.) |
| **RDF / store** | `ck-rdf-bridge.js`, `ck-hex-store.js` | **Zero.** Hand-rolled W3C RDF/JS DataFactory; no `@rdfjs/*`, no `esm.sh`, no `import()` of any URL. |
| Rendering | `ck-sound.js`, `ck-page.js` | MAY load Tone.js / Google Fonts from CDN on demand. `ck-registry/shapes/materializer` require `Konva` + `anime` as host globals (`anime.esm.min.js` is vendored). |

**Consequence:** the offline / air-gapped / attested-bundle posture holds today **only
for the RDF/store layer**. The transport still reaches `esm.sh`. A deployment that
forbids third-party CDNs MUST self-host equivalents at the imported URLs. Closing this
gap by vendoring the transport is future-versioned (§13).

---

## 3. ESM export surface (top-level)

The `package.json` `exports` map fixes the public surface (additions vs v1.3.11 in **bold**):

| Subpath | Module | Named exports |
|---|---|---|
| `.` / `./client` | `ck-client.js` | `CKClient`, `msgpackEncode`, `msgpackDecode` |
| **`./rdf-bridge`** | **`ck-rdf-bridge.js`** | **`toQuads` (default), `dataFactory`** |
| **`./hex-store`** | **`ck-hex-store.js`** | **`CKHexStore` (default), `CKSubject`, `CKView`, `ckBind`, `makeNativeDatasetCore`** |
| `./page` | `ck-page.js` | `CKPage` |
| `./bus` | `ck-bus.js` | `CKBus` |
| `./kernel` | `ck-kernel.js` | `CKKernel`, `cssVars` |
| `./registry` | `ck-registry.js` | `registry`, `computeLayout`, `materialize` |
| `./runtime` | `ck-runtime.js` | `CKRuntime` |
| `./materializer` | `ck-materializer.js` | `mergeDesign`, `computePositions`, `materializeQuestion` |
| `./store` | `ck-store.js` | `CKStore` |
| `./shapes` | `ck-shapes.js` | `createVoteCard`, … `createSessionNode` |
| `./anim` | `ck-anim.js` | `animate`, `ANIM_GRAMMAR`, `COMMON_ANIM` |
| `./sound` | `ck-sound.js` | `CKSound` |

When `ck-rdf-bridge.js` is imported, it also attaches `CKClient.prototype.toQuads`
(§6.3). Any identifier not in this table is internal and MAY change without a MAJOR bump.

---

## 4. CKClient — NATS wire protocol + typed envelope

The §4 wire contract (subject grammar, CONNECT, headers, codec, dedup, dictionary,
auth, `send`, `saveState/loadState`, `disconnect`) is **unchanged from
SPEC.CK-LIB-JS.v1.3.11 §4** and remains normative. Summarized here, with the v1.3.12
**typed envelope** documented in full as the v1.4-line addition.

### 4.1 Subject grammar

| Subject | Role | Status |
|---|---|---|
| `input.kernel.<K>.action.<verb>` | publish | **canonical v3.8** |
| `result.kernel.<K>.action.>` | subscribe | canonical |
| `event.kernel.<K>.>` | subscribe | canonical |
| `event.kernel.<K>.error` | subscribe | always auto-subscribed |
| `event.kernel.Dictionary.>` | subscribe | internal; does NOT emit on `event` |
| `input.<K>` / `result.<K>` / `event.<K>` | pub/sub | **DEPRECATED short-form** — still emitted/subscribed at v1.4.0; removal targeted v2.0 (§13) |

### 4.2 Deprecated short-form (transitional)

`send()` publishes on `input.<K>` (always) and additionally on
`input.kernel.<K>.action.<verb>` when the payload includes `action`; the client also
subscribes both short and long forms. The short form is **deprecated** and retained
only for back-compat. Consumers SHOULD treat the long form as canonical. Removal is a
MAJOR change (v2.0).

### 4.3 Headers

Published: `Nats-Msg-Id`, `Trace-Id` (`tx-XXXXXX`), `X-Kernel-ID`, `X-User-ID`,
`X-Anonymous`, `Authorization: Bearer <token>` (iff a token is set). Honored on
receive: `Ck-Seq` (per-subject dedup), `Content-Encoding: msgpack` (binary decode,
else JSON), `Trace-Id` (surfaced as `msg.traceId`).

> **Security note (informational).** `X-User-ID` / `X-Anonymous` are **client-asserted**.
> pgCK MUST derive identity from the verified JWT, not these headers. Subscription
> subjects are wildcards (`result.kernel.<K>.action.>`); per-identity authorization is
> a pgCK/NATS responsibility. See the session/security boundary thread in `_WIP/`.

### 4.4 Codec, dedup, dictionary, auth

- **Codec:** decode once → `msg.data`; `Content-Encoding: msgpack` → `msgpackDecode`,
  else JSON. Publish side is JSON only at v1.4.0.
- **Dedup:** `Ck-Seq` per-subject `Set` capped at 1000; publisher-assigned; absent →
  no dedup.
- **Dictionary:** auto-subscribe `event.kernel.Dictionary.{snapshot,v_bumped}`;
  accessors `handleForIri(iri)`, `iriForHandle(handle)`, `dictVersion`. (pgCK does not
  publish a project dictionary yet; see §5.5.)
- **Auth:** Keycloak JWT; `login()`/`logout()`/token-refresh each **reconnect**
  (full drain → reopen → re-subscribe) so the server-side permission ACL reflects the
  current identity. On refresh failure → anonymous + reconnect.

### 4.5 Typed delivery envelope (v1.3.12 — normative)

Every `event` / `result` / `broadcast` / `error` delivery carries, alongside
`{ subject, headers, data, traceId }`, five derived fields (`_deriveEnvelope`):

| Field | Derivation |
|---|---|
| `msg.kind` | the channel: `event` / `result` / `broadcast` / `error` |
| `msg.subjectIri` | `data['@id']` if present; else derived from `conceptType` + the type's id-predicate (e.g. `…task_id`); **never** a `urn:ckp:participant:*` value; else `null` |
| `msg.conceptType` | `data['@type'] ?? data['type']` — string \| string[] \| null |
| `msg.kernel` | parsed from the subject: long-form `<kind>.kernel.<K>.<verb>` (strips trailing `.action`) or short-form `<kind>.<K>` |
| `msg.verb` | last long-form segment (e.g. `sealed`); `null` in short-form / broadcast |

The decoded body remains the source of truth; these fields are caches/projections.
Consumers SHOULD read the envelope instead of re-parsing subject grammar.

### 4.6 Event channel API

`ck.on(event, fn)` / `ck.off(event, fn)` for `result`, `event`, `error`, `broadcast`,
`status`. `status` payload: `{ connection ∈ {disconnected,connecting,connected,error}, auth, error? }`.
Handlers MUST be synchronous and MUST NOT throw.

---

## 5. CKHexStore — URN-native graph store (the v1.4 centerpiece)

`ck-hex-store.js` exports `CKHexStore` (default), `CKSubject`, `CKView`, `ckBind`,
`makeNativeDatasetCore`. It is the **only** in-client store flavor CK.Lib.Js ships.

```js
import { CKClient }   from '/cklib/ck-client.js';
import { CKHexStore } from '/cklib/ck-hex-store.js';
const ck    = new CKClient({ kernel: 'pgCK.Task' });
const store = new CKHexStore(ck);
await ck.connect();
ck.on('event',  m => store.insert(m));
ck.on('result', m => store.insert(m));
```

### 5.1 Construction & contract

`new CKHexStore(ck, opts?)`. The store is **transport-agnostic**: it consumes only six
members of `ck` — `kernel`, `dictVersion` (getter), `handleForIri`, `iriForHandle`,
`on/off`, `send` (the duck-typed contract in
`_WIP/ck-hex-store/SPEC.HEXSTORE.TESTING-WITHOUT-NATS-AND-PGCK.v3.8.1.md §5`). Options:
`replaceBySubject` (default `true`), `dedupBySeq` (`true`), `recentCapacity` (1024),
`localHandleStart` (2³¹), `defaultGraph` (0).

### 5.2 Storage & query surface

| Member | Returns / effect |
|---|---|
| `insert(msg)` | `bigint[]` newly-added quadIds (drops on dedup; applies replace-by-subject) |
| `remove(quadId)` / `removeBySubject(iriOrHandle)` | `boolean` / `number` |
| `match({ s?, p?, o?, g? })` | `bigint[]` quadIds, selectivity-aware over 6 indexes (SPO/SOP/PSO/POS/OSP/OPS) |
| `inflate(quadId)` / `inflateAll(qids)` | `{s,p,o,g}` IRI/literal records |
| `size` / `subjects` | total quad count / distinct-subject count |
| `predicates()` / `classes()` / `types()` | `[{predicate\|type, count}, …]` |
| `recent(n)` | last n inflated quads, insertion order (bounded ring buffer) |
| `toRdfJs()` | W3C RDF/JS `DatasetCore` view — **native, zero deps** |

### 5.3 URN-native surface (the developer experience)

App code names **concepts (URNs)**, never NATS subjects/codecs/handles:

| Member | Purpose |
|---|---|
| `bind(urn, fn, opts?)` / `bindOnce(...)` | dispatch on URN-pattern after `insert()`: `ckp://Kernel#K`, `ckp://Kernel#K/<verb>`, `ckp://Instance#X`, `ckp://Edge#P`, `*` |
| `invoke(actionUrn, payload, opts?)` / `ask(...)` | publishes via `ck.send()`; trace-correlated promise; default 30 s timeout; transport failure rejects, domain rejection resolves with `outcome:'rejected'` |
| `urn(iri)` | synchronous `CKSubject \| null` (pure read; no fetch, no allocation) |
| `view(iri, opts?)` | reactive `CKView`: `.exists()/.get()/.edges()`, `.on('change', {added,removed})` (microtask-batched), `.dispose()` |
| `on('insert'\|'remove'\|'remap'\|'snapshot'\|'error', fn)` | low-level **diagnostic** events; app code SHOULD prefer the URN surface |

> **Action-URN parsing (shipped behavior — note the limitation).**
> `invoke('ckp://Action#<K>.<verb>', …)` → `ck.send({ action: <verb>, …})`.
> `parseActionUrn` (`ck-hex-store.js:1010`) splits on the **last** dot: the kernel MAY
> contain dots (`pgCK.Task`), the verb is the **single last segment** (`create`). So
> `ckp://Action#pgCK.Task.create` → kernel `pgCK.Task`, verb `create`. **Limitation:**
> pgCK governance verbs are themselves **dotted** (`task.create`, `task.update`,
> `participant.join`, `edge.create`) and **cannot be expressed** as the verb segment
> under last-dot-split (`…SuperAiHarness3000.participant.join` mis-parses to verb
> `join`). Reconciling the action-URN ↔ pgCK-verb convention is forward work (§13) and a
> pgCK coordination item; until resolved, `invoke()` reliably expresses only
> single-segment verbs.

`CKSubject` (`urn(iri)`): `.handle`, `.exists()`, `.types()`, `.get(pred)`, `.getAll()`,
`.has()`, `.edges()`, `.reverseEdges()`. Literals return `{v, dt?, lang?}`; object refs
return the IRI string.

### 5.4 Projection rules (envelope → quads)

`insert(msg)` routes by body shape:

- **JSON-LD body** (default): subject = `msg.subjectIri ?? data['@id'] ?? data.id`
  (skip if none). `rdf:type` from `msg.conceptType ?? data['@type'] ?? data.type`
  (string or array). One quad per own property not in
  `{@id,@type,@context,id,type,trace_id,timestamp}`; arrays → one quad per element.
- **Binary delta** (`{e,p,o,g?}`): single quad. **Present but inert** until pgCK
  publishes binary events (§13).

**Object term resolution (per pgCK alignment):**
- Predicate-tail **whitelist** — `target_kernel`, `part_of_goal`, `created_by` →
  NamedNode ref regardless of value shape (pgCK bare-string refs).
- `{"@id":"…"}` → NamedNode ref everywhere.
- All other strings → literals. The IRI-shape heuristic is **not** trusted for
  pgCK's bare-string values.

> This whitelist is a transitional band-aid. When pgCK ships v3.8 object-refs as real
> `{"@id"}` id-nodes (SHACL `nodeKind sh:IRI`), the whitelist is removed (§13).

### 5.5 Dictionary handles (local until pgCK ships)

Each IRI interns to a uint32 handle via `ck.handleForIri()` (canonical) else a
**local handle from 2³¹**. pgCK does not publish a project dictionary at this writing,
so the store self-allocates locally and is operational day-zero. On a future
`Dictionary.snapshot` (`ck.dictVersion` change, observed per-insert), a remap pass
rekeys local → canonical handles.

### 5.6 Default ingest — replace-by-subject

A JSON-LD body with an `@id` calls `removeBySubject(@id)` then re-inserts, so re-seals
(same `@id`, new body) **replace** rather than accrete. Opt out via
`{ replaceBySubject: false }` (append-only / event-sourced consumers).

### 5.7 Affordance wrappers — `NotShippedYet`

`resolve(uri)`, `affordances(kernelUri)`, `proof(uri)`, `validate(shapeUri, body)` are
present but **reject fast with `NotShippedYet`** until pgCK exposes the `CK.Core`
affordances (CKA-3/4). They are honest hard-stops, not fallbacks.

### 5.8 Bulk replay — server-side only at v1.4.0

pgCK exposes a `snapshot.bodies` request/reply verb returning raw sealed bodies for
bulk replay. **CK.Lib.Js v1.4.0 does not auto-request it** — a consumer MAY call
`ck.send({action:'snapshot.bodies', …})` and bulk-`insert()` the result. Client-side
wiring (and real-corpus capture) is future (§13).

---

## 6. ck-rdf-bridge — per-message RDF/JS converter

### 6.1 `toQuads(msg, opts?)` → `Quad[]`

**Synchronous, native.** Converts a CKClient envelope to W3C RDF/JS `Quad[]`. Handles
the JSON-LD body shape and the binary-delta shape (`{e,p,o,g?}`, handles inflated via
`opts.inflate`). Literal typing: strings → `xsd:string` (or NamedNode if IRI-shaped),
integers → `xsd:integer`, non-integers → `xsd:decimal`, booleans → `xsd:boolean`;
`{"@id"}` → NamedNode.

### 6.2 `dataFactory`

A hand-rolled W3C RDF/JS DataFactory (`NamedNode`, `BlankNode`, `Literal`, `Variable`,
`DefaultGraph`, `Quad`). **Zero dependencies**, no `@rdfjs/*`, no CDN import. This is
the same factory `CKHexStore.toRdfJs()` uses.

### 6.3 Instance method

Importing the bridge attaches `CKClient.prototype.toQuads(msg, opts?)`, which closes
over `this.iriForHandle()` so the binary-delta path auto-inflates dictionary handles.

> `toQuads` (per-message) and `CKHexStore.toRdfJs()` (whole-store) are two RDF surfaces
> sharing one factory; `toQuads` serves non-store consumers. Consolidation is reviewed
> in §13.

---

## 7. Legacy surface (stable; unchanged from v1.3.11)

The following are **unchanged from SPEC.CK-LIB-JS.v1.3.11** and remain normative at
their respective sections there: **CKPage** (page harness, ontology parse, kernel-JS
contract, edge overlays, auth flow — v1.3.11 §5), **CKBus** (local pub/sub with
`*`/`>` wildcards — §6), **CKStore** (`localStorage` instance store — §7), **CKRuntime**
(orchestrator — §8), **CKKernel** + `cssVars` (base class — §9), and the **Konva
rendering surface** (`ck-registry`, `ck-materializer`, `ck-shapes`, `ck-anim`,
`ck-sound` — §10; requires host `Konva`/`anime` globals).

> Direction (informational): under the thin-core decision, the rendering surface is a
> candidate for extraction to CK.Lib.Xr / sibling renderers; the core is the
> event + store kernel (§4–§6). See §13.

---

## 8. Runtime environment requirements

Modern evergreen browser (ES2020+ modules, `WebSocket`, `localStorage`, `fetch`,
`Map`/`Set`/`Promise`, async iterators); HTTPS (or `http://localhost`); reachable NATS
WSS endpoint and Keycloak realm; network access to `esm.sh` (or self-hosted
equivalents) for the transport tier (§2.4); `Konva` + `anime` globals only if the
rendering surface is used. Node.js is not a supported runtime at v1.4.0.

---

## 9. Conformance summary

A consumer is conformant iff:

1. It loads modules from a v1.4.0 OCI image whose digest passed `gh attestation verify`
   (§2.2).
2. It uses only the exports in §3.
3. Its NATS server publishes on the §4.1 subject grammar and respects §4.3 headers.
4. If it consumes binary events, it does so via `Content-Encoding: msgpack` (§4.4).
5. If it depends on per-subject ordering, it stamps `Ck-Seq` (publisher-assigned, §4.4).
6. If it uses `CKHexStore`, it feeds deliveries via `insert(msg)` and reads via the
   §5.3 URN surface (`bind`/`view`/`urn`/`invoke`) — never by naming NATS subjects,
   codecs, or handles in application code.

A pgCK-side runtime is conformant for the governed-graph path when it stamps `@id` on
sealed bodies (shipped), and — for the not-yet-shipped paths — when it publishes a
project dictionary (§5.5), binary events (§5.4), and `CK.Core` affordances (§5.7).
Absent those, `CKHexStore` operates on JSON-LD + local handles, which is conformant.

---

## 10. Transitional & deprecated surfaces (shipped at v1.4.0 — summary)

| Surface | State | Removal/exit |
|---|---|---|
| Short-form subjects (`input.<K>`, …) | deprecated, live | v2.0 (MAJOR) — §13 |
| Binary-delta ingest path | present, inert | activates when pgCK publishes binary events |
| Predicate-tail ref whitelist | band-aid | removed when pgCK ships v3.8 `{"@id"}` refs |
| `resolve/affordances/proof/validate` | `NotShippedYet` | when `CK.Core` (CKA-3/4) ships |
| Transport esm.sh imports | live CDN dependency | vendoring planned (§13) |
| `on('insert'…)` diagnostics | live | URN surface is the app-facing one |

These are documented as **what 1.4.0 is**. None may be relied on as permanent.

---

## 11. Conformance language & change control

Changes to any §1–§10 behavior require a new artifact version with its own built +
attested OCI image (and, when published, npm tarball) per [`PROVENANCE.md`](./PROVENANCE.md).
A release tag MUST pair with a delivered, verifiable artifact — never a spec or tag
alone. This document is immutable once an artifact ships under it; the next change ships
as `SPEC.CK-LIB-JS.v<next>.md`.

---

## 12. References

- Published digests + verification: [`LATEST.md`](./LATEST.md)
- Per-version delta: [`CHANGELOG.md`](./CHANGELOG.md) (§1.3.12 typed envelope, §1.3.13
  bridge, §1.3.14 native re-cut, §1.4.0 CKHexStore)
- Prior normative spec (history): `_WIP/SPEC.CK-LIB-JS.v1.3.11.md`
- CKHexStore design specs: `_WIP/ck-hex-store/SPEC.CK.HEXSTORE.v3.8.1.md` (URN surface),
  `SPEC.CK.HEXSTORE.v0.1.md` (wire/projection), `SPEC.HEXSTORE.TESTING-…v3.8.1.md` (stub contract)

---

## 13. Forward work (informational; NOT part of v1.4.0)

Forward-looking; MUST NOT be relied on by consumers. The **top-level target** is the
**L2 operable concept-kernel interface** specified in `SPEC.CKP.v3.8.1` (home repo
pgCK; ref-symlink `ref-SPEC.CKP.v3.8.1.md`): a `CK` facade with five operations
(`activate` / `create·update·list` / `validate` / `confirm` / `behave·on`) over
`CKHexStore`, leaking no L0 transport or L1 graph token. At v1.4.0 the client exposes
**L1** (`CKHexStore`); L2 is specified, not built. The de-hybridization plan and
targets (regression / interface-unification / size / packaging / session-security /
**operable-L2**) are tracked in **`_WIP/ROADMAP.CK.LIB.JS.v1.5-to-v2.0.md`**. Highlights:

| Direction | Track |
|---|---|
| **L2 operable interface** (`CK` facade: activate/create/update/list/validate/confirm/behave·on) over CKHexStore — the top-level target | roadmap v1.13 (T‑L2) |
| Real pgCK corpus drives projection; replace invented fixtures | roadmap v1.5 (T‑REG) |
| pgCK v3.8 `{"@id"}` object-refs → **delete** the whitelist + IRI heuristic | roadmap v1.6 |
| Vendor `nats.ws` + `@msgpack/msgpack` → true no-CDN/air-gapped bundle | roadmap v1.10 |
| Minified build + TypeScript types | roadmap v1.10 / v1.11 |
| Agent-instruction surface (`SKILL.md` "CK ops for LLM agents") + Node `ck` adapter | roadmap v1.13 / v1.15 |
| Extract rendering substrate → CK.Lib.Xr (thin core) | roadmap v1.14 |
| Action-URN ↔ pgCK-verb convention (last-dot-split can't express dotted verbs like `task.update`) | pgCK coordination + roadmap (gates L2 `create/update`) |
| Remove deprecated short-form, placeholders; client proof verification | roadmap v2.0 |

Each item that ships becomes part of the next normative spec. This document does not move.
