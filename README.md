# CK.Lib.Js — operate concept kernels from JavaScript

**Package:** [@conceptkernel/cklib](https://www.npmjs.com/package/@conceptkernel/cklib) ·
**Substrate:** [pgCK](https://github.com/styk-tv/pgCK) (CKP v3.9) ·
**License:** MIT

A **concept kernel** is a small governed universe of typed facts. Everything in it — the kernel,
every instance, every participant — has a **URN**. You address meaning, never infrastructure: there
are no queues, no topics, no endpoints, no tables anywhere in this surface. Facts you write are
validated against the kernel's sealed shapes, sealed with a cryptographic proof, and delivered as
live events to everyone attached. Facts others write arrive at your handlers the same way. The
kernel is the single source of truth *and* the message bus *and* the audit trail — because in a
concept kernel those are one thing.

A kernel comes to life with one bootstrap call on the substrate. From then on, anything that speaks
JavaScript attaches to it by name.

## Attach and operate

```javascript
import { CK } from "@conceptkernel/cklib";

const tasks = await CK.activate("Tasks");        // attach. that is the whole setup.

// Create something that did not exist a moment ago.
const t = await tasks.create("Task", { title: "Review the Q3 draft", assignee: "ana" });
//  → { ok: true, id: "task-…" } — shape-validated, sealed, proof-chained by the kernel

// React by URN — to this task, to the whole kernel, to a predicate. Things that
// don't exist yet are valid addresses; the handler fires when they come to be.
tasks.bind(`ckp://Instance#${t.id}`, (inst) => render(inst));
tasks.bind("ckp://Kernel#Tasks",     (inst) => refreshBoard(inst));
tasks.bind("ckp://Edge#mentioned",   (inst) => ping(inst));

// Ana attaches from her own browser and drops a message on your task:
//     await tasks.notify(t.id, "mentioned", { text: "deadline moved" });
// Your bind fires, live. And the proof is already waiting:
await tasks.verify(t.id);        // { verified: true, proof_digest: "9202c6…" }
await tasks.provenance(t.id);    // the chain — who did what, in what order
```

## What did *not* happen above

- You never named a queue, topic, connection string, or endpoint. None exist in this API.
- You never wrote a subscription for Ana's message. **Addressing the URN was the subscription.**
- You never validated the payload. The kernel's **sealed shape** did, before the fact could land —
  an invalid write cannot exist.
- You never built an audit trail. **Every fact carries one** from the moment it is created.
- Nobody polled. The seal *is* the event.

## The capability surface

| Capability | Operations | What the kernel guarantees |
|---|---|---|
| Write facts | `create` `update` `link` `transition` `retire` | shape-validated → sealed → proof-chained → emitted. Lifecycle moves are gated by the kernel's sealed state machine — an illegal transition cannot land |
| Read, typed | `get` `query` `reach` `snapshot` | named, grantable reads. There is no query language on this surface — and none to inject |
| Prove | `verify` `provenance` | proof digest and the full chain, for any URN, any time |
| Pre-flight | `validate` | dry-run a body against the sealed shape before writing |
| Address someone | `notify` | a sealed fact that is also a delivered event — messaging with provenance |
| Change the rules | `propose` `vote` `apply` | the schema and verb set evolve by **governance**, not migration |
| Discover | `affordances()` | what *this identity* may do *here* — nothing else is callable |
| React | `bind` `bindOnce` `view` `urn` · `ckOn`/`wireCkOn` | URN-pattern handlers and reactive views fed by the live event scope |
| Derived reads | `doFresh` · `isRecomputing` | server-computed values, fresh-only. While the substrate materializes over budget it answers an honest `recompute_in_progress` — `doFresh` re-polls with backoff (a re-dispatch *joins* the in-flight build); the client never computes, caches-as-answer, or interpolates a value |

All of it rides one closed door — every operation compiles to a governed dispatch
(`k.do(verb, payload)` is the open form for any affordance the kernel declares).

## Identity and participation

Identity is derived from the **verified JWT** on the connection — the client cannot assert who it
is. Every sealed fact carries `created_by`. And "client" means anything: a browser page, a CLI, a
service, an **LLM agent** — they all attach with the same four lines and operate under the same
grants. A fleet of attached agents is *governable*, not merely connected: each one can only do what
the kernel declares and its identity is granted, and everything it does is attributable and sealed.

## Under the hood (you do not need this to use it)

The transport is NATS-over-WebSocket with Keycloak JWT auth, fully **vendored** (`vendor/` —
zero dependencies, zero CDN fetches, runs air-gapped), with Trace-Id-correlated dispatch onto
pgCK's single governed door. Artifacts are CI-built from the tag, SLSA-attested, and byte-verified
(`gh attestation verify oci://ghcr.io/conceptkernel/ck-lib-js:<ver> --repo ConceptKernel/CK.Lib.Js`).
Wire details: [`COMPLIANCE.md`](./COMPLIANCE.md).

```javascript
import { CK, ConceptKernel, ckOn } from "@conceptkernel/cklib";      // the surface above
import { CKClient } from "@conceptkernel/cklib/internal/client";     // transport only (advanced)
import { CKStore }  from "@conceptkernel/cklib/internal/store";      // typed cache only (advanced)
```

## Install

```bash
npm install @conceptkernel/cklib        # npm publish of the 1.5.x client is imminent; today the live channel is the attested OCI bundle below
```

```dockerfile
FROM ghcr.io/conceptkernel/ck-lib-js:1.5.2 AS cklib_source           # attested, byte-verified
COPY --from=cklib_source / /app/cklib/
```

## Release state

| Channel | Version | State |
|---|---|---|
| OCI `ghcr.io/conceptkernel/ck-lib-js` | **`:1.5.2`** | current release — the full surface above; attested + byte-verified (`ck.js` + `ck-client.js` + `ck-store.js` + `vendor/`). See [`LATEST.md`](./LATEST.md) for attested digests. |
| npm `@conceptkernel/cklib` | `1.0.0` | **legacy (CKP v3.5 era) — do not use.** The modern dispatch-only client is the OCI bundle above; npm publish of the 1.5.x client (with provenance) is imminent. |

Treat OCI `:1.4.1`/`:1.4.2` as `:1.4.0` — see `CHANGELOG.md` `[1.4.3]`. Requires pgCK ≥ 0.4 for the
governed `instance.*` surface; pre-CI-E gaps degrade honestly (empty results, never fabricated ones).

## References

[`PROVENANCE.md`](./PROVENANCE.md) · [`LATEST.md`](./LATEST.md) · [`COMPLIANCE.md`](./COMPLIANCE.md) ·
[`CHANGELOG.md`](./CHANGELOG.md) · [pgCK](https://github.com/styk-tv/pgCK) ·
[oci-germination](https://github.com/sporaxis-com/oci-germination)
