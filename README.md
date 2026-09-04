# CK.Lib.Js

**Attach to a concept kernel from JavaScript. Address meaning, never infrastructure.**

A concept kernel is a small governed universe of typed facts. Everything in it — the kernel,
every instance, every participant — has a URN. There are no queues, no topics, no endpoints and
no tables anywhere in this surface.

```javascript
import { CK } from "/cklib/ck.js";

const tasks = await CK.activate("tasks");        // attach. that is the whole setup.

const t = await tasks.create("Task", { title: "Review the Q3 draft", assignee: "ana" });
//  → shape-validated, sealed, proof-chained — by the kernel, before it could land

tasks.bind(`ckp://Instance#${t.id}`, render);    // react by URN
await tasks.verify(t.id);                        // { verified: true, proof_digest: "9202c6…" }
```

## What did not happen there

- You never named a queue, topic, connection string or endpoint. **None exist in this API.**
- You never wrote a subscription. **Addressing the URN was the subscription.**
- You never validated the payload. The kernel's sealed shape did — an invalid write cannot exist.
- You never built an audit trail. Every fact carries one from the moment it is created.
- Nobody polled. **The seal is the event.**

## The shape of it

| | |
|---|---|
| **Write** | `create` `update` `link` `transition` `retire` — validated → sealed → proof-chained → emitted |
| **Read** | `get` `query` `reach` `snapshot` — named, grantable reads. No query language on this surface, so none to inject |
| **Prove** | `verify` `provenance` — the digest and the full chain, for any URN, any time |
| **Govern** | `propose` `vote` `apply` — the schema and verb set evolve by governance, not migration |
| **Discover** | `affordances()` — what *this identity* may do *here*. Nothing else is callable |
| **Adopt** | `adoption.recorded` `dryRun` `adopt` `supersede` — a module's digest is read off the door, never typed; the door's own dry-run and seal verdicts ride on the receipt |

Every operation compiles to one governed dispatch through one door.

## Identity

Identity comes from the **verified JWT on the connection** — the client cannot assert who it is,
and every sealed fact carries who made it. "Client" means anything: a browser page, a CLI, a
service, an LLM agent. They attach the same way and operate under the same grants, which is what
makes a fleet of agents *governable* rather than merely connected.

## Getting it

Two channels, both attested. **npm is not one of them.**

- **The door's own `/cklib/`** — same origin as the kernel it talks to, version-affine with the
  substrate behind it. This is the normal case: the deployment serves its own client.
- **The attested OCI bundle** — `ghcr.io/conceptkernel/ck-lib-js`, pinned **by digest** in
  production, with `gh attestation verify` in your build gate. Current tag and per-arch digests:
  [`LATEST.md`](./LATEST.md).

> ⚠ `@conceptkernel/cklib@1.0.0` sits on the public npm registry from an early publish and
> `latest` still resolves to it. **It is not a supported artifact and has none of the security
> work.** Do not install it. Publishing is disabled deliberately, not pending.

## Under the hood

NATS-over-WebSocket with JWT auth, fully vendored — zero dependencies, zero CDN fetches, runs
air-gapped. Replies are *published*, not request-reply, which is why several parties observe one
working surface live rather than each polling their own copy.

Transport, cache and facade are separable if you need them:

```javascript
import { CK }       from "/cklib/ck.js";                  // the surface above
import { CKClient } from "/cklib/ck-client.js";           // transport only (advanced)
import { CKStore }  from "/cklib/ck-store.js";            // typed cache only (advanced)
```

## Repository

[`CHANGELOG.md`](./CHANGELOG.md) — what changed, per version ·
[`LATEST.md`](./LATEST.md) — CI-written release state ·
[`PROVENANCE.md`](./PROVENANCE.md) — build provenance and release policy ·
[`tests/README.md`](./tests/README.md) — how this is verified against a live door

MIT.
