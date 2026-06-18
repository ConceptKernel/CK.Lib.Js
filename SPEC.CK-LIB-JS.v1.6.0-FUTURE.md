> **FUTURE — post-v1.5.1.** This document governs the planned v1.6.0 "Typed Edge" release.
> Current shipped version: **v1.5.0**. Next release in progress: **v1.5.1** (`SPEC.ROADMAP.v1.5.1.CHECKLIST.md`).
> Nothing in this document is shipped or authoritative until v1.6.0 tags and attests.

# SPEC.CK-LIB-JS.v1.6.0-FUTURE — CK.Lib.Js Planned Specification (post-v1.5.1)

**Status:** **AUTHORITATIVE — the CK.Lib.Js-owned governing design contract for v1.6.0.**
This document governs the v1.6.0 build and its implementation plan
(`SPEC.ROADMAP.v1.6.0.CHECKLIST.md`): the dispatch-only surface — now with its typed forms **kernel-derived**
— an implementation MUST present, and the contract against which alignment with pgCK is verified. v1.6.0
**"Typed Edge"** is the client-edge twin of **pgCK `v0.5.0`** (the `SPEC.pgCK.ROADMAP.v0.5.0` track set,
which completes CKP v3.9 by replacing each server-side concretion with the kernel's *declared* shape). The
prior epoch **v1.5.0 "Edge Isolation"** (the dispatch-only collapse; twin of pgCK Tier 2 / CKP v3.9 Critical
Isolation) is **SHIPPED + adopted** — `instance.*` is the live tracked surface. **Release discipline is
unchanged:** the 1.6.0 *release tag* pairs with a built + attested `ghcr.io/conceptkernel/ck-lib-js:1.6.0`
image whose digest verifies (§2); the **tag** follows the artifact. No 1.6.0 tag may be cut before the image
ships.

**Visibility:** **PUBLIC client documentation — tracked in `ConceptKernel/CK.Lib.Js`**, alongside
`SPEC.CK-LIB-JS.v1.4.0`/`v1.4.2` (the public-reopening posture — `_WIP/SPEC.CK.LIB.JS.PUBLIC.v1.0`).
This is safe because **the distributed artifact never carries a spec**: the npm tarball
(`package.json` `files`: `ck.js`, `ck-client.js`, `ck-store.js`, `vendor/`, `README`, `LICENSE`,
`CHANGELOG`) and the OCI image (`Dockerfile` copies only the three `ck-*.js` modules, `vendor/`,
`README`, `LICENSE`) ship
**code only** — no SPEC/ROADMAP file is ever published into the installed product. Unlike pgCK (whose
specs encode engine-internal topology and stay private), CK.Lib.Js specs are consumer documentation.
**pgCK's grounding docs remain pgCK-private** — the v3.9 spec, the Critical-Isolation roadmap, and the
v3.9 checklist live in pgCK (gitignored); CK.Lib.Js references them via local `_WIP/ref-*` symlinks and
never reproduces pgCK-internal detail. *One cross-repo gate:* pgCK holds the v3.9 contract "public only
when ratified" (its roadmap §15), so the public **commit/push** of this spec is coordinated with pgCK
via NOTIFY first.

**Date:** 2026-06-15
**Revision:** v1.6.0 opened over the shipped v1.5.0 surface; aligned to pgCK v0.4.13 (T1–T6 all attested). Pre-ship corrections 2026-06-15: `notify` signature extended with `target` (§4.2); `k.match(term)` handle sugar added (TE-4); `affordances()` dispatch verb corrected (`affordances`, not `kernel.affordances`); §11 TE status updated to reflect built-ahead state. Code authoritative where it disagrees with prose.
**Supersedes (on ship):** SPEC.CK-LIB-JS.v1.5.0 (the shipped dispatch-only precursor) — kept for history.
**Grounded in:** **CKP v3.9 — Critical Isolation** (`SPEC.CKP.v3.9.md`, pgCK root; private) + the
**`SPEC.pgCK.ROADMAP.v0.5.0`** track set (T1…T10 — the kernel-derived forms, `v0.4.8 → v0.5.0`) +
**pgCK `ontology/*.ttl`** — the **authoritative declared shapes** (the source of the typed forms this
client mirrors: QueryShape keys, declared predicates, transition maps, validation shapes; authoritative
until the sporaxis concept directory distributes them). v1.6.0 is the reference JS client of v3.9's closed
dispatch contract, *with its typed surface bound to the kernel's declared shape*.
**Audience:** CK.Lib.Js consumers (concept-kernel page/app authors, bundle integrators, LLM-agent
harness authors), pgCK runtime authors, oci-germination spec maintainers
**Conformance language:** MUST / SHOULD / MAY per RFC 2119

This document describes **what v1.6.0 MUST BE and how it MUST be used**. Its centerpiece is the same
**unified concept-kernel surface** as v1.4.2 — one import, `activate` a kernel, operate on it —
**but the machinery underneath collapses to two things and only two: authentication and
`ckp.dispatch`.** The client carries **no query engine, no RDF, no quads, no SPARQL, no pgRDF, no
graph mirror**. It addresses **URNs and typed instances**, never triples, graphs, or storage layout.

> **Versioning discipline (carried from v1.4.0 §11 / v1.4.2 §0).** A spec *follows* the artifact and
> never leads it. This document is **authoritative as the governing design contract** for the v1.6.0
> build, but it confers **no release authority**: the built + attested 1.6.0 image is the only thing
> that makes a 1.6.0 *tag* real (§2), and v1.5.0 moves to history when that image ships. A consumer
> relies on the shipped, attested artifact — never on this document ahead of it.

---

## 0. The dispatch-only floor — established in v1.5.0, carried unchanged into v1.6.0

v1.4.2 made the transport (`CKClient`, L0) and the graph mirror (`CKHexStore`, L1) **internal**
layers under the L2 concept-kernel surface (`ck.js`). The *operations* were already URN-native; the
*machinery* was a NATS WSS client plus a **URN-native, 6-way hex-indexed RDF graph mirror** with a
zero-dependency **RDF/JS bridge** (`ck-rdf-bridge.js` → `toQuads`, `makeNativeDatasetCore`).

v1.5.0 aligns the client to **CKP v3.9 Critical Isolation** (`SPEC.CKP.v3.9.md`). v3.9 draws three
rings server-side — Ring 0 the pgRDF engine, Ring 1 a frozen set of pgCK primitives, Ring 2 the
affordances — and proves that **a query surface is incompatible with the contract** (§0.1 there: it
is an unenumerable capability, an injection surface, and — because pgRDF ships SPARQL UPDATE — an
unsealed write path that voids the proof chain). The only thing crossing into pgCK is the four-tuple
**⟨verb, kernel-URN, typed payload, verified identity⟩** through `ckp.dispatch`.

**v1.5.0 extends that discipline to the client edge.** The graph mirror is **reduced strictly to
auth + pgCK dispatch**:

| Layer | v1.4.2 | v1.5.0 |
|---|---|---|
| **L2 — concept-kernel surface** (`ck.js`: `CK`, `ConceptKernel`) | the only documented app API | **unchanged surface**; every op now resolves to a `ckp.dispatch` verb |
| **L1 — local state** | `CKHexStore`: RDF graph mirror, 6-way hex index, quad reads | **`CKStore`: a typed-instance cache** — a Map of `@id`/URN → typed JSONB instance, fed only by dispatch replies + granted-scope events. **Not an RDF store.** |
| **L0 — transport** | `CKClient`: per-verb NATS subject grammar | **`CKClient`: a dispatch transport** — one `dispatch()` request/reply primitive (per-verb v3.8 wire **by default**; the four-tuple `ckp.dispatch` ingress is opt-in until the deferred CE-B-2 flip — see Wire status below) |
| **RDF bridge** (`ck-rdf-bridge.js`, `toQuads`, `dataFactory`, `makeNativeDatasetCore`) | internal | **REMOVED** — no RDF/JS on the client at all |
| Legacy render/page surface | internal / extraction candidate | **retired to `_WIP/deprecated/`** at the v1.4.2 strip — not in the shipped tree (extraction to CK.Lib.Xr stays the forward home; §11) |

**Wire status (promoted code, reconciled 2026-06-11):** the dispatch transport ships with the **v3.8
per-verb wire as its default** — `dispatchMode:'v3.8'`, each verb emitted on its per-verb subject and
the reply correlated by `Trace-Id`. The four-tuple `ckp.dispatch` ingress is implemented but **opt-in**
(`dispatchMode:'v3.9'`); flipping the default is the separate, deferred CE-B-2 step.

**The headline change in one line:** *there is no RDF, no quad store, and no pgRDF on the client —
the client authenticates and dispatches typed payloads; nothing else crosses.*

### 0.1 Why the client carries no RDF / no pgRDF (the security argument)

This is load-bearing, and it is the client-edge restatement of v3.9 §0.1. A client-side RDF graph
mirror with a quad bridge is a **latent query surface** — the exact liability v3.9 closes
server-side, re-introduced one tier out:

- **Coupling (v3.9 A4).** A client that holds quads, graph ids, or a DatasetCore addresses **storage
  layout**. VISION I11 forbids this above the URN; v3.9 forbids it below. A client that has seen the
  triple shape couples to it and breaks when pgRDF refactors graphs/partitions/dictionary handles.
  The client MUST address **URNs and typed instances only**.
- **Unenumerable capability (v3.9 A2).** Reads are affordance grants (v3.9 P9: *a read that cannot be
  enumerated cannot be granted, so it cannot exist*). A client-side query engine is an
  action-generator, not a finite action set — it cannot be granted, attested, or compiled into an
  ACL. Every read the client makes MUST be a **named, typed, grantable dispatch verb**
  (`instance.get`, `instance.query` with a closed-operator QueryShape, `instance.reach`,
  `instance.snapshot`), never a free-form local graph query.
- **Provenance & write integrity (v3.9 A1).** The proof chain only holds if every fact is sealed.
  Client-side RDF tooling that can mutate or synthesize quads is a write-shaped surface with no seal;
  keeping it off the client removes the temptation and the bypass entirely.
- **Injection / resource safety (v3.9 A3).** No query string, property path, or SPARQL fragment is
  ever constructed on the client. The only "query" is a **typed filter payload** (closed enum,
  validated by the kernel's SHACL shape server-side) — there is no expression position a caller, or a
  compromised client, can occupy.

> *"We will have no pgRDF on the client at all — it's a security nightmare."* The engine is Ring 0,
> server-only, reachable solely by pgCK's Ring-1 primitives under Postgres role isolation (v3.9 §7).
> The client never embeds it, proxies it, mirrors its graphs, or speaks its language.

---

## 1. Identity and scope

### 1.1 What CK.Lib.Js is (v1.6.0 framing)

CK.Lib.Js is a self-contained ESM JavaScript library for **operating concept kernels** from the
browser (and, forward, Node — §11). An application:

1. imports `CK` from `@conceptkernel/cklib`,
2. `await CK.activate('<kernel>')` to bring a concept kernel to life (authenticate + subscribe granted scope), and
3. calls operations on the returned **`ConceptKernel`** handle — each resolving to a `ckp.dispatch` verb.

Underneath, CK.Lib.Js provides — as **internal layers** — a **dispatch transport** (`CKClient`, L0)
that carries the four-tuple to pgCK's single ingress (via the default v3.8 per-verb shim until the
CE-B-2 flip — §1.3), and a **typed-instance cache** (`CKStore`, L1)
that holds the JSONB instances dispatch returns and granted events deliver. **It does not provide,
and MUST NOT provide, an RDF store, a quad index, a SPARQL engine, an RDF/JS bridge, or any pgRDF
surface.** Those were removed in v1.5.0.

It targets the **browser** as primary runtime. Node.js is forward work (§11); the L2 surface is
transport- and DOM-agnostic so a Node binding is additive.

### 1.2 Identifier

- npm name: `@conceptkernel/cklib` — staged in `package.json` at the target version; publication
  follows the artifact. Consumers MUST treat OCI as the authoritative distribution.
- OCI image (on ship): `ghcr.io/conceptkernel/ck-lib-js:1.6.0` (multi-arch index; aggregate digest
  recorded in `LATEST.md` when built). v1.5.0 is the shipped precursor.
- Designation: `org.opencontainers.image.designation=ckp:static`. License: MIT.

### 1.3 Versioning

Semantic versioning (`MAJOR.MINOR.PATCH`). **v1.6.0 is a MINOR release over v1.5.0** — additive: it keeps
the dispatch-only floor and binds the typed surface to the kernel's declared shape (adopt the uniform
typed `create`; consume derived QueryShape keys, declared predicates, sealed transition maps, the full
`ValidationReport`, the governed `concept.match`), dropping the transitional fallbacks as each pgCK v0.5
track lands. No §4 signature breaks (a break would bump MAJOR). The v1.5.0 transition it builds on, for
history — v1.5.0 was a **MINOR** over v1.4.2:

