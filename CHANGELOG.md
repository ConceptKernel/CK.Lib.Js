# Changelog

All notable changes to CK.Lib.Js are documented here.

## [1.5.1] — 2026-06-18

> **✅ RELEASED 2026-06-18 — attested-success.** CI run `27790532785` (publish in 50s) →
> `ghcr.io/conceptkernel/ck-lib-js:1.5.1`; `gh attestation verify` exit 0; `LATEST.md` advanced to v1.5.1;
> GitHub Release live (21:31:20Z). **Byte-verified:** bundle = exactly `ck.js` + `ck-client.js` +
> `ck-store.js` + `vendor/{nats.ws,msgpack}.js` + README/LICENSE (no `tests/`, no `SPEC.*`). Terminal
> status logged; the next tag is unblocked (PROVENANCE Rule 3/4). **Forms proven real-path** — see
> `tests/real-path/`; the disclosed gaps (BLK-1 enforcement, FIX-C reach) are server/bundle-side, v1.6.0.

First release of the **typed-edge forms** — kernel-derived typed operations mirroring pgCK v0.5 tracks
T1–T6 — plus client bug fixes and the canonical NATS wire-contract spec. Requires **pgCK ≥ 0.4.13**.

### Added — typed-edge forms
- `create(type, fields)` — uniform type-first body; drops the `task`/`name` payload-key nesting (TE-10).
- `query(type, filter)` — derived-QueryShape reads: declared-IRI type, short filter keys, flattened rows (TE-9).
- `transition(id, toState)` — native sealed-map transition; surfaces the `allowed` states (TE-7).
- `update(id, patch)` — declared-shape patch `{id, patch:{…}}` (TE-6).
- `validate(body)` — full SHACL `ValidationReport` (no boolean-grade reduction) (TE-5).
- `match(term)` — governed `concept.match`; binds `{term}` into the sealed query, returns `candidates` (TE-4).

### Fixed
- **Gov-door routing (G5a):** governed verbs route to `input.kernel.<gov>.action.*` and the gov reply is
  subscribed — fixes `CK.activate(<non-gov kernel>).create()` (and all governed verbs) timing out.
- `notify(from, predicate, to, body?)` now seals the cross-kernel edge — was missing `target` (FIX-A).
- `link(source, predicate, target)` — `target` is a plain IRI; an `{'@id'}` wrapper turtle-errored (TE-8).
- Discovery verb `kernel.affordances` → `affordances` (FIX-B).
- Read reply-field normalization corrected to pgCK's pinned per-verb fields; read rows flatten to instances.

### Verified
- All forms proven **real-path** (browser → wss → relay → pgCK 0.4.13), not mock/psql — see `tests/real-path/`.

### Known (server/bundle-side, tracked for v1.6.0)
- Declared-shape **enforcement is vacuous on the demo bundle** — its shapes are seeded into
  `urn:ckp:demo/kernel/board` while pgCK reads `…/kernel/ck` (BLK-1). Enforcement works on a
  correctly-seeded kernel.
- `reach` degrades to `[]` pending a pgCK bare-id fix (FIX-C).

### Breaking vs 1.5.0
- `notify` signature gains `from` as the first argument.
- `create` drops the `{task:{…}}` wrapper (pass fields directly).
- `query` filters use declared property localnames (QueryShape).

## [1.5.0] — 2026-06-11

> **✅ RELEASED 2026-06-11 — attested-success.** CI run `27374736960` → `ghcr.io/conceptkernel/ck-lib-js:1.5.0`
> @ `sha256:195c20713314653b5a6f0078be5783520754ba7010f457c87ad2da66d771117d`; `gh attestation verify` ✓;
> `LATEST.md` advanced; GitHub Release live. **Byte-verified:** bundle = exactly `ck.js` + `ck-client.js` +
> `ck-store.js` + `vendor/{nats.ws,msgpack}.js` + README/LICENSE (no `index.html`/`ck-page` — the legacy
> console is gone). Terminal status logged; the next tag is unblocked (PROVENANCE Rule 3/4).

**Dispatch-only concept-kernel surface — aligned to CKP v3.9 Critical Isolation.** The client becomes
dispatch-only: it authenticates and dispatches typed payloads, and nothing else crosses. There is **no
RDF, no quad store, no SPARQL, no query engine** on the client — it addresses URNs and typed instances,
never triples, graphs, or storage layout (`SPEC.CK-LIB-JS.v1.5.0.md` §0, §0.1). Built on the **v1.4.2
vendored base** (`ck-client.js` imports `./vendor/*`; no runtime CDN — air-gapped, supply-chain closed).

### Added / Changed — facade adapted to pgCK 0.4.2's live wire (verified vs ociger-ck-allinone v0.7.17)
- **`ck.js` (`CK`/`ConceptKernel`):** `create` nests `{task:{target_kernel,…}}` + optimistic cache-insert
  (the sealed reply is a receipt; the sealed event reconciles via replace-by-id); `query` emits
  `{type:<IRI>, filter:[{op,key,value}]}`; a per-verb reply normalizer maps `rows`/`kernels`/`instances`/
  `reached`/`candidates` → `.result` so the typed cache ingests; governance `propose(op,detail,requires_quorum)`
  / `vote(iri,value)` / `apply(iri)`; discovery verb `affordances`.
- **`ck-client.js`:** scrubbed the legacy production-endpoint defaults (`wss://stream.tech.games`,
  `id.tech.games`, realm `techgames`) — endpoints derive same-origin (`wss://<host>/wss`) or are
  explicit-required (throws). No client auto-targets a fixed host.
- **Verified LIVE** vs pgCK 0.4.2 over NATS-WSS: governed seals (`proof_digest`), typed reads ingest,
  governance round-trips (propose→vote→apply, epoch advance). Open wire-contract questions (reply-envelope
  normalization, `instance.create` routing) filed with pgCK; `normalizeReply` is forward-compatible (only
  fills an absent `.result`).

