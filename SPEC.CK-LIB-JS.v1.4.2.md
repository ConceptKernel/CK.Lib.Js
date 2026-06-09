# SPEC.CK-LIB-JS.v1.4.2 — CK.Lib.Js Normative Specification (the unified concept-kernel surface)

**Status:** **DRAFT — target spec. This document LEADS the 1.4.2 artifact; it is NOT yet authoritative.**
It becomes authoritative only when a built + attested `ghcr.io/conceptkernel/ck-lib-js:1.4.2`
image exists whose published digest verifies (§2.2). Until then it is a normative **design
contract**: the surface an implementation MUST present, against which the v1.4.2 build and its
implementation plan are written. No release tag may be cut against this spec until the artifact
ships (per [`PROVENANCE.md`](./PROVENANCE.md) and [`SPEC.CK-LIB-JS.v1.4.0.md`](./SPEC.CK-LIB-JS.v1.4.0.md) §11).
**Date:** 2026-06-09
**Supersedes (on ship):** SPEC.CK-LIB-JS.v1.4.0 (2026-06-06) — kept for history
**Audience:** CK.Lib.Js consumers (concept-kernel page/app authors, bundle integrators, LLM-agent harness authors), pgCK runtime authors, oci-germination spec maintainers
**Conformance language:** MUST / SHOULD / MAY per RFC 2119

This document describes **what v1.4.2 MUST BE and how it MUST be used**. Its centerpiece is a
**single, unified concept-kernel surface**: an app author imports one thing, **activates a
concept kernel**, and **operates on it** — never naming a NATS subject, codec, dictionary
handle, trace ID, store object, or connection. The transport (`CKClient`, L0) and the graph
mirror (`CKHexStore`, L1) become **internal layers referenced into the package**, not the
documented application surface.

> **Versioning discipline (carried from v1.4.0 §11, inverted for a target spec).** The
> governing-spec rule is that a spec *follows* the artifact and never leads it. This document is
> the one sanctioned exception: a **DRAFT target** spec, openly marked as leading the artifact,
> used to drive the build. It carries no authority over any shipped image until 1.4.2 is built
> and attested; at that moment its Status flips to authoritative and v1.4.0 moves to history.
> Nothing here may be relied on by a consumer before that point.

---

## 0. What changes in v1.4.2 (and what does not)

v1.4.0 shipped **L1**: `CKHexStore`, a URN-native graph mirror the developer wires to a
`CKClient` by hand (five lines of transport-naming bootstrap, [SPEC.CK-LIB-JS.v1.4.0.md §5](./SPEC.CK-LIB-JS.v1.4.0.md)).
The *operations* were URN-native, but the *bootstrap* still named the transport.

v1.4.2 adds **L2**: the **unified concept-kernel surface** — the reference JS binding of the
operable interface specified in [`SPEC.CKP.v3.8.1` §2](./ref-SPEC.CKP.v3.8.1.md) (home repo pgCK;
ref-symlink `ref-SPEC.CKP.v3.8.1.md`). One import, one `activate`, then operations on the kernel.

| Layer | Module(s) | v1.4.0 | v1.4.2 |
|---|---|---|---|
| **L2 — concept-kernel surface** | `ck.js` (`CK`, `ConceptKernel`) | absent | **the only documented app API** |
| **L1 — graph mirror** | `ck-hex-store.js` (`CKHexStore`) | the centerpiece, app-facing | **internal**; engine under L2 |
| **L0 — transport** | `ck-client.js` (`CKClient`) | app-facing | **internal**; transport under L2 |
| RDF bridge | `ck-rdf-bridge.js` | app-facing | internal |
| Legacy render/page surface | `ck-page.js`, `ck-registry.js`, … | app-facing | internal / extraction candidate (§7) |

**Unchanged and carried by reference (still normative at their v1.4.0 sections):** the CKClient
wire contract (subject grammar, headers, codec, dedup, dictionary, auth — v1.4.0 §4), the
`CKHexStore` storage/projection rules (v1.4.0 §5), the `ck-rdf-bridge` converter (v1.4.0 §6),
the legacy surface (v1.4.0 §7), distribution/provenance (v1.4.0 §2). v1.4.2 **adds a surface and
reorganizes the public boundary**; it does not change wire behavior.