- It **gains the dispatch transport**: every L2 operation funnels through a single `dispatch()`
  request/reply primitive. On the wire it **emits the v3.8 per-verb subject grammar by default**
  (`dispatchMode:'v3.8'` shim); the `ckp.dispatch` four-tuple ingress (v3.9 §2) is implemented but
  opt-in (`dispatchMode:'v3.9'`) — flipping the default is the deferred CE-B-2 step. A wire-format
  change MUST bump MINOR (v1.4.2 §1.3).
- It **removes the client RDF surface** (`ck-rdf-bridge.js`, `toQuads`, `dataFactory`,
  `makeNativeDatasetCore`, the 6-way hex index, the `./internal/rdf-bridge` subpath, the
  `./rdf-bridge`/`./hex-store` RDF exports). These were **internal** at v1.4.2 (§3.2 there), so their
  removal does not break the documented **application** surface (§4) — it breaks only tooling that
  reached into internals, which v1.4.2 §3.2/§9 already declared non-conformant for app logic.
- The **L2 application surface (§4) is preserved**: `create/update/list/get/link/notify/validate`
  keep their signatures; new verbs (`transition`, `reach`, `query`, `verify`, `provenance`,
  `snapshot`, governance ops) are **additive**. Legacy verb names route via aliases for one minor
  (§8). A breaking change to the §4 surface would bump MAJOR; this is not one.