> Unreleased — no `1.5.0` tag until a built + attested `ghcr.io/conceptkernel/ck-lib-js:1.5.0` image
> verifies (`PROVENANCE.md`). The transport flip to the `ckp.dispatch` four-tuple ingress is **deferred**
> — v1.5.0 ships the dispatch surface over the **current per-verb wire** via the v3.8→v3.9 shim and the
> `instance.*` aliases; the four-tuple flip lands when pgCK CI-B presents `ckp.dispatch` natively.

### Added — the L2 concept-kernel surface (`ck.js`)
- **`ck.js`** — exports `CK` / `ConceptKernel` (default + named) + `ckOn` (decorator). `CK.activate(kernel)`
  brings a concept kernel to life (authenticate + subscribe granted scope) and returns a live
  `ConceptKernel` handle. App code names concept kernels and concepts (URNs) — never NATS subjects,
  codecs, handles, trace ids, quads, graph ids, or query strings.
- **Explicit operation→verb table** maps the stable handle floor (`create`/`update`/`transition`/`link`/
  `list`/`query`/`get`/`reach`/`verify`/`provenance`/`snapshot`/`validate`/`retire`/`propose`/`vote`/
  `apply`) to v3.9 `instance.*` / `kernel.*` verbs. Honest-degradation fallbacks (transition→update,
  query→instances.list, governance `{ ok:false, gov_plane_unavailable }`) now have real server backing
  but degrade honestly until the pgCK CI gates land.

### Added — the L1 typed-instance cache (`ck-store.js`)
- **`ck-store.js`** — `CKStore` (default), a Map of `@id`/URN → typed JSONB instance fed only by dispatch
  replies + granted-scope events. **Not an RDF store**: no quads, no 6-way hex index, no DatasetCore, no
  SPARQL, no `toQuads`. Carries the former hex-store's *instance* projection (replace-by-id, dedup-by-seq,
  recent ring); the *triple* projection is gone. Reactive reads via `view`/`urn`/`bind` (`CKView`,
  `CKSubject`, `ckBind`). There is **no legacy ck-store** — this is `ck-store.js`.

### Changed — `ck-client.js` gains the dispatch transport (on the v1.4.2 vendored base)
- **`ck-client.js`** — the vendored v1.4.2 NATS WSS client gains the L0 dispatch surface the `ck.js`
  facade composes: a constructor dispatch-state block (`_pending` / `_scopeListeners` / `_dispatchMode` /
  `_dispatchIngress` / `_dispatchTimeout`), `disconnect()` pending/scope cleanup, Trace-Id correlation +
  granted-scope delivery in the subscription loop, and the methods `dispatch` / `_resolvePending` /
  `subscribe` / `affordances` / `close`. `dispatch()` carries the four-tuple ⟨verb, kernel_urn, payload,
  identity⟩; against a pre-CI-B pgCK the transitional `v3.8` shim maps each verb to its per-verb subject
  (removed at pgCK CI-B). The `./vendor/*` imports are unchanged — **no esm.sh, air-gapped**.

### Package / bundle
- **`package.json`** — `version` → `1.5.0`; `main` → `ck.js`; `exports`: `.` → `./ck.js`,
  `./internal/client` → `./ck-client.js`, `./internal/store` → `./ck-store.js`, `./client` →
  `./ck-client.js`; `files` adds `ck.js` + `ck-store.js`.
- **`Dockerfile`** — `COPY ck.js ck-client.js ck-store.js /` + `COPY vendor /vendor`; version label →
  `1.5.0`; header → v3.9 dispatch-only (vendored, air-gapped).

---

## [1.4.3] — 2026-06-11

**Corrective release — the first OCI bundle that actually ships the stripped client.**

### Fixed — release pipeline built `main`, not the tag (CRITICAL packaging integrity)
- `oci-publish.yml` checked out `ref: main` (since the v1.3.9 pipeline collapse). Releases v1.4.1/v1.4.2
  were tagged on a task branch (per the LOCKS discipline — release commits never land on `main`), so their
  CI builds packaged **main's stale v1.4.0 tree**: the published `:1.4.1` and `:1.4.2` OCI bundles are
  byte-identical to `:1.4.0` — the full pre-strip 18-file set (incl. `ck-hex-store.js`, `ck-rdf-bridge.js`,
  `ck-page.js`, `vendor/anime.esm.min.js`, and the esm.sh-importing client). **The strip announced in
  [1.4.1]/[1.4.2] never reached the published artifacts.** Found by oci-germination's byte-level bundle
  audit (verified 3×). The attestations are valid signatures over the wrong content — SLSA provenance binds
  digest↔workflow-run, not digest↔intended source tree.