> **What this is NOT.** v1.4.2 does not delete the L1/L0 modules, does not change the wire
> protocol, and does not (yet) move `CKHexStore` to its own repo. The graph mirror's independent
> graduation stays a **future option** (§11) — when it graduates it remains a *referenced*
> library, still hidden behind the L2 surface.

---

## 1. Identity and scope

### 1.1 What CK.Lib.Js is (v1.4.2 framing)

CK.Lib.Js is a self-contained ESM JavaScript library for **operating concept kernels** from the
browser (and, forward, Node — §11). An application:

1. imports `CK` from `@conceptkernel/cklib`,
2. `await CK.activate('<kernel>')` to bring a concept kernel to life, and
3. calls operations on the returned **`ConceptKernel`** handle.

Underneath, CK.Lib.Js still provides — now as **internal layers** — a NATS WebSocket client
(`CKClient`, L0) speaking the CKP v3.8 wire protocol, a URN-native 6-way hex-indexed graph mirror
(`CKHexStore`, L1), a dependency-free RDF/JS bridge, and a legacy Konva render/page surface. None
of these are the application's surface in v1.4.2; they are the machinery the L2 surface drives.

It targets the **browser** as the primary runtime. Node.js is not a supported runtime at v1.4.2
(the Node/LLM-agent harness is forward work — §11), though the L2 surface is deliberately
transport- and DOM-agnostic so a Node binding is additive.

### 1.2 Identifier

- npm name: `@conceptkernel/cklib` — staged in `package.json` at the target version; publication
  status follows the artifact. Consumers MUST treat OCI as the authoritative distribution.
- OCI image (on ship): `ghcr.io/conceptkernel/ck-lib-js:1.4.2` (multi-arch index; aggregate
  digest recorded in [`LATEST.md`](./LATEST.md) when built).
- Designation: `org.opencontainers.image.designation=ckp:static`. License: MIT.

### 1.3 Versioning

Semantic versioning (`MAJOR.MINOR.PATCH`). v1.4.2 is a **MINOR-additive** release over v1.4.0: it
**adds** the L2 surface (`ck.js`) and **reorganizes the public export boundary** (§3) so the
concept-kernel surface is the root. Because the L1/L0 named exports move to an explicit internal
namespace rather than being removed, app code written against the v1.4.0 §3 **named** subpaths
continues to resolve through the transitional `./internal/*` aliases (§3.3, §8). The **one** breaking
edge is the bare package root `.`: v1.4.0 resolved it to the transport (`ck-client.js`), and v1.4.2
repoints it to the L2 surface (`ck.js`). A consumer that imported the transport via the bare root MUST
switch to `./internal/client` (or the deprecated `./client` alias). The project accepts this single
root-remap at MINOR because the named-subpath aliases cover every other v1.4.0 import; the hard
removal of the deprecated public physical-layer subpaths is targeted v2.0 (§11).

- A wire-format change MUST bump MINOR (unchanged here).
- A breaking change to the L2 surface named in §4 MUST bump MAJOR.
- Additive operations/fields MAY bump PATCH or MINOR.

### 1.4 Out of scope for v1.4.2 (MUST be assumed absent)

- Everything out of scope at v1.4.0 §1.4 (Node runtime, client-side proof verification, SPARQL
  engine, `CKHexStore` persistence, baked per-type schemas, JetStream durability) — still absent.
- A full SHACL `validate_report` from pgCK (`ck.validate()` returns boolean-grade conformance
  until pgCK ships field-level diagnostics — §4.5, §11).
- A frozen behaviour-predicate set on the pgCK side (`behave()`/`on()` run on `edge.create`+`notify`
  with client-side predicate routing until the freeze — §4.6, §11).
- A first-class pgCK `confirm`/`attest` verb (`confirm()` rides `task.update` + the seal's proof
  until it ships — §4.5, §11).
- Removal of the L1/L0 public subpaths (deprecated → internal at 1.4.2; removed v2.0).

---

## 2. Distribution and bundle layout