### 1.4 Out of scope / removed at v1.5.0 (MUST be assumed absent)

**Actively removed in v1.5.0 (not merely "pending"):**

- **Client-side RDF**: the quad store, the 6-way hex (SPO-permutation) index, `ck-rdf-bridge.js`,
  `toQuads`, `dataFactory`, `makeNativeDatasetCore`, and every RDF/JS-shaped export. Gone. The client
  holds typed instances keyed by `@id`/URN, not triples.
- **Any client-side query language or query engine.** No SPARQL, no local graph query, no pgRDF. The
  only "query" is a typed filter payload dispatched to `instance.query` (§4.5).
- **Direct addressing of graph ids, quads, table names, or NATS subjects** from any layer's public
  surface.

**Shipped in pgCK Tier 2 (v0.4.5–v0.4.7) — the client adopts these in v1.6.0:**

- **Generic typed `instance.create`** — the uniform `{type,…fields}` body routed vs the kernel's declared
  shape (v0.4.5); the client **drops the transient `type→payload-key` map** (TE-10).
- **Governance plane** `propose`/`vote`/`apply` — live since pgCK CI-D, and `apply` now **mutates the
  type** (v0.4.5); the `gov_plane_unavailable` stub is retired.
- **`instance.transition`** — governed in-kernel (v0.4.3 reconciled the state-key namespace); native, not
  ridden over `update`.
- **`instance.retire`** (v0.4.3); **`instance.reach`** traverses materialized link quads (v0.4.6);
  **`instance.validate`** required-props gate `validate ⟺ seal` (v0.4.3); **governed query affordances**
  mechanism (v0.4.7).

**Kernel-derived refinements scheduled on the pgCK v0.5 tracks (degrade honestly until then — §4, §11):**

- Full SHACL `ValidationReport` through dispatch — pgCK **T5** (`validate()` consumes `{conforms,
  missing_required[]}` until then).
- `instance.query` **derived QueryShape** (declared filter keys) — pgCK **T1**; `instance.link`/`reach`
  **declared predicate set** — pgCK **T2**; `instance.transition` **per-kernel sealed map** — pgCK **T3**;
  `instance.update` **generic per-shape patch** — pgCK **T4**; the **governed built-in `concept.match`** —
  pgCK **T6**. Client filter/list fallbacks degrade honestly meanwhile.
- `instance.snapshot` authz'd bulk replay — pgCK **T8** (F-A); per-identity grants + affordance projection
  enforced — pgCK **T8** + SPORE; the handle's projection degrades to the full surface, honestly (§4.10).

**Inherited prerequisites (owned by pgCK / SPORE, not CK.Lib.Js):** identity = verified JWT + seal-time
claim check (v3.9 TR-02 / SPORE Phases 0–1 → pgCK **T8**); **F-C** per-session result routing → pgCK **T9**.

---

## 2. Distribution and bundle layout

Distribution, OCI bundle shape, provenance gate, and consumer integration are **unchanged from
SPEC.CK-LIB-JS.v1.4.0 §2 / v1.4.2 §2** and remain normative, with these deltas:

- The bundle **drops `ck-rdf-bridge.js`** (removed, §0) and ships the vendored transport: the
  Dockerfile copies the three modules explicitly (`COPY ck.js ck-client.js ck-store.js /`) plus
  `COPY vendor /vendor`. `index.html` was retired at the v1.4.2 strip and is not in the bundle.
- The L1 module ships as **`ck-store.js`** (`CKStore`) in place of `ck-hex-store.js`.
- Required OCI labels unchanged except `version=1.6.0`.

The runtime-dependency posture is unchanged **and improved**: the L1 cache is zero-dependency (it was
already, but it no longer carries the RDF/JS converter); the transport's `nats.ws` +
`@msgpack/msgpack` are **vendored** under `vendor/` and imported locally (`./vendor/*`) — **zero
runtime CDN fetch, no esm.sh**; the bundle is air-gapped / supply-chain closed (shipped at v1.4.2,
carried forward). The L2 surface adds no new runtime dependency.

> **Provenance gate (on ship).** Every digest in `LATEST.md` MUST verify under
> `gh attestation verify oci://ghcr.io/conceptkernel/ck-lib-js:1.6.0 --repo ConceptKernel/CK.Lib.Js`.
> A 1.6.0 tag MUST pair with the delivered, verifiable artifact — never a spec or tag alone.
> **Byte-verification of the stripped tree is standing release policy** (the `:1.4.1`/`:1.4.2` pre-strip
> incident). **The spec stays private (gitignored); the artifact is public.**

---

## 3. ESM export surface (top-level)

`package.json` `exports` fixes the public surface. The concept-kernel surface is the root; the
physical layers are internal; the RDF layer is gone.

### 3.1 The application surface (the only documented import)

| Subpath | Module | Named exports | Audience |
|---|---|---|---|
| **`.`** | **`ck.js`** | **`CK` (default + named), `ConceptKernel`, `ckOn` (decorator), `wireCkOn` (applies recorded `@ckOn` bindings to a live handle — pairs with the decorator, §4.9), `normalizeKernel` (kernel name → canonical URN helper)** | **all application code** |

`import { CK } from '@conceptkernel/cklib'` is the one import an app or LLM-agent harness needs.

### 3.2 The internal layers (referenced in; tooling/infrastructure only)

Documented as internal; an application that imports them is non-conformant (§7).

| Subpath | Module | Named exports |
|---|---|---|
| `./internal/client` | `ck-client.js` | `CKClient` (the **dispatch** transport), `msgpackEncode`, `msgpackDecode` |
| `./internal/store` | `ck-store.js` | `CKStore` (default + named — typed-instance cache), `CKSubject`, `CKView`, `ckBind`, `instanceUrn`, `instanceType`, `instanceEdges` |

The v1.4.0 legacy render/page modules (`./internal/page` … `./internal/sound`: CKPage, CKBus,
CKStore-legacy, CKRuntime, CKKernel, registry, materializer, shapes, anim) are **not in the v1.5.0
export map** — retired to `_WIP/deprecated/` at the v1.4.2 strip; extraction to CK.Lib.Xr remains the
forward home (§11).

**Removed (no successor on the client):** `./internal/rdf-bridge` (`ck-rdf-bridge.js`, `toQuads`,
`dataFactory`) and the RDF exports of the former hex-store (`makeNativeDatasetCore`, the quad/hex
index). There is no RDF subpath at v1.5.0.

### 3.3 Transitional aliases (back-compat, deprecated)

The shipped `package.json` `exports` map is **exactly four entries** — nothing else resolves:

- **`.`** → `./ck.js` (the application surface, §3.1)
- **`./internal/client`** → `./ck-client.js`; **`./internal/store`** → `./ck-store.js` (§3.2)
- **`./client`** → `./ck-client.js` — the **one surviving transitional alias** (v1.4.x compat for the
  transport import). Deprecated; removal at v2.0.