- Fix: checkout now defaults to the **pushed tag**; `LATEST.md` is committed to `main` via an explicit
  `origin/main` checkout in the final step (never pushing the tag's tree to `main`).
- **Consumer guidance:** treat `:1.4.1`/`:1.4.2` as equivalent to `:1.4.0` (pre-strip). Pin **`:1.4.3`**
  for the stripped surface. Tags remain immutable on GHCR — no re-cuts.

### Changed
- `ck-client.js`: long-form result subscription broadened `result.kernel.<K>.action.>` →
  `result.kernel.<K>.>` (grammar-agnostic, mirrors the event-side breadth; Trace-Id is the correlator).
  Required for v3.9 relays, which publish `result.kernel.<K>.<verb>` without the v3.8 `.action.` shim segment.

Content is otherwise exactly the [1.4.2] claim: single `ck-client.js` with vendored `nats.ws` + `@msgpack`
under `vendor/` — no client RDF tier, no esm.sh, air-gapped.

---

## [1.4.2] — Unreleased

**Hardening — vendored transport; no runtime CDN; air-gapped.** Closes the last supply-chain vector
called out in v1.4.1: `ck-client.js` no longer runtime-loads `nats.ws` + `@msgpack/msgpack` from
**esm.sh**. Both are now **vendored locally** under `vendor/` as self-contained browser ESM bundles,
so the client has zero external runtime dependencies and runs air-gapped. No behavioural change — the
NATS WSS + Keycloak JWT surface is byte-for-byte the v1.4.1 client; only the import source moved from
CDN to local.

> Unreleased — no `1.4.2` tag until a built + attested `ghcr.io/conceptkernel/ck-lib-js:1.4.2` image
> verifies (`PROVENANCE.md`).

### Changed — vendored NATS transport (closes the esm.sh supply-chain vector)
- **`vendor/nats.ws.js`** — `nats.ws@1.30.3` + all transitive deps bundled to a single self-contained
  browser ESM (esbuild `--bundle --format=esm --platform=browser --target=es2020 --minify`). Exposes
  only the consumed named exports `{ connect, JSONCodec, headers }`. Node's built-in `crypto` is stubbed
  empty at bundle time — its only reference is a dead `require('crypto')` PRNG fallback unreachable in
  browsers (which use `globalThis.crypto.getRandomValues`).
- **`vendor/msgpack.js`** — `@msgpack/msgpack@3.0.0` bundled the same way; exposes `{ encode, decode }`.
- **`ck-client.js`** — imports rewritten from `https://esm.sh/nats.ws@1.30.3` /
  `https://esm.sh/@msgpack/msgpack@3.0.0` to `./vendor/nats.ws.js` / `./vendor/msgpack.js`. No `esm.sh`
  reference remains in the shipped module.
- **`package.json`** — `version` → `1.4.2`; `vendor/` re-added to `files` (publishes with the package).
- **`Dockerfile`** — `COPY vendor /vendor`; version label → `1.4.2`; header notes the vendored
  no-CDN/air-gapped posture.

---

## [1.4.1] — Unreleased (pending built + attested OCI image)

**Stripped intermediary — the "Critical Isolation Alpha" client half.** Removes the client RDF tier
and all unused/attack surface; keeps the NATS WSS client + Keycloak **JWT auth working exactly as
v1.4.0** (the current verb wire). `web2/` develops against this stripped client while the full
dispatch-only **v1.5.0** lands on its own staged, pgCK-gate-aligned thread.

> Unreleased — no `1.4.1` tag until a built + attested `ghcr.io/conceptkernel/ck-lib-js:1.4.1` image
> verifies (`PROVENANCE.md`). Coordinated via NOTIFIES with **pgCK** (`intermediary-isolation-alpha-release`,
> AGREED) + **oci-germination** (`intermediary-stripped-release`, confirmed: pipeline unchanged for the
> smaller bundle — bundle spec is a layout-agnostic full-root merge).

### Removed — client RDF tier + unused surface (archived locally to `_WIP/`, never in history)
- **`ck-rdf-bridge.js`** (`toQuads`, `dataFactory`, `makeNativeDatasetCore`) + **`ck-hex-store.js`**
  (the 6-way hex-indexed RDF graph mirror, `toRdfJs`, `DatasetCore`) — no client RDF/quad surface remains.
- **`vendor/anime.esm.min.js`** (vendored 3rd-party — supply-chain) + **`scripts/`** (dev tooling).
- **Unused render/page modules**: `ck-page`, `ck-bus`, `ck-kernel`, `ck-runtime`, `ck-registry`,
  `ck-shapes`, `ck-anim`, `ck-anim-grammar`, `ck-sound`, `ck-materializer`, `ck-store`, `index.html`.
- `package.json` `exports` reduced to `.` / `./client` → `ck-client.js`; `files` to `ck-client.js` + docs;
  Dockerfile ships `ck-client.js` only.

### Unchanged — "JWT as usual"
- **`ck-client.js`** — the v1.3 NATS WSS client (Keycloak JWT login/refresh, per-verb subject grammar,
  codec, dedup, dictionary, reconnect). No behavioural change; web2 imports `CKClient` exactly as today.

### Known remaining vector (tracked) — RESOLVED in 1.4.2
- `ck-client.js` runtime-loads `nats.ws` + `@msgpack/msgpack` from **esm.sh** (CDN) — needed for NATS;
  vendoring to close the last supply-chain vector is the immediate next step (NOTIFIES.oci-germination
  vendor+CVE thread). **Closed in [1.4.2]** by vendoring both into `vendor/*.js` (no runtime CDN).

---

## [1.4.0] — 2026-06-05

### Added — CKHexStore at repo root (`ck-hex-store.js`)
The native, 6-way hex-indexed in-memory quad store lands at root and ships in the OCI bundle. Skeleton was incubated under `ck-hex-store/` since commit `36629b7`; promoted now per pgCK's APPROVAL of the design (see RESPONSE files in `_WIP/`).

**Public API (per pgCK-RESPONSE §3 — web2 placeholder migration is a pure import-swap):**

| Surface | Returns |
|---|---|
| `new CKHexStore(ck, opts?)` | instance — closes over CKClient for handles + dispatch |
| `insert(msg)` | `bigint[]` — newly added quadIds (drops, dedups, or applies replace-by-subject) |
| `remove(quadId)` / `removeBySubject(iriOrHandle)` | `boolean` / `number` |
| `match({ s?, p?, o?, g? })` | `bigint[]` quadIds, selectivity-aware over 6 indexes |
| `inflate(quadId)` / `inflateAll(qids)` | `{s, p, o, g}` IRI / literal records |
| `size` | total quad count |
| `subjects` | distinct-subject count |
| `predicates()` | `[{predicate, count}, …]` |
| `classes()` / `types()` | `[{type, count}, …]` distinct rdf:type objects |
| `recent(n)` | last n inflated quads in insertion order (bounded ring buffer, default 1024) |
| `toRdfJs()` | W3C RDF/JS spec-compliant DatasetCore view — **native, zero deps** |
| `bind(urn, fn, opts?)` / `bindOnce` | URN-pattern dispatch for sealed events / actions |
| `invoke(urn, payload, opts?)` / `ask(urn, params, opts?)` | trace-correlated request/reply over `ck.send()` |
| `view(iri)` | reactive `CKView` materializer (microtask-batched `change` events) |
| `on('insert'/'remove'/'remap', fn)` | low-level diagnostic events |

### Default ingest semantics — **replace-by-subject** (per pgCK-RESPONSE §3 Q3)
Re-seals (same `@id` arriving with a new body) now `removeBySubject(@id)` then re-insert, so stale quads don't accrete across updates. Opt out via `{ replaceBySubject: false }` for append-only / event-sourced consumers.

### Object handling — predicate-tail whitelist for refs (per pgCK-RESPONSE §2 Q2)
Bare strings at these predicate tails always resolve to NamedNode refs:
- `target_kernel` (e.g. `"pgCK"`)
- `part_of_goal` (e.g. `"backlog:pgCK"`)
- `created_by` (e.g. `"urn:ckp:participant:peter"`)

All other strings → literals. The IRI-shape heuristic (`https?://`, `urn:`, `ckp:`, `did:`, `tag:`) is NOT trusted for pgCK's bare-string values — only this whitelist forces NamedNode resolution. Plus the explicit `{"@id": "…"}` shape continues to be a NamedNode ref everywhere.

### Zero runtime dependencies (the through-line)
`toRdfJs()` imports the W3C-spec DataFactory from sibling `ck-rdf-bridge.js` (also dependency-free, hand-rolled). The returned DatasetCore is a small native implementation (~30 lines, set-based identity dedup, full match/add/delete/has/iterator surface). **No `@rdfjs/*` packages, no `esm.sh`, no `import()` of any URL — in the RDF/store layer** (`ck-rdf-bridge.js`, `ck-hex-store.js`). Those modules have an offline / air-gapped / attested-bundle posture.

> **Correction (2026-06-06):** an earlier wording read *"No esm.sh anywhere … as the rest of the stack,"* which is **not accurate for the transport**: `ck-client.js` still runtime-loads `nats.ws@1.30.3` + `@msgpack/msgpack@3.0.0` from esm.sh (lines 43–44). The zero-dependency / air-gapped posture is true for the RDF/store layer only. Vendoring the transport to close the gap is tracked for v1.10. Canonical current-state: [`SPEC.CK-LIB-JS.v1.4.0.md` §2.4](./SPEC.CK-LIB-JS.v1.4.0.md).

### Package
- `"./hex-store": "./ck-hex-store.js"` added to `package.json` exports.
- Dockerfile's existing `COPY ck-*.js index.html /` picks up `ck-hex-store.js` automatically. Bundle size impact: ~5 KB added (the file is 935 LOC, mostly comments and the 6-index plumbing).

### Coordination
Implements the v1.4 commitment from:
- `_WIP/NOTIFIES.pgCK.v1.4.0.ckhexstore-decision-locked-roadmap.md` + its RESPONSE
- `_WIP/NOTIFIES.pgCK.v1.4.0.ckhexstore-spec-v0.1-for-review.md` + its RESPONSE (APPROVED + 6 answers locked + esm.sh blocker eliminated)
- `_WIP/ck-hex-store/SPEC.HEXSTORE.TESTING-WITHOUT-NATS-AND-PGCK.v3.8.1.md` T2 (esm.sh-removal closes the offline-testability gap; smoke can now exercise `toRdfJs()` end-to-end)

### Not in scope for v1.4 (deferred)
- Real-pgCK corpus capture (testing spec T1) — needs live pgCK or pgCK-side CI publish (T4 ask in NOTIFY)
- `event.kernel.pgCK.snapshot` bulk-replay verb (pgCK side, non-blocking)
- pgCK `Dictionary.snapshot` publish (pgCK v0.2 line; CKHexStore self-allocates local handles until then)

---

## [1.3.14] — 2026-06-05

### Changed — `ck-rdf-bridge.js` re-cut with native DataFactory (zero runtime deps)
Per pgCK NOTIFY thread `v1.3.11.rdfjs-typed-message-store` RESPONSE-RESPONSE (4 Jun): **drop ALL external RDF libraries, including lazy-loaded `@rdfjs/data-model` from esm.sh.** A runtime CDN dependency breaks the offline / air-gapped / attested-bundle posture.

- `ck-rdf-bridge.js` now ships a hand-rolled, W3C-spec-compliant DataFactory (~60 lines: `NamedNode` / `BlankNode` / `Literal` / `Variable` / `DefaultGraph` / `Quad`). Zero `import()` calls. No esm.sh. No `@rdfjs/*` packages.
- `dataFactory` is now exported alongside `toQuads` for consumers who want spec-compliant RDF/JS terms without an external library.
- `toQuads()` is now **synchronous** (the previous async signature was only needed for the async esm.sh import). Backward compatibility: `await toQuads(msg)` still works since the value is just a synchronous return.

### Added — `@id`-absent defensive fallback in `_deriveEnvelope`
Per pgCK NOTIFY thread §2: when `data['@id']` is absent, derive `subjectIri` from `conceptType` + the type's id predicate (e.g. for `Task` type, look for body key ending in `task_id`). **Never pick `urn:ckp:participant:*` values** as the subject — those identify the actor of the action, not the affected resource. Safe complement to pgCK's `ckp.seal` projection that stamps `@id` for sealed events.

### Fixed — broken `SPEC.CK.LIB.JS.PUBLIC.v1.0.md` link in LATEST.md template
`SPEC.CK.LIB.JS.PUBLIC.v1.0.md` moved to gitignored `_WIP/` today (along with all other SPEC drafts). LATEST.md template in `oci-publish.yml` updated to drop the now-broken link.

### Coordination
Closes pgCK's RESPONSE-RESPONSE corrections. Next: v1.4 CKHexStore promotion from `_WIP/ck-hex-store/` skeleton to root, using the same native DataFactory.

---

## [1.3.13] — 2026-06-04

### Added — `ck-rdf-bridge.js` (optional RDF/JS Quad bridge)
New file `ck-rdf-bridge.js` exposes:

- **Static** `toQuads(msg, opts)` — convert a CKClient envelope into an array of rdf.js Quads. Lazy-loads `@rdfjs/data-model@2.1.0` from `esm.sh` on first call (same CDN-import pattern as `nats.ws` and `@msgpack/msgpack`).
- **Instance** `ck.toQuads(msg, opts)` — added to `CKClient.prototype` when the bridge file is imported. Closes over `this.iriForHandle()` so binary-delta wire path auto-resolves dictionary handles.

Handles both envelope shapes:

| Shape | Body looks like | Behavior |
|---|---|---|
| JSON-LD body (v1.2 / v1.3 JSON path) | `{ "@id": "…", "type": "…", "<predIri>": <value>, … }` | One quad per non-control property + rdf:type quads from `msg.conceptType` (v1.3.12) |
| Binary delta (v1.3 binary path) | `{ e, p, o, g?, seq? }` | Single quad; `e`/`p`/`o`/`g` either inline IRI strings or uint32 handles inflated via dictionary |

Literal typing: strings → `xsd:string` (or `namedNode` if they look IRI-shaped per `https?://`, `urn:`, `ckp:`, `did:`, `tag:` heuristic); integers → `xsd:integer`; non-integers → `xsd:decimal`; booleans → `xsd:boolean`. Object refs detected via `{"@id":"…"}` shape → `namedNode`.

### Compatibility
- **Zero bundle cost when not imported.** Consumers who do not `import './ck-rdf-bridge.js'` pay nothing — neither the bridge code (~3.5 KB raw) nor the lazy `@rdfjs/data-model` CDN load.
- **No CKClient changes.** Bridge is purely additive on `CKClient.prototype` and pulls only from the v1.3.12 typed-envelope fields + dictionary API already shipped in v1.3.x.
- **No new wire/contract behavior.** This is a converter, not a protocol change.

### Package entry
New export added: `import { toQuads } from '@conceptkernel/cklib/rdf-bridge'` (npm staging) or `import { toQuads } from '/cklib/ck-rdf-bridge.js'` (OCI bundle).

### Coordination
Closes the v1.3.13 commitment from `_WIP/NOTIFIES.pgCK.v1.4.0.ckhexstore-decision-locked-roadmap.md`. The `toQuads()` bridge stays even though pgCK locked CKHexStore as the in-client store flavor (the bridge serves per-message conversion / export needs orthogonal to the store choice). If pgCK confirms the bridge is redundant given upcoming `CKHexStore.toRdfJs()`, it can be deprecated in v1.4+ — no removal in v1.3.x line.

### Next
- v1.4: `ck-hex-store.js` (CKHexStore — 6-way hex index over uint32 dictionary handles, no library dep, ~5 KB inline). Will be preceded by `SPEC.CK.LIB.JS.HEXSTORE.v0.1.md` for pgCK review.

---

## [1.3.12] — 2026-06-04

### Added — Typed envelope on delivered messages (additive)
Per pgCK NOTIFY thread `v1.3.11.rdfjs-typed-message-store` (RESPONSE adjacent in pgCK `_WIP/`), the `event` / `result` / `broadcast` / `error` channels now deliver five additional fields alongside the existing `{ subject, headers, data, traceId }`:

| Field | Derivation | Use |
|---|---|---|
| `msg.kind` | the channel name (`event` / `result` / `broadcast` / `error`) | what kind of message this is, without re-deriving from subject grammar |
| `msg.subjectIri` | `data['@id']` when present; else `null` | the IRI/URN of the sealed instance — populated for events from pgCK seal projection (their commit `7e94893` stamps `@id = ckp://<Type>#<id>`) |
| `msg.conceptType` | `data['@type'] ?? data['type']` | the SHACL/concept type (string or array of strings) |
| `msg.kernel` | parsed from NATS subject: long-form `<kind>.kernel.<K>.<verb>` (strips trailing `.action` for input/result) or short-form `<kind>.<K>` fallback | the kernel name (e.g. `pgCK.Task`) without splitting on `.` ambiguity |
| `msg.verb` | last segment in long-form (e.g. `sealed`, `created`); `null` in short-form / broadcast | the event/action verb |

### Compatibility
- **No breaking changes.** All v1.3.x consumers that read only `subject` / `headers` / `data` / `traceId` continue to work unchanged.
- New fields are derived once at delivery time from the NATS subject + decoded body. The body remains the source of truth — these fields are caches/projections.
- For pre-`@id`-stamped bodies (non-sealed paths, transient errors, legacy events), `subjectIri` is `null`. Consumers fall back to body inspection if needed.

### Coordination
Locks the v1.3.12 commitment from `_WIP/NOTIFIES.pgCK.v1.4.0.ckhexstore-decision-locked-roadmap.md`. pgCK web2's placeholder `rdfjs/engine.js` can pivot on `msg.subjectIri` and `msg.conceptType` directly; no need to re-grep subject grammar. Next: v1.3.13 ships `ck-rdf-bridge.js` (the `toQuads()` per-message bridge), v1.4 ships `ck-hex-store.js` (CKHexStore — the locked in-client store flavor).

---

## [1.3.11] — 2026-05-29

### Changed
- Aligned to [`SPEC.OCI.BUNDLE.v0.3`](https://github.com/sporaxis-com/oci-germination/blob/main/SPEC.OCI.BUNDLE.v0.3.md) — supersedes v0.2 as the authoritative packaging protocol for the fleet. CK.Lib.Js is recognized under v0.3 as a **Shape A (filesystem-layer OCI image)** artifact (§1.1) — already the shape we shipped from `FROM scratch` since v1.2.0, no Dockerfile restructure required.
- `Dockerfile` adds `LABEL org.opencontainers.image.licenses=MIT` per v0.3 §2.1 (Recommended manifest labels for Shape A).
- `.github/workflows/oci-publish.yml` build step now injects `org.opencontainers.image.revision` (git SHA), `org.opencontainers.image.created` (commit timestamp), and `org.opencontainers.image.licenses` labels per v0.3 §2.1 Required + Recommended set.
- `LATEST.md` render template (in `oci-publish.yml`) updated: spec link points to `SPEC.OCI.BUNDLE.v0.3.md`; bundle.yaml example bumped to `spec_version: 0.3` and now shows BOTH the v0.2-compatible `static_web[]` form AND the new v0.3 `layer_sources[]` form, each with the required `attestation_repo: ConceptKernel/CK.Lib.Js` field per v0.3 §3.2 / §3.4; an explicit reference to the v0.3 §4 build-time `gh attestation verify` gate added.
- `COMPLIANCE.md` reference updated from `SPEC.OCI.BUNDLE.v0.1.md` to `SPEC.OCI.BUNDLE.v0.3.md` with explicit Shape A designation note.

### Compatibility
- No wire-format change. The pulled image is byte-for-byte identical in shape and content to v1.3.10 (apart from the added OCI labels and the version string). Existing `static_web:` declarations in downstream `bundle.yaml` files continue to render correctly under v0.3 generators (§10 backwards compatibility).
- Downstream consumers (`oci-germination`'s `bundle-ck-allinone`, `bundle-pg17-pgrdf-pgck-web-cklib`, `bundle-pg17-pgrdf-pgck-static-cklib`) MAY bump their `spec_version: 0.2` → `0.3` and add `attestation_repo: ConceptKernel/CK.Lib.Js` to the CK.Lib.Js entry to opt into v0.3's pre-build attestation gate. Bumping is non-blocking.

---

## [1.3.10] — 2026-05-28

### Changed
- `LATEST.md` template (rendered by `oci-publish.yml`) rewritten to match pgRDF's `LATEST.md` structure: introduces per-arch table with Created (UTC) column, consolidated properties table (artifact type / aggregate index / aggregate digest / provenance / verify CLI / release notes / repo packages view), "Verifying any artifact above" section with both multi-arch and per-arch leaf verify commands + explanation of what successful verify means, "Pin policy" section.
- No code or runtime change.

---

## [1.3.9] — 2026-05-28

### Pipeline iteration #9 — collapsed pipeline (one workflow, end-to-end)
- v1.3.8 confirmed GHA build + push + SLSA attestation works; `gh attestation verify` accepts the v1.3.8 digest. However the chained `workflow_run` event from `oci-publish` → `update-latest-md` was blackholed (no run created), so LATEST.md was not auto-updated.
- v1.3.9 collapses everything into a single workflow `oci-publish.yml`: build → push → attest → `gh attestation verify` (Rule 2 gate) → render LATEST.md → `gh release create` → commit LATEST.md to main. No chained workflow event needed.
- `update-latest-md.yml` deleted.
- `PROVENANCE.md` Rule 3 amended to permit any workflow that gates on attestation in the same job (instead of naming a specific separate workflow). Single-workflow setup is the canonical path for this repo.

---

## [1.3.8] — 2026-05-28

### Adopted PROVENANCE.md release policy
- New file `PROVENANCE.md` adapted from pgCK's pattern: 5 hard rules (GHA-only builds, LATEST.md attestation gate, workflow-only LATEST.md writes, previous-tag-in-LATEST gate, release-often discipline) + bootstrap table + enforcement matrix + verify recipe.
- `LATEST.md` rewritten to state "no attested release yet" per Rule 2; will be auto-populated by `update-latest-md.yml` after the first attested release.

### Pipeline wiring
- `oci-publish.yml` adds `actions/attest-build-provenance@v1` step → issues SLSA Build Provenance v1 attestation, signed by GitHub's Fulcio CA, recorded in Sigstore Rekor, pushed as OCI referrer. Requires new permissions: `id-token: write`, `attestations: write`.
- New workflow `update-latest-md.yml` — the only allowed writer of `LATEST.md` per PROVENANCE Rule 3. Triggered by `workflow_run` of `oci-publish` on success. Verifies attestation via `gh attestation verify`; if accepted, renders and commits `LATEST.md` with version + per-arch digests + run URL + verify command.

### Pipeline iteration #8
- v1.3.4 → v1.3.7 attempts: tag-push events silently dropped (no GHA runs created) whenever the workflow included an in-pipeline `gh release create` step. v1.3.8 removes the release-create step (will be added via a separate workflow later if Rule 3 needs it) and adds the attestation step which is the higher-priority provenance contract.
- Expected outcome: tag v1.3.8 push → `oci-publish` runs → builds + pushes + attests → `update-latest-md` fires on completion → verifies + writes LATEST.md.

---

## [1.3.7] — 2026-05-28

### Pipeline iteration #7
- v1.3.6 used `publish.yml` — but GitHub recycled the OLD workflow_id `256288279` (from the original Apr 4 publish.yml). Recycled-id may carry stale routing state. Tag-push event still silently dropped.
- v1.3.7: workflow renamed to `oci-publish.yml` — a filename that has NEVER existed in this repo's history. Expected to receive a brand-new workflow_id from GitHub and a fresh event-routing registration.

---

## [1.3.6] — 2026-05-28

### Pipeline iteration #6
- v1.3.5 (no workflow edit) also didn't trigger — busts the "edit-breaks-routing" hypothesis.
- v1.3.6: rename workflow `release-pipeline.yml` → `publish.yml` (fresh filename = new workflow_id = fresh GitHub registration) AND remove the `concurrency:` block (possible source of event dedupe). Workflow content otherwise unchanged from v1.3.4 (build+push+in-pipeline-release-create).

---

## [1.3.5] — 2026-05-28

### Pipeline iteration #5
- v1.3.4 attempt: workflow file edit (added in-pipeline `gh release create` step) appears to have broken the tag-event routing — tag push to `v1.3.4` did not generate any GHA run (only branch-push from main commit, filtered).
- Hypothesis: GitHub's workflow registration goes into a temporarily-broken state immediately after a workflow file edit. v1.3.3 worked because the workflow had just been created in a fresh state; v1.3.4 broke because the edit triggered re-parsing.
- v1.3.5 tests the hypothesis: **no workflow file change**. Only version files bumped. If the v1.3.5 tag triggers the workflow (which still has the in-pipeline release-create step from v1.3.4), the hypothesis is confirmed AND the release-create step gets exercised.

---

## [1.3.4] — 2026-05-28

### Pipeline iteration #4
- v1.3.3 confirmed end-to-end GHA build+push works (run #26591475079, 24s, success). However the v1.3.3 GitHub Release object was created manually via `gh release create` from local CLI — a violation of the rule that ALL release operations happen inside GHA.
- v1.3.4 adds a `gh release create` step to `release-pipeline.yml` so the Release object is created by the workflow itself with a clean bare-tag title (`v1.3.4`, no decorations) and notes that include the run URL, commit SHA, and index digest as built-in provenance.
- The v1.3.3 release was deleted; the v1.3.3 tag and image remain on GHCR as the historical record of the first GHA-built image.

---

## [1.3.3] — 2026-05-28

### Pipeline iteration #3
- v1.3.2 attempt #2 progress: workflow file `release-pipeline.yml` correctly registered, tag-event routed (19s run on `v1.3.2`), multi-platform build succeeded. **But** the push step failed with `denied: permission_denied: write_package` — the GHCR package `ck-lib-js` had no Actions-access grant for the workflow.
- **Fix between v1.3.2 and v1.3.3:** maintainer added `CK.Lib.Js` repo with `Write` role under https://github.com/orgs/ConceptKernel/packages/container/ck-lib-js/settings → "Manage Actions access".
- v1.3.3 retests the full pipeline with the same workflow that built successfully in v1.3.2. Expected: GHA pushes `ck-lib-js:1.3.3` + `:latest` to GHCR with attached build provenance attestation, satisfying the LATEST.md GitHub-provenance requirement.

---

## [1.3.2] — 2026-05-28

### Pipeline iteration #2
- v1.3.1 attempt #1 failed: `release: published` event also blackholed (only branch-push events fire workflows in this repo).
- v1.3.2 attempt #2: fresh workflow filename `release-pipeline.yml` (deletes `gha-build-and-push.yml`), single trigger `push: tags: ["v*"]`, `concurrency: group: release-${{ github.ref }}` to break any potential stuck lock, no `if:` guard, minimal job surface.
- No source-code change.

---

## [1.3.1] — 2026-05-28

### Changed
- **Pipeline-only bump** — no source-code change. v1.3.1 exists solely to iterate the GitHub Actions release pipeline (the v1.3.0 tag did not pair with a GHA-built artifact due to a tag-push event routing issue; v1.3.1 attempts the `release: published` event as a different trigger bus).

### Pipeline iteration #1
- Workflow `.github/workflows/gha-build-and-push.yml` now responds to three event types:
  - `release: types: [published]` (primary — different event bus, may bypass cached routing)
  - `push: tags: ["v*"]` (kept as fallback)
  - `workflow_dispatch` (kept for manual)
- `Resolve version` step handles all three event sources.
- `Create GitHub Release` step suppressed when triggered by `release: published` (release already exists in that path).

---

## [1.3.0] — 2026-05-28

### Added — Long-Form Subject Support (v3.8 Canonical)
- **Dual-subscribe** on `result.<K>` (short) AND `result.kernel.<K>.action.>` (long, v3.8 canonical)
- **Dual-subscribe** on `event.<K>` (short) AND `event.kernel.<K>.>` (long)
- **Dual-publish** on `input.<K>` (short) AND `input.kernel.<K>.action.<verb>` (long, when `data.action` is present)
- Short-form subjects marked **deprecated**; will be removed in v2.0

### Added — Display / Broadcast / Observer Roles
- **`subscribe:` constructor option** — opt out of `result` channel for broadcast-only roles (e.g. `subscribe: ['event']`). Default `['event','result']` preserves v1.2 behavior.
- **`extraSubjects:` constructor option** — subscribe to non-kernel-derived subjects (e.g. `broadcast.<project>.<channel>`, `event.CK.Compliance.violation`). Emits via `ck.on('broadcast', ...)`.
- **`topicDefs:` constructor option** — advanced callers can override the kernel-derived topic list entirely.

### Added — Binary Wire Profile (Codec-Transparent)
- **MessagePack codec support** for `event.kernel.*` and `stream.kernel.*` messages
- Codec selection via `Content-Encoding: msgpack` header (JSON when absent)
- `ck.on('event', handler)` signature unchanged across codec swap; `msg.data` always exposes decoded payload
- MessagePack loaded from `https://esm.sh/@msgpack/msgpack@3.0.0` (same CDN pattern as nats.ws)

### Added — Per-Subject Deduplication
- Reads `Ck-Seq` header on incoming messages, dedups against per-subject `Set<seq>`
- Cap of 1000 entries per subject; LRU-style eviction at threshold
- Graceful degrade: if `Ck-Seq` header is absent, no dedup (v1.2-compatible behavior)
- `seq` source is publisher-assigned (per pgCK §C lock: `ckp.ledger.id`); browser doesn't generate

### Added — IRI Dictionary (Per-Project) Auto-Sync
- Auto-subscribes to `event.kernel.Dictionary.v_bumped` + `.snapshot` when `kernel:` is set
- Maintains internal `handles` ↔ `reverse` map (int → IRI both directions)
- `dictVersion: <N>` constructor option (default 0); embedded in NATS CONNECT `name` field for server-side snapshot delivery
- New public API: `ck.handleForIri(iri)` / `ck.iriForHandle(handle)` / `ck.dictVersion`
- Dictionary messages do NOT emit on `'event'` channel — internal infrastructure

### Added — Per-Kernel Error Broadcast
- Auto-subscribes to `event.kernel.<K>.error` when `kernel:` is set
- Emits via `ck.on('error', handler)` (existing channel; new traffic source)

### Changed — Reconnect on Auth Upgrade
- `ck.login(user, pass)` now closes NATS and reconnects with JWT in CONNECT options (was: in-place token update)
- `ck.logout()` reconnects as anonymous (drops authenticated permissions cleanly)
- Token refresh (`_maybeRefreshToken`) also reconnects to refresh server-side permission ACLs
- Locked per pgCK §G.3 + §15 (consistent reconnect strategy across all auth state changes)

### Changed — Default `clientId`
- Default client_id changed from `ck-web` to `ck-browser` (per pgCK §11 confirmation)
- Override via `clientId:` constructor option (e.g., per-tenant in marketplace SKU)

### Changed — README Subject Family Table
- Long-form subjects now documented as canonical
- Short-form aliases explicitly marked deprecated with v2.0 removal target
- Added v1.3 additions: `event.kernel.<K>.error`, `event.kernel.Dictionary.*`, `event.CK.Compliance.violation`

### Compatibility
- **No breaking changes from v1.2.x.** All existing CKClient code continues to work.
- v1.2.x callers that subscribed only to short-form subjects continue to receive events.
- Dictionary + binary paths activate transparently when pgCK starts publishing the relevant messages (pgCK v0.2 dependency).

### Coordination
- v1.3.0 design surface fully locked via three-turn NOTIFY exchange with pgCK (see internal `_WIP/NOTIFIES.pgCK.v1.3.0.transport-binary-identity-alignment*` files).
- Per pgCK §F: requires pgCK v0.2 for `ckp.dictionary` table + `ckp.ledger.id` → wire-seq plumbing. CKClient v1.3.0 ships with graceful JSON fallback when those server-side pieces aren't yet shipped.

---

## [1.2.1] — 2026-05-28

### Fixed
- **OCI Bundle Layout** — Files now land at image root (`/ck-client.js`, `/index.html`, `/vendor/`) instead of nested under `/ck-lib-js/`. Consumers using the spec-standard `COPY --from=cklib_source / dest/` pattern get the expected layout without manual path adjustments. Resolves runtime 404s in oci-germination composites (`bundle-ck-allinone`, `bundle-pg17-pgrdf-pgck-web-cklib`) where `/cklib/ck-client.js` was resolving to a missing path.

### Removed
- **Dead-Weight `node_modules/`** — `npm install --production` step removed from Dockerfile. The published bundle no longer ships `node_modules/{nats.ws,nkeys.js,tweetnacl}/`. `ck-client.js:31` loads `nats.ws` from `https://esm.sh/nats.ws@1.30.3` at runtime; bundling these modules was unused weight.
- **`package.json` / `package-lock.json`** — No longer copied into the OCI bundle. They remain in the source repo for npm package metadata, but are not part of the static artifact.
- **`builder` stage** — Dockerfile is now a single `FROM scratch` with direct `COPY` of source files. No multi-stage build needed.

### Changed
- **Bundle Size** — Reduced from 2.07 MB to ~80 KB (96% smaller).

### Migration Note for Consumers
If you were using the v1.2.0 workaround `COPY --from=cklib_source /ck-lib-js/ dest/`, switch back to the spec-standard root copy:
```diff
- COPY --from=cklib_source /ck-lib-js/ /app/cklib/
+ COPY --from=cklib_source / /app/cklib/
```
Pin `bundle.yaml` `source_image:` to `ghcr.io/conceptkernel/ck-lib-js:1.2.1`.

---

## [1.2.0] — 2026-05-26

### Added
- **OCI Bundle Release** — Static artifact published to GHCR (`ghcr.io/conceptkernel/ck-lib-js:1.2.0`)
- **Multi-Platform Support** — Images built for linux/amd64 and linux/arm64
- **GitHub Actions Automation** — Workflow-dispatch-based release pipeline via `workflow_dispatch` inputs
- **Sporaxis Compliance** — Bundle adheres to SPEC.OCI.BUNDLE.v0.1; static-only (ckp:static designation)

### Changed
- **Removed Dev Target** — Eliminated 145MB http-server variant; bundle is now 2.07MB static artifact only
- **Simplified Dockerfile** — Single `FROM scratch` target for folder mounting (no Node runtime in bundle)

### Fixed
- **Multi-Platform Manifest** — Corrected per-architecture digest handling (amd64 and arm64 now properly differentiated)
- **Public Access** — Bundle is anonymous-accessible via GHCR (no authentication required for pulls)

### Technical Details
- **Bundle Size:** 2.07MB (JS source + nats.ws deps)
- **Artifact Type:** ckp:static (mount-friendly filesystem layer)
- **Transport:** NATS WSS v2.14+ (input.kernel.* → result.kernel.* affordance pattern)
- **Compliance:** CKP v3.8 Core JSON profile (v1.1.0); binary optimization deferred to v1.3.0

---

## [1.1.0] — 2026-05-20

### Initial Release
- Core JSON message profile for NATS WSS browser client
- Affordance request/reply pattern (input.kernel.* → result.kernel.*)
- Event subscription (event.kernel.*, stream.kernel.*)
- nats.ws v1.30.3 as sole dependency

---

## Versioning Roadmap

| Version | Focus | Status |
|---------|-------|--------|
| **1.1.0** | Core JSON profile | ✓ Released |
| **1.2.0** | OCI bundle + GHCR publishing | ✓ Released |
| **1.2.1** | OCI layout fix + bundle slim-down | ✓ Released |
| **1.3.0** | Binary codec + dedup + display roles + long-form subjects | ✓ Released |
| **1.4.0** | Keycloak / JWT identity plumbing (per-tenant realm) | ⧗ Planned |
| **2.0.0** | TypeScript definitions + remove short-form subjects (no REST API, ever) | ⧗ Planned |

---

**Repository:** https://github.com/ConceptKernel/CK.Lib.Js  
**Package:** https://ghcr.io/conceptkernel/ck-lib-js  
**License:** MIT
