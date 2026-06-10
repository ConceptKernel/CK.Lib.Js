# CK.Lib.Js — CKP NATS WSS Client (stripped)

**Version:** 1.4.1
**Status:** stripped intermediary — client RDF tier removed; JWT/NATS transport unchanged
**Package:** [@conceptkernel/cklib](https://www.npmjs.com/package/@conceptkernel/cklib)

A minimal JavaScript client for the Concept Kernel Protocol (CKP). It does **one thing**: connect a
browser to the **NATS WebSocket Secure (WSS)** message bus with **Keycloak JWT** auth, dispatch
kernel verbs, and receive results/events. All kernel business logic (affordance resolution, identity
verification, SHACL validation, governed writes, provenance) runs server-side in **pgCK** — the
browser never mutates kernel state directly.

> **v1.4.1 is stripped.** The former client-side RDF tier (`CKHexStore`, the quad store,
> `ck-rdf-bridge`/`toQuads`) and the legacy render/page modules were **removed** — no client RDF,
> no quad surface (aligned to the v3.9 "no pgRDF on the client" direction). The single shipped module
> is **`ck-client.js`** (`CKClient`). The forward, dispatch-only surface is tracked for **v1.5.0**.

---

## Installation

```bash
npm install @conceptkernel/cklib
```

Or consume the OCI static bundle (`ckp:static`): `ghcr.io/conceptkernel/ck-lib-js` — files land at
image root for `COPY --from=cklib_source / dest/`.

## Quick Start

```javascript
import { CKClient } from "@conceptkernel/cklib";          // or "/cklib/ck-client.js" from the bundle

const ck = new CKClient({ kernel: "pgCK.Task" });          // realm/wssEndpoint configurable
await ck.connect();                                         // anonymous; subscribed to result + event

await ck.login("user", "pass");                             // Keycloak JWT upgrade → reconnects with JWT
ck.send({ action: "task.create", title: "…" });            // → input.kernel.pgCK.Task.action.task.create

ck.on("result", (msg) => { /* { subject, headers, data, traceId, kind, subjectIri, conceptType } */ });
ck.on("event",  (msg) => { /* codec-transparent: msg.data is decoded (JSON or MsgPack) */ });
ck.on("status", (s)   => { /* { connection, auth } */ });
```

## Runtime Requirements

- **NATS WSS endpoint** (e.g. `wss://stream.example.com`) — native NATS with a WebSocket listener.
- **Keycloak realm** for JWT auth (`login`/`logout`/auto-refresh; reconnects to refresh server-side ACLs).
- **Browser:** ES2020+ (`WebSocket`, `fetch`, `Promise`, async iterators).
- The transport loads `nats.ws` + `@msgpack/msgpack` from **esm.sh** at runtime (vendoring is tracked).

**Subject grammar** (CKP v3.8, current wire):
```
input.kernel.<Kernel>.action.<verb>     result.kernel.<Kernel>.action.<verb>
event.kernel.<Kernel>.<event>           event.kernel.<Kernel>.error
```
Identity is the **verified JWT** (Envoy/Keycloak); the client never asserts identity — pgCK derives it.

## The single export

```javascript
import { CKClient } from "@conceptkernel/cklib";   // "." and "./client" both resolve to ck-client.js
```

`CKClient` — NATS WSS agent: `connect()`, `send(data)`, `login()/logout()`, `on(event, fn)`,
per-subject dedup (`Ck-Seq`), codec-transparent decode, dictionary sync, auto-reconnect.

## License

MIT — see [LICENSE](LICENSE)

## References

- **Release provenance / verification:** [`PROVENANCE.md`](./PROVENANCE.md), [`LATEST.md`](./LATEST.md)
- **Transport contract + per-version delta:** [`COMPLIANCE.md`](./COMPLIANCE.md), [`CHANGELOG.md`](./CHANGELOG.md)
- **npm:** https://www.npmjs.com/package/@conceptkernel/cklib · **NATS:** https://docs.nats.io