**Retired (dropped, not aliased):** `./hex-store` and the other v1.4.0 subpaths (`./page`, `./bus`,
`./kernel`, `./registry`, `./runtime`, `./materializer`, `./store`, `./shapes`, `./anim`, `./sound`)
— their backing modules were retired to `_WIP/deprecated/` at the v1.4.2 strip and are not in the
shipped tree, so the aliases were dropped rather than left dangling. A former hex-store consumer
imports `CKStore` from `./internal/store` instead. `./rdf-bridge` is likewise **removed** (not
aliased): there is no RDF bridge to point at. A consumer that imported `toQuads`/`dataFactory` MUST
drop it — the client no longer produces quads.

Any identifier not in §3.1–§3.3 is internal and MAY change without a MAJOR bump.

---

## 4. The unified concept-kernel surface — dispatch-backed

`ck.js` exports `CK`. App code names **concept kernels and concepts (URNs)** — never NATS subjects,
codecs, handles, trace IDs, connections, store objects, quads, graph ids, or query strings. Every
operation resolves to a single outbound primitive: **`ckp.dispatch(verb, kernel_urn, payload,
identity)`** (v3.9 §2.1) — carried on the wire by the default v3.8 per-verb shim until the deferred
CE-B-2 flip (§0 Wire status, §1.3, §5).

```js
import { CK } from '@conceptkernel/cklib';

const task = await CK.activate('pgCK.Task');                               // §4.1 — authenticate + subscribe granted scope
const t    = await task.create('Task', { title: 'Rotate SPIFFE SVIDs', priority: 4 });  // → instance.create
await task.transition(t.id, 'in_progress', { evidence: '…' });             // → instance.transition (§4.3)
const open = await task.query('Task', { lifecycle_state: { eq: 'in_progress' } });       // → instance.query (§4.5)
```

### 4.1 Come to life — `CK.activate(kernel, opts?) → Promise<ConceptKernel>`

`activate` brings a concept kernel to life: it establishes the **authenticated identity** and
subscribes the kernel's **granted scope**, then returns a live handle.

- **`kernel`** — kernel name (`'pgCK.Task'`) or URN (`'ckp://Kernel#pgCK.Task'`); both accepted, normalized.
- **`opts`** (optional; common case is zero-config from bundle/env) — transport endpoint(s), auth
  token / Keycloak realm, anonymous flag, and **cache** options (`replaceById`, `dedupBySeq`,
  `recentCapacity`) passed to the internal `CKStore`. **No option exposes a NATS subject, graph id,
  or query.**
- **What it does internally (all hidden):** constructs the L0 dispatch `CKClient`; opens the
  connection whose **identity is the OIDC-JWT verified at the Envoy edge** (v3.9 TR-02 — the fourth
  tuple element; the client never asserts identity, pgCK derives it from the verified claim);
  constructs the L1 `CKStore`; **discovers the kernel's affordances and subscribes the kernel's
  result/event scope** (client-side as kernel-wide wildcard subjects — `result.kernel.<K>.>`,
  `event.kernel.<K>.>` plus their short forms; scope/grant enforcement is the server-side ACL.
  Deriving the subscription subjects from pgCK's sealed affordance rows is forward work — ⏳
  CI-A/CI-B); and —
  when `instance.snapshot` is reachable and granted — hydrates current state via authz'd bulk replay
  (v3.9 §4, closing F-E). The returned handle is *live*: its typed-instance cache is current and it is
  subscribed to its granted scope.
- **Resolves** when the connection is open and (when available) hydration completes. **Rejects** on a
  transport/auth failure — transport-layer failures bubble up unchanged (§4.8).

### 4.2 Act — the open affordance surface (`do`) + the operation→verb map

A kernel's actions are **not a closed list**; the primary write path is a single generic dispatch:

- **`k.do(verb, payload, opts?)`** — invoke any affordance the kernel declares and the identity is
  **granted**, named at the concept level (`'instance.create'`, `'kernel.vote'`, `'concept.match'`).
  It compiles to `ckp.dispatch(verb, kernelURN, payload, identity)`. Resolves to the typed result
  (`{ ok, id?, seq?, proof_digest?, result?, violations? }`); an unknown verb resolves
  `{ ok:false, error:'unknown_affordance' }` (the client recognizes `'unknown_verb'` as the same
  unknown-marker) and a non-conformant payload resolves typed
  `violations[]` — **server-decided, never client-faked** (v3.9 §2.2, P3/P4).
- **`k.affordances() → Affordance[]`** — the kernel's declared, identity-granted affordance
  descriptors, sourced from pgCK's sealed affordance rows. **The descriptor shape is server-defined**:
  the client passes through whatever pgCK returns, unshaped and unvalidated client-side
  (`{ name, plane, inShape?, granted }` is indicative of the v3.9 direction, not a client-enforced
  contract). The set a tool or LLM agent **enumerates** to discover what it may do; it grows as
  ontology is governed in, with no CK.Lib.Js change.

**Named conveniences (the stable floor).** Sugar over `do`, each mapped to a v3.9 verb through an
**explicit operation→verb table** (never by parsing an action-URN — this is what made dotted verbs
expressible at L2 since v1.4.2, and it now carries the v3.8→v3.9 migration):

| Handle method | v3.9 dispatch verb | v3.8 legacy alias (1 minor) | Returns |
|---|---|---|---|
| `k.create(type, body)` | `instance.create` | `task.create`/`kernel.create`/`edge.create` | `{ id, verified, proof_digest }` |
| `k.update(id, patch)` | `instance.update` | `task.update` | `{ id, verified, proof_digest }` |
| `k.transition(id, toState, evidence?)` | `instance.transition` | — (native, governed in-kernel v0.4.3; sealed per-kernel map → T3) | `{ id, from, to, verified }` |
| `k.link(source, predicate, target)` | `instance.link` | `edge.create` | `{ id, verified, proof_digest }` |
| `k.retire(id, reason?)` | `instance.retire` | — (sealed retraction, not delete) | `{ id, verified, proof_digest }` |
| `k.list(type, filter?)` / `k.query(type, filter)` | `instance.query` | `instances.list` | `instance[]` (dispatch-first: `instance.query`, then legacy `instances.list`; client-side cache filter only as last resort) |
| `k.get(id)` | `instance.get` | `instance.get` | `ConceptInstance \| null` (cache first) |
| `k.reach(from, via, opts?)` | `instance.reach` | — (new; CI-E-4) | `instance[]` (bounded traversal) |
| `k.verify(id)` | `instance.verify` | `instance.verify` | `{ verified, proof_digest, seq }` |
| `k.provenance(id, depth?)` | `instance.provenance` | `provenance` | proof-chain projection |
| `k.snapshot(scope?)` | `instance.snapshot` | `snapshot.board`/`snapshot.bodies` *(server-side alias coordination only — the client implements no fallback)* | `instance[]` (per-requester grant) |
| `k.validate(body)` | `instance.validate` | `ckp.validate` | `{ conforms, violations? }` |
| `k.notify(from, predicate, to, body?)` | *(sugar over `link`)* `instance.link` with `event: true` | `notify` | `{ id, verified, proof_digest }` |
| `k.match(term)` | `concept.match` (governed query) | — (new; TE-4) | `{ term, count, candidates }` |