Distribution, OCI bundle shape, provenance gate, and consumer integration are **unchanged from
[SPEC.CK-LIB-JS.v1.4.0 §2](./SPEC.CK-LIB-JS.v1.4.0.md)** and remain normative, with one addition:
the bundle root gains **`ck.js`** (the L2 surface). The Dockerfile `COPY ck-*.js index.html /`
already picks it up automatically. Required OCI labels are unchanged except `version=1.4.2`.

The runtime-dependency posture (v1.4.0 §2.4) is unchanged: the RDF/store layers are zero-dependency;
the transport still loads `nats.ws` + `@msgpack/msgpack` from `esm.sh` at module load. The L2
surface adds **no new runtime dependency** — it composes the existing internal layers. Vendoring the
transport to close the air-gapped gap remains forward work (§11).

> **Provenance gate (on ship).** Every digest in [`LATEST.md`](./LATEST.md) MUST verify under
> `gh attestation verify oci://ghcr.io/conceptkernel/ck-lib-js:1.4.2 --repo ConceptKernel/CK.Lib.Js`.
> A 1.4.2 tag MUST pair with the delivered, verifiable artifact — never a spec or tag alone.

---

## 3. ESM export surface (top-level) — the reorganization

The `package.json` `exports` map fixes the public surface. v1.4.2 **promotes the concept-kernel
surface to the root** and **demotes the physical layers to an internal namespace**.

### 3.1 The application surface (the only documented import)

| Subpath | Module | Named exports | Audience |
|---|---|---|---|
| **`.`** | **`ck.js`** | **`CK` (default + named), `ConceptKernel`, `ckOn` (decorator)** | **all application code** |

`import { CK } from '@conceptkernel/cklib'` is the one import an app or LLM-agent harness needs.
Everything an application does is reachable from `CK` and the `ConceptKernel` handle it returns (§4).

### 3.2 The internal layers (referenced in; tooling/infrastructure only)

These exist for tooling, dictionary infrastructure, renderers, and tests — **not** application
logic. They are documented as internal; an application that imports them is non-conformant (§9).

| Subpath | Module | Named exports |
|---|---|---|
| `./internal/client` | `ck-client.js` | `CKClient`, `msgpackEncode`, `msgpackDecode` |
| `./internal/hex-store` | `ck-hex-store.js` | `CKHexStore` (default), `CKSubject`, `CKView`, `ckBind`, `makeNativeDatasetCore` |
| `./internal/rdf-bridge` | `ck-rdf-bridge.js` | `toQuads` (default), `dataFactory` |
| `./internal/page` … `./internal/sound` | legacy render/page modules | as v1.4.0 §3 (CKPage, CKBus, CKStore, CKRuntime, CKKernel, registry, materializer, shapes, anim) |

### 3.3 Transitional aliases (back-compat, deprecated)

The v1.4.0 public subpaths (`./client`, `./hex-store`, `./rdf-bridge`, `./page`, `./bus`,
`./kernel`, `./registry`, `./runtime`, `./materializer`, `./store`, `./shapes`, `./anim`,
`./sound`) remain present at 1.4.2 as **deprecated aliases** of their `./internal/*` targets, so
existing consumers keep resolving. Importing one SHOULD surface a deprecation notice. Removal is a
MAJOR change (v2.0 — §8, §11). The root `.` no longer resolves to `ck-client.js` (it resolves to
`ck.js`); a consumer that imported the transport via the bare package root MUST switch to
`./internal/client`.

Any identifier not in §3.1–§3.3 is internal and MAY change without a MAJOR bump.

---

## 4. The unified concept-kernel surface (the v1.4.2 centerpiece)

`ck.js` exports `CK`. App code names **concept kernels and concepts (URNs)** — never NATS
subjects, codecs, handles, trace IDs, connections, or store objects.

```js
import { CK } from '@conceptkernel/cklib';

const task = await CK.activate('pgCK.Task');          // §4.1 — one line replaces v1.4.0's five
const t    = await task.create('Task', { title: 'Rotate SPIFFE SVIDs', priority: 4 });  // §4.2
await task.update(t.id, { lifecycle_state: 'done' });                                    // §4.2
const open = await task.list('Task', { lifecycle_state: 'in_progress' });                // §4.2
```

