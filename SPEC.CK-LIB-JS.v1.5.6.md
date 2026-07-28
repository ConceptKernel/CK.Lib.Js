# SPEC.CK-LIB-JS.v1.5.6 — CK.Lib.Js Normative Specification

| Field | Value |
|---|---|
| Version | v1.5.6 |
| Date | 2026-07-28 |
| Status | **Released — SLSA-attested + byte-verified** |
| Protocol | **CKP v3.9.2** (omission-restoration of v3.9.1 — see framing) |
| Grounding | `ck-lib-js:1.5.6` · pgCK **v0.4.24 (pg18)** · pgRDF **v0.6.20 (pg18)** · `ociger-ck-allinone` **v0.7.32** (broker admittance) |
| Supersedes | `SPEC.CK-LIB-JS.v1.5.5` (kept for history) |

> **v3.9.2 framing (every v3.9.2 doc repeats this):** v3.9.2 is an **omission-restoration + surface-naming**,
> **not a new epoch.** v3.9 is locked and carried verbatim — no ring added, no Ring-1 primitive, no seal
> semantics changed, invariants I1–I12 / P1–P10 unchanged, no behaviour moves. It restores (1) the
> **CK·TOOL·DATA teleology** and (2) names the **harness contact point** — of which this client is the
> reference instance (it attaches hosts/tools/agents to the kernel and holds no authority of its own).