`notify` is **not a distinct `OP_VERB` entry** — it is sugar over the `link` verb:
`do('instance.link', { source: from, predicate, target: to, body, event: true })`. The `from` argument
is the **source** concept URN (the concept sending the notification); `to` is the **target** concept or
kernel URN being addressed. Both are required for a sealed cross-kernel edge (confirmed by CSVC live
verification 2026-06-14 — prior 3-arg form omitted `target`, preventing the edge from sealing). A declared
predicate IRI MUST be supplied; use `propose→vote→apply('add_property',{…})` to declare a kernel-specific
predicate if none of the base-ontology predicates fit. Retirement is a **sealed retraction**, not a
delete — *"You cannot unseal a sealed fact. You can only seal a retraction."* (`VISION.v3.8.1` §2.1) →
`instance.retire`. Object refs are `{"@id"}` id-nodes.

`k.match(term)` calls the **governed query affordance** `concept.match` (pgCK v0.4.13 T6 — seeded as a
governed query at bootstrap; cklib adopts typed params). Returns `{ term, count, candidates }` from the
reply field `.candidates`. **TE-4** task: code the handle method; the `REPLY_FIELD` entry already maps
`concept.match`→`candidates` (`ck.js`).

### 4.3 Transition — `k.transition(id, toState, evidence?)` (state-machine-gated)

The permitted-transition map is a **sealed fact on the kernel** (v3.9 §4 / I1: constraints are facts),
checked by pgCK inside the same transaction as the seal. The client cannot move an instance to an
illegal state — there is no application code to get wrong; an illegal `to_state` resolves
`{ ok:false }` server-side. **Shipped:** the server-side gate is governed in-kernel (pgCK v0.4.3
reconciled the state-key namespace — the lifecycle state lives under the **v3.7** IRI); `transition`
dispatches natively (the `instance.update` ride is retired). **🔄 The per-kernel *sealed* transition
map is pgCK T3 (v0.4.10):** today the gate reads one global map; T3 makes it a sealed kernel fact, and
**TE-7** then renders only the legal `to_state`s from the kernel's sealed map.

### 4.4 Validate — `k.validate(body) → Promise<report>`

`validate` asks pgCK whether a body conforms **before** a write (`instance.validate`, dry-run of the
seal gate). **Shipped (pgCK v0.4.3):** the required-props gate runs the same `sh:minCount≥1` check the
seal enforces, so **`validate ok ⟺ seal accepts`**, resolving `{ conforms, missing_required[] }`.
**🔄 The full SHACL `ValidationReport`** (typed violations: datatype, cardinality, node-kind, pattern)
is **pgCK T5 (v0.4.12)**; **TE-5** surfaces the full report and drops the boolean-grade local validate
once T5 lands.

### 4.5 Read without a query language — `k.query` / `k.get` / `k.reach` / reactive `view`·`urn`·`bind`

Reads are **named, typed, grantable** (v3.9 P9) — there is no client-side query engine.

- **`k.query(type, filter)` → `instance.query`** — `filter` is a **QueryShape**: each declared
  data-property is a permissible key carrying its datatype; operators are a **closed enum**
  (`eq, neq, lt, lte, gt, gte, contains, in`) plus closed `order_by`/`limit`/`offset`. The client
  ships the filter as a typed payload; pgCK shape-validates it and compiles it into a parameterized
  `FILTER` server-side (v3.9 §6.1). **No expression position exists** for a caller to occupy. **🔄 The
  *derived* QueryShape** — filter keys checked against the kernel's *declared* properties (from
  `ontology/*.ttl`), not regex-validated — is **pgCK T1 (v0.4.8)**; **TE-9** sends only declared keys and
  drops the client cache-filter fallback. Until T1, `query` degrades to `instances.list` then the cache
  filter, honestly.
- **`k.reach(from, via, { depth?, transitive? })` → `instance.reach`** — bounded traversal; `via` MUST
  be a predicate in the kernel's declared/granted set; `depth ≤ path_max_depth` (v3.9 §6.2). **Shipped:**
  `reach` traverses participant-created links transitively (pgCK v0.4.6 materializes edge quads). **🔄 The
  *declared* predicate-set gate** (vs the namespace allowlist) is **pgCK T2 (v0.4.9)**; **TE-8** uses the
  declared predicates once T2 lands.
- **`k.get(id)` → `instance.get`** — cache first; dispatch on miss.
- **Reactive reads over the cache** (URN-native, carry no physical token):

| Handle method | Purpose |
|---|---|
| `k.view(urn, opts?)` | reactive `CKView`: `.exists()/.get()/.edges()`, `.on('change', {added,removed})` (microtask-batched), `.fetch()` (dispatches `instance.get`), `.dispose()` |
| `k.urn(urn)` | synchronous `CKSubject \| null` (pure cache read; no fetch, no allocation) |
| `k.bind(urnPattern, fn, opts?)` / `k.bindOnce(...)` | dispatch on URN pattern after ingest: `ckp://Kernel#K`, `ckp://Instance#X`, `ckp://Edge#P`, `*` |

`CKView`/`CKSubject` are **typed-instance views**, not quad/RDF views: `.get()` returns the JSONB
instance; `.edges()` returns linked `@id` refs the cache has seen. There is no triple/quad accessor.

### 4.6 Governance plane — `k.propose` / `k.vote` / `k.apply` (gated, type changes only)

Any write touching the kernel's **type** (shapes, transition maps, affordance descriptors, quorum,
materialization policy) is **governance-plane**: it never executes on receipt; it seals a Proposal
that waits for Votes and applies only through consensus (v3.9 §5).

```js
const p = await task.propose({ op: 'modify_shape_constraint', /* typed op set */ });  // → kernel.propose_change → sealed ckp:Proposal{pending}
await task.vote(p.id, 'approve');                                                       // → kernel.vote → sealed ckp:Vote
await task.apply(p.id);                                                                 // → kernel.apply (quorum-gated cascade)
```