The five-line transport-naming bootstrap of v1.4.0 §5 (`new CKClient` → `new CKHexStore` →
`connect` → two `on(... ) => insert`) collapses into a single `CK.activate(...)`. **Zero physical
tokens** appear in the lines above.

### 4.1 Come to life — `CK.activate(kernel, opts?) → Promise<ConceptKernel>`

`activate` brings a concept kernel to life and returns its handle.

- **`kernel`** — a kernel name (`'pgCK.Task'`) or kernel URN (`'ckp://Kernel#pgCK.Task'`); both
  forms MUST be accepted and normalized.
- **`opts`** (all optional; the common case is zero-config from bundle/env) — transport endpoint(s),
  auth token / Keycloak realm, anonymous flag, and the L1 store options (`replaceBySubject`,
  `dedupBySeq`, `recentCapacity`, …) passed through to the internal `CKHexStore`. No option exposes
  a NATS subject.
- **What it does internally (all hidden):** constructs the L0 `CKClient`, opens the connection,
  constructs the L1 `CKHexStore`, wires `on('event'|'result') → insert`, subscribes the kernel's
  event scope (`event.kernel.<K>.>`), and — when pgCK's `snapshot.bodies` is reachable — hydrates
  current state via bulk replay. The returned handle is *live*: its local mirror is current and it
  is subscribed to its scope.
- **Resolves** when the connection is open and (when available) hydration completes. **Rejects** on
  a transport/auth failure that prevents bring-up — transport-layer failures bubble up unchanged
  (the surface hides NATS as a *vocabulary*, not as a *failure mode*; §4.8).

### 4.2 Manage instances — `create` · `update` · `list` · `get`

Every write is **seal-backed** (pgCK SHACL gate → HMAC ledger → proof, one transaction, rollback on
non-conformance). The kernel never writes SQL or quads.

| Handle method | Resolves to (pgCK verb) | Returns |
|---|---|---|
| `k.create(type, body)` | `task.create` / `kernel.create` / `edge.create` per `type` | `{ id, verified, proof_digest }` |
| `k.update(id, patch)` | `task.update` | `{ id, verified, proof_digest }` |
| `k.list(type, filter?)` | `instances.list { type, … }` | `instance[]` (from mirror; `fetch`-backed when absent) |
| `k.get(id)` | local mirror first; `instance.get { id }` on miss | `ConceptInstance \| null` |
| `k.link(source, predicate, target)` | `edge.create { source, predicate, target }` | `{ id, verified, proof_digest }` |
| `k.notify(to, predicate, body)` | `notify { from, to, predicate, body }` | `{ id, verified, proof_digest }` |

> **The operation→verb map resolves the dotted-verb limitation.** v1.4.0 §5.3 noted that L1
> `invoke('ckp://Action#K.verb')` last-dot-splits and **cannot express dotted pgCK verbs** like
> `task.create` / `edge.create`. The L2 surface MUST map each operation to its pgCK verb through an
> **explicit operation→verb table**, not by parsing an action-URN. Dotted verbs are therefore fully
> expressible at L2; the action-URN ambiguity stays confined to the internal L1 path.

Retirement is a **sealed retraction**, not a delete — *"You cannot unseal a sealed fact. You can
only seal a retraction."* (`VISION.v3.8.1` §2.1). Object refs are `{"@id"}` id-nodes per the
in-flight v3.8 schema change (§11).

### 4.3 Read reactively — `view` · `urn` · `bind` (URN-native, promoted from L1)

These reads are already *concept-level* (they name URNs, never subjects), so they belong on the
handle unchanged from L1 semantics (v1.4.0 §5.3). They carry no physical token.

| Handle method | Purpose |
|---|---|
| `k.view(urn, opts?)` | reactive `CKView`: `.exists()/.get()/.edges()`, `.on('change', {added,removed})` (microtask-batched), `.fetch()`, `.dispose()` |
| `k.urn(urn)` | synchronous `CKSubject \| null` (pure read; no fetch, no allocation) |
| `k.bind(urnPattern, fn, opts?)` / `k.bindOnce(...)` | dispatch on URN pattern after ingest: `ckp://Kernel#K`, `ckp://Kernel#K/<verb>`, `ckp://Instance#X`, `ckp://Edge#P`, `*` |

