# SPEC.CK-OPERATIONS.v1.5.1 — NATS Wire Contract + Subject Grammar

| Field | Value |
|---|---|
| Version | v1.5.1 |
| Date | 2026-06-18 |
| Grounding | `ck-lib-js:1.5.0` (ghcr.io/conceptkernel/ck-lib-js:1.5.0) |
| Status | **Normative wire contract** for all consumers (browser, harness, agent) connecting to a pgCK concept kernel over NATS-WSS |
| Visibility | Public consumer documentation — distributed artifacts (npm/OCI) never carry a spec |

This document canonicalises the **NATS subject grammar, headers, codec, and dispatch routing** that
`ck-client.js` (L0 transport) implements at v1.5.0. It is the reference any consumer needs to produce
or consume messages on the concept-kernel data plane.

Companion specs: `SPEC.CK-LIB-JS.v1.5.0` (JS handle surface) · `SPEC.CKP.v3.9` (role/seal contract).

---

## 1. One door, one plane

**NATS is the only data-plane door.** There is no REST API for instance operations; auth bootstrap
uses Keycloak HTTP only. Every dispatch compiles to one NATS publish; every reply arrives on a
subscribed subject.

The four-tuple carried by every dispatch is:

```
⟨ verb, kernel_urn, payload, identity ⟩
```

- `verb` — the affordance name (e.g. `instance.create`, `agent.execute`)
- `kernel_urn` — the target kernel's full URN (e.g. `ckp://Kernel#pgCK.Task`)
- `payload` — verb-specific body; no identity fields (see §4)
- `identity` — the verified JWT the connection carries; **never in the payload**

At v1.5.0 this four-tuple is split across the NATS subject (`verb`, `kernel_urn` derived from it),
the message body (`verb` + `payload`), and NATS headers (`Ck-Verb`, `Ck-Kernel`, `Trace-Id`).
The `v3.9` dispatch mode collapses all four into a single `ckp.dispatch` ingress (§6).

---

## 2. Subject grammar — publish (client → pgCK)

### 2.1 Short-form (deprecated)

```
input.<K>
```

`<K>` = kernel name (e.g. `pgCK.Task`). Published alongside every `send()` call for backwards
compatibility. **Removed at v2.0.** New consumers must not rely on it.

### 2.2 Long-form canonical (v3.8 default)

```
input.kernel.<K>.action.<verb>
```

Published on every `dispatch(verb, kernelUrn, …)` call. `<K>` is the resolved kernel name
(`kernelUrn.replace('ckp://Kernel#', '')`); `<verb>` is the full affordance name (e.g.
`instance.create`, `concept.match`).

**Routing rule — governance door vs target kernel:**

| Verb pattern | Publish subject |
|---|---|
| All governed verbs (default) | `input.kernel.<GOV>.action.<verb>` |
| `agent.*` / `execute` / `presence` / `say` | `input.kernel.<TARGET-K>.action.<verb>` |

`<GOV>` defaults to `pgCK` (config: `gov`). Governed verbs are: all `instance.*`, `kernel.*`,
`instances.*`, `affordances`, `concept.match`. Delegated verbs (`agent.*`) ride the **target
kernel's** subject because the harness (not pgCK's relay) is the subscriber.

The activated `kernelUrn` travels in the `Ck-Kernel` header on every dispatch regardless of
which subject is used.

### 2.3 v3.9 four-tuple ingress (opt-in)

```
ckp.dispatch
```

Enabled with `dispatchMode: 'v3.9'`. Body is `{ verb, kernel_urn, payload }` — identity is
server-derived from the connection (TR-02; no caller-asserted identity field). This collapses
the per-verb subject shim; CE-B-2 will flip this to default when pgCK confirms CI-B.

---

## 3. Subject grammar — subscribe (pgCK → client)

### 3.1 Result subjects (dispatch replies)

| Subject | Form | Notes |
|---|---|---|
| `result.<K>` | short | Legacy alias; dual-subscribed; removed v2.0 |
| `result.kernel.<K>.>` | long wildcard | Catches `result.kernel.<K>.<verb>` for all verbs |
| `result.kernel.<GOV>.>` | gov door | Subscribed when `gov ≠ kernel`; carries governed-verb replies (G5a fix) |

Dispatch replies are correlated to the originating `dispatch()` call via `Trace-Id` (§4.1).
When a pending `Trace-Id` is found on a result message the promise resolves immediately.

### 3.2 Event subjects (sealed kernel events)

| Subject | Form | Notes |
|---|---|---|
| `event.<K>` | short | Legacy alias; dual-subscribed; removed v2.0 |
| `event.kernel.<K>.>` | long wildcard | Catches all sealed events on the kernel |
| `event.kernel.<K>.error` | error channel | Auto-subscribed; error events for this kernel |