**What v1.5.6 is:** one client-side addition over v1.5.5 — the **identity-scoped dispatch subject** (#11):
a *verified* connection publishes governed dispatches on the broker-enforced id segment so the seal records
the real `created_by` and the delivered event carries the true `by:`. The client still **never asserts
identity.** Carries v1.5.5's Layer 1a ergonomics + `msg.by` unchanged. Dispatch-only floor unchanged.

> **Not in v1.5.6:** Concept Kernel Notation (CKN) — a **v3.10 draft/roadmap** exercise, not a v3.9.2
> feature. This client advertises the governed verb surface only.

---

## 0. Critical alignment

| Component | Repo | Aligned version (v1.5.6) | Role |
|---|---|---|---|
| **CK.Lib.Js** (this) | `ConceptKernel/CK.Lib.Js` | `1.5.6` | JS client — authenticate + dispatch |
| **pgCK** | `styk-tv/pgCK` | `0.4.24` (pg18, `-nats` build) | substrate — governed verbs, seal, server-derived identity + broker-owned admittance |
| **pgRDF** | `styk-tv/pgRDF` | `0.6.20` (pg18) | engine — RDF/SPARQL/SHACL under pgCK |
| **ck-allinone bundle** | `sporaxis-com/oci-germination` | **v0.7.32** (trixie, broker admittance live) | the runnable substrate the client verifies against |

cklib ships **`FROM scratch`** (`ckp:static`: vendored JS only, no native code, no glibc) — the trixie /
glibc-2.41 base of the substrate is transparent to it.

---

## 1. Floor (unchanged from v1.5.0)

Dispatch-only, no RDF/quad/SPARQL/query engine. Three vendored, air-gapped modules: `ck.js` (L2),
`ck-client.js` (L0 NATS-WSS + JWT), `ck-store.js` (L1 typed cache + reactive reads).

**Identity (v3.9.2 δ / TR-02) — never client-asserted:** the browser holds the OIDC JWT; the client
presents it on the upgraded NATS-WSS connection (`login()` → token → reconnect) and sends only
`{verb, kernel_urn, payload}` per message — **there is no identity field to set.** The server derives the
requester from the *verified connection* and stamps `created_by`; a forged payload identity is ignored.

---

## 2. Activate + dispatch

```js
const k = await CK.activate('pgCK.Task', { wssEndpoint: 'wss://host/wss', realm: 'myrealm', gov: 'pgCK' });
await k.login('alice', '••••••');    // → verified connection
```

### 2.1 Identity-scoped dispatch subject (v1.5.6, #11)

When the connection is **verified**, governed dispatches publish on the **broker-enforced** id segment:

```
input.kernel.pgCK.id.<sub>.action.<verb>
```

- `<sub>` is the connection's **own** verified identity, surfaced from its token (via the handle) — **not a
  client claim.** The broker permits *only* the connection's own id; a forged segment is **denied** and
  never seals. So the dispatch seals the real `created_by`, and delivered events carry the true `by:`.
- **Anonymous** connections (and delegated `agent.*` verbs) use the legacy `input.kernel.pgCK.action.<verb>`
  — which seals **anonymously** (back-compat). Publishing on an id you don't hold does *not* attribute to
  it — verification is the broker's, never the client's.
- **Client contract unchanged:** the payload is still `{verb, kernel_urn, payload}` with no identity field;
  the id segment is *addressing the broker already permits*, formed from the connection's own context — the
  client neither asserts nor verifies identity. (The verification mechanism is operator/substrate — out of
  scope here.)

Everything else in §3 (operations) and §4 (`msg.by`, derived reads, governance, ergonomics) is exactly as
v1.5.5.

---

## 3. Handle methods (unchanged from v1.5.5)

**Writes** — `create` → callable typed `Ref` (`.urn`/`.local` + bound `.transition`/`.update`/`.link`/
`.verify`/`.get`); `transition` → lossless `{from,to,source,allowed?}`; `update`/`link`/`notify`/`retire`.
**Reads** — `get`, `query` (short-key filters → declared IRIs), `reach`, `snapshot`, `match`.
**Proof** — `validate` (W3C SHACL), `verify`, `provenance`.
**Derived reads** — `isRecomputing(reply)` + `k.doFresh(verb, payload, opts?)` (honest `recompute_in_progress`,
fresh-only; verb-generic).
**Governance** — `propose`/`vote`/`apply` (stable `.iri`) + single-actor `k.govern`/`k.setTransitionMap`.
**Discovery** — `affordances()`, `do()`.

### 3.x Reactive reads + the sender surface (`msg.by`)
`k.bind` / `k.bindOnce` / `k.view` / `k.urn`. Every delivered event carries **`msg.by`** (server-attributed
sender, `urn:ckp:participant:<id>`) + **`msg.seq`** (ledger `Ck-Seq`), **read-only** — the client never
asserts, verifies, or derives it; `null` when absent (never fabricated). As of pgCK 0.4.24 the `by:` a
verified dispatch produces is **cryptographically un-forgeable end-to-end** — no client change required.

---

## 4. Exports
`ck.js`: `CK`, `ConceptKernel`, `normalizeKernel`, `isRecomputing`, `ckOn`, `wireCkOn` ·
`ck-store.js`: `CKStore`, `CKView`, `CKSubject`, `ckBind`, `instanceUrn`, `instanceType`, `instanceEdges` ·
`ck-client.js`: `CKClient`.

---

## 5. What is NOT in v1.5.6
**CKN / notation** — v3.10 draft/roadmap, out. Roadmap: `dispatchMode:'v3.9'` default · `task.*` alias
retirement · minified build + TypeScript declarations · genome-derived enums.

## 6. Known items
| Item | Status |
|---|---|
| server-derived identity — verified requester on seal + `by` on events | ✅ pgCK 0.4.24; client reads `msg.by` |
| id-scoped dispatch subject | ✅ v1.5.6 — client builds it from the verified connection; broker-enforced |
| snapshot — verified-identity hydration | ⏳ honest-degrade (`[]`) until granted |

## 7. Transport reference
`SPEC.CK-OPERATIONS.v1.5.1.md`. Governed verbs → `input.kernel.pgCK.action.<verb>` (anonymous) or
`input.kernel.pgCK.id.<sub>.action.<verb>` (verified); events → `event.kernel.<K>.<entity>.<verb>`;
headers `Trace-Id`, `Ck-Verb`, `Ck-Kernel`, `Ck-Seq`, `by`, `Content-Type`; codec JSON / MsgPack.