- `propose(opSet)` → `kernel.propose_change`; the body is a **typed operation set** (`add_class`,
  `add_property`, `modify_shape_constraint`, `add_affordance`, `set_transition_map`, `set_quorum`,
  `set_materialize_policy`) validated by `ProposalShape`. The client never authors Turtle (the one
  fenced `raw_ttl` path is server-side, v3.9 §5.2).

  **`add_property` detail shape (normative — RCA 2026-06-15):**
  ```js
  { op: 'add_property', detail: {
      path:        '<full property IRI>',        // required — e.g. 'urn:ckp:csvc/prop/notifies'
      targetClass: '<full class IRI>',           // required — the type this property attaches to
      datatype:    '<XSD or class IRI>',         // required
      minCount:    0,   // ← OPTIONAL property.  0 = optional, 1 = required (DEFAULT if omitted)
      maxCount:    1,   // optional — omit for unbounded
  }, requires_quorum: 1 }
  ```
  **`minCount` (integer) is the constraint field — NOT `required` (boolean).** Supplying `required:false`
  is silently ignored and `minCount` defaults to **1 (= required)**. Use `minCount:0` for an optional
  property. The apply reply echoes the effective constraint; read it before voting. A shape change that
  tightens a property on a class with existing instances will break future creates — **preview the
  proposal's effect before voting** (pgCK forward ask §7.1; see SPEC.CK-OPERATIONS §3.F).
  **Reversibility:** a sealed type change is never a dead end. Propose the inverse (`modify_shape_constraint`
  with the corrected `minCount`, or `remove_property`) → vote → apply → epoch++. The prior decision is kept
  as sealed history; the new one is active. The app layer MAY offer "revert" as a convenience that
  auto-proposes the inverse — this is an app-level pattern (CSVC G3), not a new pgCK verb.
- `vote(proposalId, choice)` → `kernel.vote`; a human approval is an ordinary sealed `ckp:Vote`.
- `apply(proposalId)` → `kernel.apply`; rejected unless quorum is satisfied.
- **Shipped (pgCK CI-D + v0.4.5):** the plane is live and `apply` now **mutates the kernel type** — a
  quorum-approved `add_property` constrains the next `create` (the reply carries `applied.graph_changed`).
  The `gov_plane_unavailable` stub is retired; signatures are unchanged. `add_affordance` carrying a query
  declares a **governed query affordance** (v0.4.7) — the `concept.match` mechanism any kernel can use.

### 4.7 Lifecycle — `k.close()`

`k.close()` (alias `k.dispose()`) tears down the kernel: disposes live views, removes binds,
unsubscribes, and closes the internal dispatch transport. After close, handle methods MUST reject/throw.

### 4.8 What is reachable, and what is hidden (the conformance teeth)

**Reachable from app code:** `CK.activate`; on the handle — `do`, `affordances`, `create`, `update`,
`transition`, `list`, `query`, `get`, `reach`, `link`, `retire`, `notify`, `validate`, `verify`,
`provenance`, `snapshot`, `propose`, `vote`, `apply`, `view`, `urn`, `bind`, `bindOnce`, `close`; the
`ckOn` decorator (+ its `wireCkOn` wiring helper); `CKView`/`CKSubject`/`ConceptInstance`/`Affordance`
value types.

**NOT reachable from app code (MUST require an `./internal/*` import to touch):** `CKClient`, the
`ckp.dispatch` envelope, `new CKStore`, `insert()`, `ck.send()`, any NATS subject string, `Ck-Seq`,
dictionary handles, `trace_id` plumbing, codec selection, connection objects — **and, removed
entirely, any quad, graph id, SPARQL string, `toQuads`, or RDF dataset.** The surface **leaks no
L0/L1 token and exposes no query language** (conformance per v3.9 P1/P2 + `SPEC.CKP.v3.8.1` §7).

> **Hiding NATS without lying about it.** NATS is the carrier; `ckp.dispatch` is the door. App authors
> describe their world as concept kernels and concepts; the surface does the wire work. Transport-layer
> failures (auth, connection drop, codec) bubble up **unchanged** — the surface does not disguise a
> connection drop as a concept-layer problem. Store log lines SHOULD name the concept/URN first and the
> dispatch verb in parentheses, without making subjects part of the contract.

### 4.9 Decorator form — `@ckOn(...)`

Unchanged from v1.4.2 §4.9 in form. `@ckOn('ckp://Kernel#pgCK.Task/sealed')` **records** a binding on
the class; the exported **`wireCkOn(obj, handle)`** helper applies the recorded bindings to a live
handle (call it after assigning the conventional handle field — `this.kernel`, `this.ck`, `this._ck`)
and returns an unbind function. The function form `k.bind(urn, fn)` is the canonical surface; the
decorator is sugar.

### 4.10 Authorization model & affordance projection (the client is NOT the authz authority)

The handle is **affordance-projected**: what `do` can invoke and what `activate` subscribes are the
kernel's affordance rows **intersected with the verified identity's grants** (v3.9 §2.2(3)). The
client carries **no role taxonomy** — no `owner`/`participant` branch. Roles are pgCK-side grant
bundles; add a role by issuing a different bundle — **zero client change**.

**The client is not, and MUST NOT be, the authorization boundary** (hiding an ungranted verb is
ergonomics, not enforcement). Enforcement is structural and server-side:

- **v3.9 §7 Postgres role isolation** — even an operator with DB credentials holds exactly one
  capability, `EXECUTE ckp.dispatch`; `pgrdf.*` and direct table access are revoked. A bypassing
  client gains nothing.
- **Envoy = authentication only** (TLS + OIDC-JWT verify); **pgCK = authorization** (implicit-deny
  grants checked at seal-time on the post-Envoy identity — v3.9 §2.2(3), TR-02).
- **Writes/`do`:** an ungranted action is **rejected at the dispatch gate** (`{ ok:false }`) — normal
  flow control, not an exception.
- **Reads:** every read is a granted dispatch verb (P9); confidentiality rides per-session result
  routing on `session.{project}.{id}` (closing the F-C wildcard leak — inherited, transport-side).

**Honest status (⏳).** Per-identity grants + sealed affordance routing are *specified-not-built* in
pgCK (land across CI-A/CI-B + SPORE Phases 0–1). Until then the affordance projection **degrades to
the full surface — honestly, not silently**: the handle is shaped the moment pgCK can answer "what may
this identity do here?", and not before. CK.Lib.Js ships the projection mechanism; pgCK supplies the
truth it projects.

---

## 5. The internal layers (normative-internal)

The L2 surface MUST be implemented over exactly two internal layers — no third (RDF) layer exists:

- **L0 — `CKClient` (the dispatch transport).** Carries the four-tuple `⟨verb, kernel_urn, payload,
  identity⟩` to pgCK over NATS WSS, correlates the typed reply by `Trace-Id`, and delivers
  granted-scope events to L1. Subject grammar, headers, codec, dedup, dictionary, reconnect are as
  v1.4.0 §4. The transport operates a **transitional internal shim** as the **default wire**
  (`dispatchMode:'v3.8'`): each verb is emitted on its v3.8 per-verb subject. The four-tuple
  `ckp.dispatch` ingress body (`{verb, kernel_urn, payload}`; identity server-derived, TR-02) is
  implemented but **opt-in** (`dispatchMode:'v3.9'`) until the deferred CE-B-2 default-flip; the shim
  is invisible above L0 and is removed when pgCK CI-B lands.
- **L1 — `CKStore` (the typed-instance cache).** A Map of `@id`/URN → typed JSONB instance, updated by
  dispatch replies and granted events, providing the reactive `view`/`urn`/`bind` reads (§4.5). It is
  **explicitly not** an RDF store: no quads, no SPO/hex index, no DatasetCore, no SPARQL, no `toQuads`.
  Projection rules (replace-by-id, dedup-by-seq, recent ring) carry over from the former hex-store's
  *instance* projection; the *triple* projection is removed.