### 3.3 Dictionary subject (internal — auto-subscribed)

```
event.kernel.Dictionary.>
```

Internal IRI handle-table maintenance. The client listens for `.v_bumped` (incremental patch) and
`.snapshot` (full table reload) to keep its local handle→IRI map current. **Not a user-facing
channel** — never emit to application consumers.

### 3.4 Admin / metrics (authenticated roles)

| Subject | Direction | Access |
|---|---|---|
| `admin.<K>` | pub | auth (JWT required) |
| `metrics.<K>` | sub | auth (JWT required) |

### 3.5 Harness-specific subjects

These are the four concrete NATS subjects the harness uses as a **Tier-2 delegated executor**:

| Subject | Direction | Meaning |
|---|---|---|
| `input.kernel.<K>.action.execute` | pub → harness | Dispatch an `agent.execute` task to the harness |
| `input.kernel.<K>.action.presence` | pub → harness | Presence ping / availability check |
| `input.kernel.<K>.action.say` | pub → harness | Collaboration chat relay |
| `event.kernel.<K>.harness.online` | harness → sub | Harness connected and ready |
| `event.kernel.<K>.harness.started` | harness → sub | Task execution begun |
| `event.kernel.<K>.harness.done` | harness → sub | Task complete; typed result attached |
| `result.kernel.<K>.execute` | harness → sub | Typed execute result (SEMANTIC OUT) |

The harness subscribes `input.kernel.<K>.action.>` to receive all delegated verbs; it publishes
lifecycle events on `event.kernel.<K>.harness.*` and the typed result on
`result.kernel.<K>.execute`.

> **Routing guarantee:** `agent.*` verbs are published to `input.kernel.<TARGET-K>.action.<verb>`
> (§2.2) — they bypass the governance door entirely and land directly on the harness's subscribed
> subject. The `Ck-Kernel` header carries the full URN so the harness can confirm the target.

---

## 4. NATS headers

Every published message carries these NATS headers:

| Header | Set by | Value | Notes |
|---|---|---|---|
| `Trace-Id` | client | UUID v4 | Correlation ID; echoed in reply; used to resolve pending dispatch promises |
| `Ck-Verb` | client | affordance name | E.g. `instance.create`; allows server/relay to route without body parse |
| `Ck-Kernel` | client | full kernel URN | E.g. `ckp://Kernel#pgCK.Task`; set on every dispatch |
| `Ck-Seq` | server/client | integer string | Per-subject sequence counter; used for at-most-once dedup; absence = no dedup |
| `Content-Encoding` | publisher | `msgpack` or absent | Absent = JSON; `msgpack` = binary MsgPack body |

### 4.1 Trace-Id correlation

1. Client generates a UUID `traceId` and stores `{ resolve, reject, timer }` in `_pending`.
2. Client publishes with `Trace-Id: <traceId>` header.
3. On any `result` message: client reads `Trace-Id` header (fallback: `data.trace_id`).
4. If `traceId` is in `_pending` → resolve the promise; clear timeout; delete from map.
5. Timeout default: **15 000 ms** (configurable via `dispatchTimeout`).

### 4.2 Ck-Seq dedup

Per-subject dedup window: 1 000 sequences per subject (`DEDUP_MAX_PER_SUBJECT`). A message whose
`(subject, Ck-Seq)` pair has already been seen is silently dropped. Graceful: a message with no
`Ck-Seq` header passes through without dedup.

---

## 5. Codec

| Codec | Detection | Direction |
|---|---|---|
| **JSON** (default) | no `Content-Encoding` header / any other value | both |
| **MsgPack** | `Content-Encoding: msgpack` | both |

The client decodes inbound messages transparently using `Content-Encoding`; it encodes outbound
publishes as JSON (the relay encodes replies in MsgPack; browsers receive and decode both). Vendored
libraries: `./vendor/nats.ws.js` + `./vendor/msgpack.js` — **zero runtime CDN fetch** (air-gapped
since v1.4.2).

---

## 6. Dispatch modes

| Mode | Config key | Default | Subject used | Body shape |
|---|---|---|---|---|
| `v3.8` | `dispatchMode: 'v3.8'` | **yes** | `input.kernel.<GOV or K>.action.<verb>` | `{ action: verb, ...payload }` |
| `v3.9` | `dispatchMode: 'v3.9'` | no | `ckp.dispatch` | `{ verb, kernel_urn, payload }` |

The `v3.8` mode is a **per-verb subject shim** that preserves compatibility with pre-CI-B pgCK
relays that bind each verb to a separate subject. **CE-B-2** (post-v1.6.0) will flip the default
to `v3.9` once pgCK confirms the four-tuple ingress is the sealed registry entry point.

