# CK.Lib.Js — attach JavaScript hosts, tools and agents to a Concept Kernel

**Package:** [@conceptkernel/cklib](https://www.npmjs.com/package/@conceptkernel/cklib) ·
**OCI bundle:** `ghcr.io/conceptkernel/ck-lib-js` (attested) ·
**License:** MIT

A **concept kernel** is a governed semantic substrate: typed instances in a knowledge graph whose
every change goes through a **sealed registry of verbs**, lands with **cryptographic provenance**
(proof digests in a ledger), and is bounded by a **role floor** — identity comes from a verified JWT,
never from the client. The reference substrate is [pgCK](https://github.com/styk-tv/pgCK)
(CKP v3.9 "Critical Isolation"): the entire governance plane lives server-side in Postgres behind one
closed door, `ckp.dispatch`.

**CK.Lib.Js is the JavaScript attach-point.** Any JS host — a browser page, a CLI tool, a service,
an LLM agent — connects over **NATS WebSocket** with **Keycloak JWT** auth and becomes a *governed
participant*: it can only do what the kernel's registry declares and its identity is granted, every
write it makes is sealed, and everything it reads is typed. No query language on the wire, no client
RDF, no client-asserted identity — the client stays small precisely so the governance can't be bypassed.

```javascript
import { CK } from "@conceptkernel/cklib";

const k = await CK.activate("pgCK");                       // attach → connected, governed handle

await k.create("Task", { title: "Ship v3.9" });            // governed write → sealed (proof digest)
const open = await k.query("Task", { lifecycle_state: { eq: "open" } });   // typed read
console.log(k.affordances());                              // what THIS identity may do HERE
```

That is the whole consumption model: **activate a kernel, exercise its affordances.**

## Why "semantically governable"

| You call | The substrate guarantees |
|---|---|
| `k.create / update / link / retire` | registry-routed verb → SHACL-validated → **sealed** with provenance (`proof_digest`, ledger seq) |
| `k.get / query / reach / snapshot` | **typed reads** — named, grantable affordances; no open query surface |
| `k.verify(id)` / `k.provenance(id)` | proof-digest check / PROV chain for any instance |
| `k.propose / vote / apply` (via `k.do`) | schema and verb-set changes go through the **governance plane**, not migrations |
| `k.affordances()` | the kernel's declared verb surface ∩ your identity's grants |
| identity | derived server-side from the **verified JWT** (Envoy/Keycloak); the client cannot assert it |

Agents and tools attach exactly like pages — same four lines. An agent discovers what it may do
(`affordances()`), acts only through governed verbs, and every action it takes is attributable and
sealed. That is what makes a fleet of attached hosts *governable* rather than merely connected.

## Layers (three modules, one direction)

```
ck.js        L2  CK.activate(kernel) → ConceptKernel handle (do / create / query / … / ckOn)
ck-client.js L0  CKClient — NATS-WSS transport, JWT login/refresh, Trace-Id correlated dispatch
ck-store.js  L1  CKStore — typed-instance cache (CKView / CKSubject / ckBind reactivity)
```

```javascript
import { CK, ConceptKernel, ckOn } from "@conceptkernel/cklib";      // the facade (start here)
import { CKClient } from "@conceptkernel/cklib/internal/client";     // transport only (advanced)
import { CKStore }  from "@conceptkernel/cklib/internal/store";      // cache only (advanced)
```

`CK.activate(kernel, opts)` accepts transport options (`wssEndpoint`, `realm`, credentials…) passed
through to `CKClient`, cache options (`replaceById`, `dedupBySeq`, `recentCapacity`), and an
injectable `opts.transport` for tests/harnesses. `ckOn(urn)` / `wireCkOn` bind sealed-event handlers
to URN patterns.

## Hardened by construction

- **Vendored transport** — `nats.ws` + `@msgpack/msgpack` are bundled under `vendor/`; **zero runtime
  CDN fetches**, runs air-gapped.
- **No client RDF/quad tier, no render tier** — removed in v1.4.1 (the "Critical Isolation" strip);
  the attack surface is one transport module plus a typed cache.
- **Attested, byte-verified artifacts** — every OCI release is CI-built from the tag, SLSA-attested,
  and byte-listed against the tagged tree before announcement
  (`gh attestation verify oci://ghcr.io/conceptkernel/ck-lib-js:<ver> --repo ConceptKernel/CK.Lib.Js`).

**Wire (current):** `input.kernel.<K>.action.<verb>` out; results correlated by `Trace-Id` on
`result.kernel.<K>.>` (grammar-agnostic — covers both the v3.8 `.action.` shim and v3.9-clean
subjects). The four-tuple `ckp.dispatch` ingress flip is staged separately (CE-B-2).

## Release state (honest)

| Channel | Version | State |
|---|---|---|
| OCI `ghcr.io/conceptkernel/ck-lib-js` | **`:1.4.3`** | published, attested, **byte-verified stripped** (`ck-client.js` + `vendor/`) — current pin for bundles |
| This tree | `1.5.0` | dispatch-only surface (`ck.js` + `ck-store.js` + dispatch transport) — code-complete; tag gated on the live end-to-end verify vs pgCK v0.4.2 |
| npm `@conceptkernel/cklib` | `1.0.0` | **legacy (CKP v3.5 era, pre-isolation) — do not use for v3.9 work**; `1.5.0` publishes at tag |

Treat OCI `:1.4.1`/`:1.4.2` as `:1.4.0` (pre-strip) — see `CHANGELOG.md` `[1.4.3]` for the
packaging-integrity disclosure.

## Install

```bash
npm install @conceptkernel/cklib        # 1.5.0 on tag; until then prefer the OCI bundle below
```

OCI static bundle (`ckp:static`, Shape A — files at image root for `COPY --from=cklib_source / dest/`):

```dockerfile
FROM ghcr.io/conceptkernel/ck-lib-js:1.4.3 AS cklib_source
COPY --from=cklib_source / /app/cklib/
```

## Runtime requirements

- **NATS WSS endpoint** (native NATS WebSocket listener, e.g. behind Envoy at `wss://<host>/wss`).
- **Keycloak realm** for JWT (`login()`/`logout()`, auto-refresh, reconnect re-applies server ACLs).
- **pgCK ≥ 0.4** for the governed `instance.*` surface (legacy `task.*` aliases resolve during the
  migration window; pre-CI-E gaps degrade honestly — empty results, never fabricated ones).
- Browser/host: ES2020+ (`WebSocket`, `fetch`, async iterators). No other dependencies — everything
  is vendored.

## References

- Provenance & verification: [`PROVENANCE.md`](./PROVENANCE.md) · [`LATEST.md`](./LATEST.md)
- Transport contract & per-version delta: [`COMPLIANCE.md`](./COMPLIANCE.md) · [`CHANGELOG.md`](./CHANGELOG.md)
- Substrate: [pgCK](https://github.com/styk-tv/pgCK) · Bundles: [oci-germination](https://github.com/sporaxis-com/oci-germination) · [NATS](https://docs.nats.io)