`CKView` / `CKSubject` shapes are as v1.4.0 §5.3 (and `SPEC.CK.HEXSTORE.v3.8.1` §6–§7). The handle
re-exports them; an application never constructs a `CKHexStore` to obtain them.

### 4.4 Validate — `k.validate(instanceOrBody) → Promise<report>`

Validation is the kernel's conscience (pgCK `ckp.validate`, the gate inside every seal). `validate`
asks pgCK whether a body conforms **before** a write is attempted.

- Resolves with `{ conforms: boolean, violations?: [...] }`. Until pgCK ships a field-level
  `validate_report` (§11), `violations` is absent and `conforms` is boolean-grade.

### 4.5 Confirm proof-of-work — `k.confirm(item, { tool, result, proof }) → Promise<…>` (gated)

When a kernel's tool finishes work, the kernel **seals a proof** of what was done, by which tool,
under whose authority (the governed Delivery → Validation → Proof chain). Until pgCK ships a
first-class `confirm`/`attest` verb (§11), this MUST be implemented over `task.update
{ lifecycle_state:'done' }` plus the seal's proof, and MUST present the same handle signature so app
code does not change when the verb lands.

### 4.6 Collaborate — `k.behave(predicate, target)` + `k.on(predicate, fn)` (gated)

A kernel reaches a peer by **emitting a predicate that is a behaviour**; the same predicate means
the same behaviour in every federated space.

```js
await task.behave('delegates', { to: 'Delvinator.ThreadScout', about: t.id });
task.on('confirms', ({ from, about, proof }) => { /* originator sees sealed result */ });
```

- `behave(predicate, …)` resolves to `edge.create` (+ `notify`) carrying the behaviour predicate.
- `on(predicate, fn)` subscribes a behaviour predicate (`delegates`/`confirms`/`notifies`/
  `composes`/`reads_from`/`links`).
- **Gated:** until the behaviour-predicate set is frozen in `core.ttl` (pgCK; §11), `behave()`/`on()`
  run on `edge.create`+`notify` with client-side predicate routing. The handle signature is stable
  across the freeze.

### 4.7 Lifecycle — `k.close()`

`k.close()` (alias `k.dispose()`) tears down the kernel: disposes live views, removes binds,
unsubscribes, and closes the internal transport. After close, handle methods MUST reject/throw.

### 4.8 What is reachable, and what is hidden (the conformance teeth)

**Reachable from app code:** `CK.activate`; on the handle — `create`, `update`, `list`, `get`,
`link`, `notify`, `validate`, `confirm`, `behave`, `on`, `view`, `urn`, `bind`, `bindOnce`, `close`;
the `ckOn` decorator; `CKView` / `CKSubject` / `ConceptInstance` value types.

**NOT reachable from app code (MUST require an `./internal/*` import to touch):** `CKClient`,
`new CKHexStore`, `connect()`, `insert()`, `ck.send()`, any NATS subject string, `Ck-Seq`,
dictionary handles, `trace_id` plumbing, codec selection, connection objects. The L2 surface
**leaks no L0/L1 token** (conformance per [`SPEC.CKP.v3.8.1` §7](./ref-SPEC.CKP.v3.8.1.md)).

> **Hiding NATS without lying about it.** NATS does not go away — it is the carrier. App authors
> describe their world as concept kernels and concepts; the surface does the wire work.
> Transport-layer failures (auth, connection drop, codec) bubble up **unchanged** — the surface does
> not disguise a connection drop as a concept-layer problem. Store log lines SHOULD name the
> concept/URN first and the NATS subject in parentheses for debuggability, without making subjects
> part of the contract.

### 4.9 Decorator form — `@ckOn(...)`