Consumers that need the `v3.9` path today: pass `dispatchMode: 'v3.9'` and
`dispatchIngress: 'ckp.dispatch'` (default) to `CKClient`.

---

## 7. Connection and auth

### 7.1 Anonymous (no JWT)

On `connect()` the client establishes an anonymous NATS connection. Anonymous connections have
publish/subscribe rights to the `anon`-access subjects listed in §2–§3. No identity is asserted.

### 7.2 Authenticated (JWT)

`login(username, password)` fetches a Keycloak JWT via HTTP POST:
```
POST <authEndpoint>/realms/<realm>/protocol/openid-connect/token
Content-Type: application/x-www-form-urlencoded
grant_type=password&client_id=<clientId>&username=…&password=…
```
On success the client **reconnects** with the JWT as the NATS authenticator. This causes the NATS
server to reissue connection permissions (RBAC upgrade). Auth state is available on `ck.auth`.

Token refresh: automatic on `_maybeRefreshToken()` before every dispatch (5-minute expiry margin).
On refresh, the client reconnects to update NATS permissions.

### 7.3 Endpoints — no hardcoded defaults

All endpoints must be passed explicitly or derived from `globalThis.location` (browser only):

| Config key | Derived from | Notes |
|---|---|---|
| `wssEndpoint` | `wss://<location.host>/wss` | NATS WSS; must be explicit in Node |
| `authEndpoint` | `<protocol>//<location.host>` | Keycloak base |
| `realm` | none | Keycloak realm; required for login |
| `clientId` | `'ck-browser'` | Keycloak client_id |

---

## 8. Typed envelope (inbound message shape)

Every message delivered to `ck.on('result', …)` / `ck.on('event', …)` carries:

```js
{
  subject,      // raw NATS subject string
  headers,      // decoded header map { 'Trace-Id': '…', 'Ck-Seq': '…', … }
  data,         // decoded body (JSON or MsgPack → plain object)
  traceId,      // headers['Trace-Id'] || data.trace_id || ''
  kind,         // 'result' | 'event' | 'broadcast' | 'error'
  subjectIri,   // data['@id'] (pgCK seal projection) or null
  conceptType,  // data['type'] ?? data['@type'] or null
  kernel,       // kernel name parsed from long-form subject, or null
  verb,         // last segment of long-form subject (e.g. 'sealed', 'create'), or null
}
```

`subjectIri` and `conceptType` are pgCK seal-projection fields stamped onto every sealed write
reply. `kernel` and `verb` are parsed from the long-form subject grammar
`<kind>.kernel.<K>.<verb>` (short-form subjects yield `null` for both).

---

## 9. v1.5.0 topic-def table (full ACL surface)

Complete set of NATS topics a `CKClient` with a kernel configured registers against:

| Subject pattern | Direction | Access | Purpose |
|---|---|---|---|
| `input.<K>` | pub | anon | Short-form publish (deprecated) |
| `input.kernel.<K>.action.>` | pub | anon | Long-form dispatch (canonical) |
| `result.<K>` | sub | anon | Short-form result (deprecated) |
| `result.kernel.<K>.>` | sub | anon | Long-form result wildcard |
| `event.<K>` | sub | anon | Short-form event (deprecated) |
| `event.kernel.<K>.>` | sub | anon | Long-form event wildcard |
| `event.kernel.<K>.error` | sub | anon | Per-kernel error events |
| `event.kernel.Dictionary.>` | sub | anon | IRI handle table (internal) |
| `result.kernel.<GOV>.>` | sub | anon | Gov-door results (when gov ≠ kernel) |
| `admin.<K>` | pub | auth | Admin operations |
| `metrics.<K>` | sub | auth | Metrics stream |

---

## 10. Constraints (MUST / MUST NOT)

- **MUST NOT** put identity in the payload; the connection carries it (§1).
- **MUST NOT** name a NATS subject in application-layer code (verb names are the surface; subjects
  are transport internals handled by `CKClient`).
- **MUST NOT** subscribe `input.*` subjects (publish-only; subscribing input is an operator
  concern, not a client concern).
- **MUST** pass `wssEndpoint` explicitly in any non-browser context (Node, harness).
- **MUST** use the long-form `input.kernel.<K>.action.<verb>` for any new producer; the short-form
  is removed at v2.0.
- **MUST NOT** publish on `event.kernel.<K>.*` from the client — events are sealed by pgCK and
  emitted from the server side; the exception is the harness publishing lifecycle events on
  `event.kernel.<K>.harness.*` (its delegated plane).