- **Legacy render/page surface:** retired to `_WIP/deprecated/` at the v1.4.2 strip — not part of the
  shipped v1.5.0 tree; extraction to CK.Lib.Xr remains the forward home (§11).
- **Removed:** `ck-rdf-bridge.js` and all RDF/JS. There is no RDF layer.

v1.5.0 changes wire behavior (dispatch ingress) and removes the RDF layer; it introduces no new
runtime dependency.

---

## 6. Runtime environment requirements

As v1.4.0 §8 / v1.4.2 §6: modern evergreen browser (ES2020+ modules, `WebSocket`, `localStorage`,
`fetch`, `Map`/`Set`/`Promise`, async iterators); HTTPS (or `http://localhost`); reachable NATS WSS
endpoint and Keycloak realm; **no CDN access required** — the transport tier's `nats.ws` +
`@msgpack/msgpack` are vendored under `vendor/` and load locally with the module (air-gapped, the
v1.4.2 posture carried forward); Stage-3 decorator support only if `@ckOn` is used. **No RDF/JS, SPARQL, or graph-store dependency exists.** Node.js is
not a supported runtime at v1.6.0.

---

## 7. Conformance summary

A **consumer (application)** is conformant iff:

1. It loads modules from a v1.6.0 OCI image whose digest passed `gh attestation verify` (§2).
2. **It uses only the §3.1 application surface** (`CK` / `ConceptKernel`) for application logic, and
   imports **no** `./internal/*` module (and no deprecated alias) in app code.
3. It activates kernels via `CK.activate` and operates via the §4 handle methods — **never** naming a
   NATS subject, codec, dictionary handle, trace ID, connection, store object, **quad, graph id, or
   query string** in application code.
4. It does **not** import any RDF/quad API (removed) and does **not** construct a query.

A **pgCK-side runtime** is conformant for the governed path when it presents the v3.9 `ckp.dispatch`
contract (§2 there). The Tier 2 operations (typed `create`/`apply`-effect, `reach`, governed query,
`transition`, `retire`, `validate`-gate) are **shipped + attested** (pgCK v0.4.5–v0.4.7); the remaining
kernel-derived refinements (derived `query` QueryShape, declared-predicate `reach`/`link`, per-kernel
`transition` map, generic `update` patch, full `validate` report, authz'd `snapshot`) reach full fidelity
across the pgCK **v0.5 tracks T1…T9**; until each lands, the client operates in the documented
degraded-but-honest modes (§4).

> Tooling, renderers, dictionary infrastructure, and tests MAY import `./internal/*`. That use is
> conformant for those audiences; it is non-conformant for application logic. **No audience may import
> an RDF/quad surface — none exists.**

---

## 8. Transitional, deprecated & removed surfaces (at v1.5.0 — summary)

| Surface | State | Removal/exit |
|---|---|---|
| `ck-rdf-bridge.js`, `toQuads`, `dataFactory`, `makeNativeDatasetCore`, 6-way hex index, `./internal/rdf-bridge`, `./rdf-bridge` | **REMOVED at 1.5.0** | done — no client RDF |
| `CKHexStore` (RDF graph mirror) → `CKStore` (typed-instance cache) | renamed + reduced | `./hex-store` alias **dropped** (module retired at the v1.4.2 strip — §3.3); import `CKStore` via `./internal/store` |
| v3.8 per-verb subject grammar → `ckp.dispatch` four-tuple ingress | **pgCK CI-B shipped** (sealed registry + four-tuple, v0.3.2) — the four-tuple ingress is presented; the v3.8 shim stays the **default wire** (`dispatchMode:'v3.8'`) until the CK.Lib.Js-internal CE-B-2 default-flip | flip is now CK.Lib.Js-internal (unblocked) |
| `task.*`/`edge.create`/`instances.list`/`snapshot.*` legacy verb names | deprecated aliases of `instance.*` (mapped in the op→verb table) | one minor; retire via NOTIFIES coordination (roadmap §11) |
| `transition` over `update`; governance `{ ok:false }` stubs | **retired** — `transition` native (pgCK v0.4.3), governance live (CI-D + apply-effect v0.4.5) | done |
| `query` over `list`/cache filter | gated shim until the **derived QueryShape** | pgCK **T1 · v0.4.8** (then **TE-9** drops the fallback) |
| `validate` `{conforms, missing_required[]}` (gate shipped v0.4.3) → full `ValidationReport` | partial | pgCK **T5 · v0.4.12** (`ValidationReport` through dispatch) |
| `./client` public subpath — the only surviving alias (`./hex-store`, `./page`, … were dropped at the v1.4.2 strip — §3.3) | deprecated alias of `./internal/client` | v2.0 (MAJOR) |

These document **what 1.5.0 MUST BE on ship**. None may be relied on as permanent.

---

## 9. Conformance language & change control

Changes to any §1–§8 behavior require a new artifact version with its own built + attested OCI image
(and, when published, npm tarball) per `PROVENANCE.md`. A release tag MUST pair with a delivered,
verifiable artifact — never a spec or tag alone. **This document is authoritative as the governing
design contract and is PUBLIC client documentation** (tracked alongside `v1.4.0`/`v1.4.2`); the
Visibility note (top) explains why the distributed artifact never carries it and records the
pgCK-ratification gate on the public push. On the day the 1.6.0 artifact is built and attested, this
document becomes immutable and v1.5.0 moves to `_WIP/` history. The next change ships as
`SPEC.CK-LIB-JS.v<next>.md`.

---

## 9A. Cross-repo coordination — the NOTIFIES protocol

CK.Lib.Js evolves against sibling repos (pgCK, pgRDF, oci-germination, SuperAiHarness3000). A
cross-repo ask — a contract change, an integration gap, a pgCK gate dependency, an ACK — is
coordinated with **NOTIFIES**, the directed markdown-message protocol; it is **never** an edit to the
other repo's tree. Canonical spec: `SPEC.NOTIFIES.v0.4.md` (authored in `CK.Lib.Js/_WIP/`; supersedes
v0.3). This section is *self-state about CK.Lib.Js's own dev-coordination process* (SPEC.NOTIFIES §1).

- **A NOTIFY lives in the originating thread folder** — the `_WIP/` of the repo that wrote turn 1,
  never authored into the target's tree. `_WIP/` is gitignored; NOTIFIES are local coordination
  artifacts, never public history.
- **Naming:** `NOTIFIES.<target>.<version>.<theme>.md` with the §4 YAML frontmatter.
- **Forwarded-pwd / adjacent-to-source (v0.4 §3/§5.1):** when the originator forwards the inbound's
  path, the `-RESPONSE.md` co-locates **adjacent to the inbound, in the originating repo's `_WIP/`**;
  with no forwarded pwd it falls back to the responder's own `_WIP/`.
- **Immutability & postfix:** a written NOTIFY is never edited; respond with a NEW `-RESPONSE.md`
  (multi-turn `-RESPONSE-RESPONSE…`). An acknowledgement is `severity: ack` — **there is no `-ACK.md`**.