For environments with Stage-3 decorators, `@ckOn('ckp://Kernel#pgCK.Task/sealed')` on a method binds
it through the handle found on a conventional field (`this.kernel`, `this.ck`, `this._ck` in that
order). The function form `k.bind(urn, fn)` is always available and is the canonical surface; the
decorator is sugar. (This is the L2-handle analogue of L1's `ckBind`, v1.4.0 §3.)

---

## 5. The internal layers (normative-internal; carried by reference)

The L2 surface MUST be implemented over the existing internal layers, whose behavior is **unchanged**
and normative at their v1.4.0 sections:

- **L0 — `CKClient`** (wire protocol, typed envelope): [SPEC.CK-LIB-JS.v1.4.0 §4](./SPEC.CK-LIB-JS.v1.4.0.md).
  Subject grammar, headers, codec, dedup, dictionary, auth, `send`, reconnect — all as shipped.
- **L1 — `CKHexStore`** (graph mirror, projection, URN-native reads/writes): [SPEC.CK-LIB-JS.v1.4.0 §5](./SPEC.CK-LIB-JS.v1.4.0.md)
  and `_WIP/ck-hex-store/SPEC.CK.HEXSTORE.v3.8.1.md`. The L2 `create/update/list/validate/confirm/
  behave` operations dispatch through L1's `invoke`/`ask` (trace-correlated request/reply over
  `ck.send`); the L2 `view/urn/bind` reads are L1's reads, re-exported on the handle.
- **RDF bridge — `ck-rdf-bridge.js`**: [SPEC.CK-LIB-JS.v1.4.0 §6](./SPEC.CK-LIB-JS.v1.4.0.md). Internal.
- **Legacy render/page surface**: [SPEC.CK-LIB-JS.v1.4.0 §7](./SPEC.CK-LIB-JS.v1.4.0.md). Internal;
  extraction candidate to CK.Lib.Xr under the thin-core direction (§11).

v1.4.2 introduces **no new wire behavior**. The transitional/inert surfaces documented at v1.4.0 §10
(short-form subjects, inert binary-delta path, predicate-tail ref whitelist, `NotShippedYet`
affordance wrappers, esm.sh transport imports, `on('insert'…)` diagnostics) persist unchanged inside
the internal layers and are not part of the L2 application surface.

---

## 6. Runtime environment requirements

As v1.4.0 §8: modern evergreen browser (ES2020+ modules, `WebSocket`, `localStorage`, `fetch`,
`Map`/`Set`/`Promise`, async iterators); HTTPS (or `http://localhost`); reachable NATS WSS endpoint
and Keycloak realm; network access to `esm.sh` (or self-hosted equivalents) for the transport tier;
`Konva` + `anime` globals only if the (internal) rendering surface is used. Stage-3 decorator support
only if `@ckOn` is used. Node.js is not a supported runtime at v1.4.2.

---

## 7. Conformance summary

A **consumer (application)** is conformant iff:

1. It loads modules from a v1.4.2 OCI image whose digest passed `gh attestation verify` (§2.2).
2. **It uses only the §3.1 application surface** (`CK` / `ConceptKernel`) for application logic, and
   imports **no** `./internal/*` module (and no deprecated alias of one) in app code.
3. It activates kernels via `CK.activate` and operates via the §4 handle methods — **never** naming a
   NATS subject, codec, dictionary handle, trace ID, connection, or store object in application code.
4. If it consumes binary events or relies on per-subject ordering, that is handled by the internal
   layers per v1.4.0 §4 — the application does not configure it.

A **pgCK-side runtime** is conformant for the governed-graph path as in v1.4.0 §9. The L2 gated
operations (`validate` field-level, `confirm` verb, `behave`/`on` frozen predicates) reach full
fidelity as pgCK ships the corresponding server side (§11); until then they operate in the
documented degraded-but-honest modes (§4.4–§4.6).

> Tooling, renderers, dictionary infrastructure, and tests MAY import `./internal/*`. That use is
> conformant **for those audiences**; it is non-conformant for application logic.

---

## 8. Transitional & deprecated surfaces (at v1.4.2 — summary)

| Surface | State | Removal/exit |
|---|---|---|
| L1/L0 public subpaths (`./client`, `./hex-store`, `./rdf-bridge`, `./page`, …) | deprecated aliases of `./internal/*` | v2.0 (MAJOR) — §11 |
| Bare root `.` → `ck-client.js` | **removed at 1.4.2** (root is now `ck.js`); transport via `./internal/client` | done |
| `confirm` over `task.update` | gated shim | first-class pgCK `confirm`/`attest` verb |
| `behave`/`on` client-side predicate routing | gated shim | behaviour-predicate freeze in `core.ttl` |
| `validate` boolean-grade | gated | pgCK `validate_report` (field-level) |
| Everything at v1.4.0 §10 (short-form, inert binary, whitelist, `NotShippedYet`, esm.sh, diagnostics) | as v1.4.0, now internal | as v1.4.0 |

These document **what 1.4.2 MUST BE on ship**. None may be relied on as permanent.

---

## 9. Conformance language & change control

Changes to any §1–§8 behavior require a new artifact version with its own built + attested OCI image
(and, when published, npm tarball) per [`PROVENANCE.md`](./PROVENANCE.md). A release tag MUST pair
with a delivered, verifiable artifact — never a spec or tag alone. **While this document is in DRAFT
(target) status it governs the build, not any shipped image.** On the day the 1.4.2 artifact is built
and attested, this document's Status flips to authoritative, it becomes immutable, and v1.4.0 moves to
`_WIP/` history. The next change after that ships as `SPEC.CK-LIB-JS.v<next>.md`.

---

## 10. References

- Operable-interface protocol contract: [`ref-SPEC.CKP.v3.8.1.md`](./ref-SPEC.CKP.v3.8.1.md) §2 (the five operations), §7 (no-leak conformance), §8 (open pgCK gates)
- Predecessor governing spec (carried by reference, immutable): [`SPEC.CK-LIB-JS.v1.4.0.md`](./SPEC.CK-LIB-JS.v1.4.0.md)
- L1 design specs: `_WIP/ck-hex-store/SPEC.CK.HEXSTORE.v3.8.1.md` (URN surface), `SPEC.CK.HEXSTORE.v0.1.md` (wire/projection), `SPEC.HEXSTORE.TESTING-…v3.8.1.md` (stub contract)
- Roadmap (the path that lands this and what follows): [`_WIP/ROADMAP.CK.LIB.JS.v1.5-to-v2.0.md`](./_WIP/ROADMAP.CK.LIB.JS.v1.5-to-v2.0.md) (T‑L2, T‑IFACE)
- Published digests + verification (on ship): [`LATEST.md`](./LATEST.md); per-version delta: [`CHANGELOG.md`](./CHANGELOG.md)

---

## 11. Forward work (informational; NOT part of v1.4.2)

| Direction | Track |
|---|---|
| pgCK `validate_report` (field-level SHACL) → `validate()` returns diagnostics | pgCK ask (§4.4) |
| First-class pgCK `confirm`/`attest` verb → drop the `task.update` shim (§4.5) | pgCK ask |
| Freeze behaviour predicates in `core.ttl` → `behave()`/`on()` runtime-critical (§4.6) | pgCK ask |
| Node / LLM-agent harness binding of the L2 surface (`ck-harness`) | roadmap v1.13 / v1.15 |
| Agent-instruction surface (`SKILL.md` "CK operations for LLM agents") over L2 | roadmap v1.13 |
| Vendor `nats.ws` + `@msgpack/msgpack` → true no-CDN/air-gapped bundle | roadmap v1.10 |
| Minified build + TypeScript types for the L2 surface | roadmap v1.10 / v1.11 |
| Extract legacy render surface → CK.Lib.Xr (thin core; L2 consumes core via `bind('*')`) | roadmap v1.14 |
| **`CKHexStore` standalone-repo graduation** — becomes its own *referenced* library, **still hidden behind the L2 surface** (kept as a future option, not a near-term break) | post-2.0 (§0) |
| Hard-remove the deprecated L1/L0 public subpaths (§3.3, §8) | v2.0 |
| Result-subject confidentiality (the F‑C wildcard leak) addressed below the L2 surface | pgCK session/security thread |

Each item that ships becomes part of the next normative spec. This document does not move once it
flips to authoritative.