- **Where v1.5.0 uses it:** the `task.*`→`instance.*` alias retirement (§8) and every pgCK CI-A…CI-E
  gate this client degrades against (§4, §11) flow through NOTIFY → respond, one minor ahead of dropping
  any alias — and the **public push of this spec** is gated on a pgCK v3.9-ratification NOTIFY
  (Visibility note).

---

## 10. References

- **Grounding model (private):** `SPEC.CKP.v3.9.md` (pgCK root; gitignored) — the three rings, the
  closed `ckp.dispatch` four-tuple (§2), the four arguments against a query surface (§0.1), Postgres
  role isolation (§7), the governance plane (§5), the typed read surface (§6), invariants P1–P10.
- **pgCK delivery phases (private):** `SPEC.pgCK.ROADMAP.v0.5.0.md` (pgCK root; gitignored) — the
  T1…T10 tracks (`v0.4.8 → v0.5.0`) that complete CKP v3.9 by replacing each concretion with the kernel's
  declared shape; the tracks this client's TE-n tasks consume. (Tier 2 CI-A…CI-E shipped, v0.4.5–v0.4.7.)
- **Authoritative declared shapes (private):** pgCK `ontology/*.ttl` (`core.ttl`, `task.ttl`/`goal.ttl`,
  split slices) — the source of every typed form this client mirrors; authoritative until sporaxis ships.
- **Operable-interface predecessor:** `ref-SPEC.CKP.v3.8.1.md` §2/§7/§8 (carried where unchanged).
- **Predecessor governing specs (public, tracked):** `SPEC.CK-LIB-JS.v1.4.2.md`, `SPEC.CK-LIB-JS.v1.4.0.md`.
- **Organ topology & authorization model:** `SPEC.CK.ORGAN-LOOPS.v3.8.1` — CK/TOOL/DATA loops;
  Envoy-auth / pgCK-authz-at-seal; affordance-row subscriptions; `session.{project}.{id}`.
- **Cross-repo coordination:** `SPEC.NOTIFIES.v0.4` (supersedes v0.3; forwarded-pwd / adjacent-to-source)
  — the `task.*`→`instance.*` alias retirement and any pgCK gate dependency flows through NOTIFY →
  respond, one minor ahead of dropping aliases. See §9A.
- **Published digests + verification (on ship):** `LATEST.md`; per-version delta: `CHANGELOG.md`.

---

## 11. Forward work — the v1.6.0 track set (the client-edge twin of pgCK v0.5)

The pgCK Tier 2 gates (CI-A…CI-E) are **shipped + attested** (v0.4.5–v0.4.7). pgCK **T1–T6 are also
shipped + attested** (v0.4.8–v0.4.13). The rows below show current client delivery state (updated
2026-06-15 against `ck-lib-js.task.v1.6.0-typed-edge` and live verify vs `ociger-ck-allinone:v0.7.19`
/ pgCK `0.4.13`).

`◑` = form-live at v0.7.19 (wire round-trips), enforcement vacuous pending shape-graph fix
(oci-germination NOTIFY `shape-graph-mismatch` — `_WIP/NOTIFIES.oci-germination.v0.7.19.…`).
`🔨` = built-ahead on branch, not yet in a released OCI image.
`⏳` = pgCK-substrate / F-A / F-C blocked.

| TE task (client) | pgCK track | Status |
|---|---|---|
| **TE-10** adopt uniform `instance.create {type,…}` body; drop `type→payload-key` map | keystone · v0.4.5 ✅ | ◑ form-live (`ck.js`) |
| **TE-9** `instance.query` sends declared QueryShape keys; drops cache-filter fallback | T1 · v0.4.8 ✅ | ◑ form-live |
| **TE-8** `instance.link` target is plain IRI; uses declared predicate set | T2 · v0.4.9 ✅ | ◑ form-live *(reach end-to-end broken — bare `from` id → SPARQL IRI error; NOTIFY pending pgCK)* |
| **TE-7** `instance.transition` dispatches natively; renders allowed `to_state`s | T3 · v0.4.10 ✅ | ✅ live v0.7.19 |
| **TE-6** `instance.update` sends `{id, patch:{…}}` declared-shape patch | T4 · v0.4.11 ✅ | ◑ form-live |
| **TE-5** `validate()` surfaces full `ValidationReport` | T5 · v0.4.12 ✅ | ◑ form-live (shapes vacuous on demo — shape-graph) |
| **TE-4** `k.match(term)` governed query affordance sugar; typed params, never query text | T6 · v0.4.13 ✅ | 🔨 REPLY_FIELD mapped; **handle method not yet coded** |
| **notify target** `k.notify(from, predicate, to, body?)` — add `target` so cross-kernel edge seals | spec correction (§4.2) | 🔨 **fix pending in `ck.js`** |
| **affordances verb** dispatch `affordances` (not `kernel.affordances`) | spec correction (§3.G) | 🔨 **fix pending in `ck.js`** |
| **TE-3** `instance.snapshot` — supply validated JWT; render granted bodies | T8 · v0.4.15 (F-A) + SPORE | ⏳ gated |
| **TE-2** per-session result routing on `session.{project}.{id}` | T9 · v0.4.16 (F-C) | ⏳ gated |
| **TE-1** ⛴ **ship v1.6.0 — Typed Edge** | pgCK v0.5.0 | ⏳ blocked on: TE-4 code, notify fix, affordances fix, shape-graph mismatch (oci-germination) |

**Release blockers (must clear before TE-1):**
1. Shape-graph mismatch — oci-germination NOTIFY `v0.7.19.shape-graph-mismatch-typed-edge-vacuous`; awaiting RESPONSE. Fixes demo bootstrap so T1–T5 enforcement is non-vacuous.
2. `instance.reach` bare-id IRI bug — `from` must be a full IRI; raises SPARQL invalid-IRI server-side. NOTIFY to pgCK pending.
3. TE-4 `k.match(term)` handle method — code it in `ck.js`.
4. `notify` target — fix `ck.js:149` to `notify(from, predicate, to, body?)` / `{source:from, predicate, target:to, body, event:true}`.
5. `affordances()` verb — dispatch `affordances` not `kernel.affordances`.

**Carried forward (independent of the track list):** drop the v3.8 subject-grammar shim once the
four-tuple default-flip lands (CE-B-2); retire the `task.*`→`instance.*` aliases one minor after
web2-green (NOTIFIES); Node / LLM-agent harness (`ck-harness`); minified build + TypeScript types;
extract legacy render → CK.Lib.Xr; hard-remove `./client` alias at v2.0.

**Post-v1.6.0 versions (governed by SPEC.ROADMAP.v1.6.1.CHECKLIST.md):**
- **v1.6.1** — TE-3 (`instance.snapshot`) when pgCK T8 + SPORE F-A land; CE-B-2 default-flip.
- **v1.6.2** — TE-2 (per-session routing) when pgCK T9 F-C lands — or batched into v1.7.0 with other accumulations.

Each item that ships becomes part of the next normative spec. This document becomes immutable on the
day the `1.6.0` OCI image is built and attested; until then it remains a living pre-ship governing contract.
