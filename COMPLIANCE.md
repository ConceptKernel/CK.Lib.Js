# CK.Lib.Js Compliance & Requirements

**Version:** 1.1.0  
**Status:** v3.8 alignment (production-ready)  
**Date:** 2026-05-26

---

## Runtime Dependencies

### NATS Connection

CK.Lib.Js requires a reachable NATS WSS endpoint:

- **Protocol:** WebSocket (wss://)
- **Port:** typically 9222 (configurable)
- **NATS version:** v2.14+ (tested against Sporaxis bundle)
- **Example endpoint:** `wss://stream.example.com:9222`

### Subject Families (CKP v3.8 Normative)

CK.Lib.Js publishes and subscribes to these NATS subject families:

| Family | Direction | Purpose | Format |
|--------|-----------|---------|--------|
| `input.kernel.*` | publish | Inbound kernel actions from browser | JSON |
| `result.kernel.*` | subscribe | Action outcomes from pgCK | JSON |
| `event.kernel.*` | subscribe | State change notifications from pgCK | JSON |
| `stream.kernel.*` | subscribe | Optional high-frequency observer feeds | JSON |

**Subject naming convention:**
```
input.kernel.<KERNEL_NAME>.action.<ACTION_NAME>
result.kernel.<KERNEL_NAME>.action.<ACTION_NAME>
event.kernel.<KERNEL_NAME>.<ENTITY>
stream.kernel.<KERNEL_NAME>.observer.<PATH>
```

### Message Format (Core JSON Profile)

All messages use JSON with these top-level fields:

**Inbound (browser → pgCK):**
```javascript
{
  "trace_id": "uuid",                // unique request identifier
  "participant": "browser_session",  // client identity
  "affordance": "urn:ckp:affordance:MyKernel:action_name",
  "payload": { /* action-specific data */ }
}
```

**Outbound (pgCK → browser):**
```javascript
{
  "trace_id": "uuid",               // matches inbound request
  "outcome": "success|rejected|error",
  "proof": null,                     // optional durable proof reference
  "result": { /* action result data */ }
}
```

**Stream/Event (pgCK → browser):**
```javascript
{
  "entity": "urn:ckp:...",          // affected entity URI
  "predicate": "urn:...",           // change predicate (RDF property)
  "object": "value"                 // new value or object
}
```

---

## Compliance Checklist

### v1.1.0 (Current Release)

- [x] Connects to NATS WSS endpoint (nats.ws client)
- [x] Implements `input.kernel.*` → `result.kernel.*` request/reply pattern
- [x] Subscribes to `result.kernel.*` and `event.kernel.*` streams
- [x] Uses Core JSON profile (no binary encoding)
- [x] Preserves `trace_id` and `participant` in all messages
- [x] Compatible with Sporaxis `bundle-pg17-pgrdf-pgck-nats-micro` v0.1.1+
- [x] Compatible with pgCK embedded NATS listener (via WSS bridge)

### Browser Capabilities Required

- ES2020+ (modern browsers, Node.js 18+)
- WebSocket (native or polyfilled)
- JSON serialization/deserialization
- Promise/async-await support

---

## Integration Points

### With Sporaxis OCI Bundle

CK.Lib.Js connects to the NATS WSS listener provided by:

- `bundle-pg17-pgrdf-pgck-nats-micro:v0.1.1+`
- Port: 9222 (default, configurable)
- Subject families: as documented above
- Message format: Core JSON profile

**Example connection:**
```javascript
import { connect } from "nats.ws";

const nc = await connect({
  servers: ["wss://nats-bridge.example.com:9222"],
});

// Subscribe to results
nc.subscribe("result.kernel.MyKernel.action.*", (msg) => {
  const { trace_id, outcome } = msg.json();
  console.log(`Action ${trace_id}: ${outcome}`);
});

// Dispatch action
await nc.request(
  "input.kernel.MyKernel.action.launch",
  JSON.stringify({
    trace_id: "uuid-here",
    participant: "browser_session_xyz",
    affordance: "urn:ckp:affordance:MyKernel:launch",
    payload: { /* ... */ },
  }),
  { timeout: 5000 }
);
```

### With pgCK Router/Executor

pgCK subscribes to `input.kernel.*` subjects and:

1. Resolves the affordance URN
2. Validates participant identity/permissions
3. Validates payload against SHACL shapes
4. Executes the action (governed write via `ckp.seal()`)
5. Publishes result to `result.kernel.*`
6. Publishes state change events to `event.kernel.*`

**No direct kernel logic in CK.Lib.Js.**  
All governance (affordance, validation, seal) is in pgCK.

---

## Version Roadmap

### v1.1.0 (Current Release) — Transport Client

**Focus:** Establish reliable NATS WSS connection to pgCK via Sporaxis bundle

| Feature | Status | Notes |
|---------|--------|-------|
| Core JSON protocol | ✓ shipped | Baseline interop; all governance in pgCK |
| NATS WSS client | ✓ shipped | nats.ws; request/reply + streaming |
| Subject family dispatch | ✓ shipped | input/result/event/stream |
| Error handling | ✓ shipped | Timeouts, connection drops, malformed JSON |
| Type hints (JSDoc) | ✓ shipped | Basic TS compatibility |
| npm publishing | ✓ shipped | GitHub Actions → npmjs |

**Browser support:** ES2020+  
**Node.js support:** 18+

---

### v1.2.0 (Next Release) — OCI Bundle & GHCR Publishing

**Focus:** Container-native deployment; integrate with Sporaxis build system

| Feature | Status | Target |
|---------|--------|--------|
| **OCI bundle (bundle-ck-lib-js.yaml)** | ⧗ planned | Sporaxis-compatible bundle spec |
| **Dockerfile generation** | ⧗ planned | Multi-platform (amd64, arm64) Node.js 20 runtime |
| **Dev HTTP server** | ⧗ planned | Serve CK.Lib.Js for browser testing |
| **GHCR publishing** | ⧗ planned | GitHub Actions → ghcr.io/conceptkernel/bundle-ck-lib-js |
| **Smoke test** | ⧗ planned | Verify npm install, HTTP server startup, NATS WSS connectivity |
| **Sporaxis integration** | ⧗ planned | Add bundle-ck-lib-js to Sporaxis oci-germination build matrix |

**OCI image target:** <150 MiB (Node.js alpine base)  
**Deployment:** Single-command container spawn with dev version attachable  
**Break:** None (backward compatible with v1.1.0)

---

### v1.3.0 (Observer Optimization) — High-Frequency Streams

**Focus:** Performance-optimized observer feeds (stream.kernel.*)

| Feature | Status | Target |
|---------|--------|--------|
| Binary compact delta profile | ⧗ planned | FlatBuffers / MessagePack for stream.* only |
| Dictionary sync protocol | ⧗ planned | Term handle bootstrap + versioning |
| Observer subscription helpers | ⧗ planned | High-level APIs for spatial/temporal streams |
| Performance benchmarks | ⧗ planned | Establish latency/throughput baselines |

**Browser support:** ES2020+  
**Dependencies:** nats.ws, flatbuffers (optional)  
**Break:** None (backward compatible)

---

### v2.0.0 (Major Release) — Strong Typing & Full Feature Set

**Focus:** TypeScript-first development + complete CKP v3.8 affordance model

| Feature | Status | Scope |
|---------|--------|-------|
| **TypeScript rewrite** | ◯ planned | Full TS source; drop JSDoc hints; ESM/CommonJS dual build |
| **Strong affordance types** | ◯ planned | Ontology-driven type generation (URN → TS interface) |
| **Schema validation** | ◯ planned | Inbound/outbound JSON schema per affordance; fail-fast |
| **Binary strong types** | ◯ planned | FlatBuffers schema → TS types; zero-copy reads |
| **Lexical rehydration** | ◯ planned | Dictionary-coded compact terms → full RDF URIs |
| **JetStream support** | ◯ planned | Durable subscriptions; message persistence |
| **Browser SHACL validator** | ◯ planned | WASM-based shape validation (reject invalid payloads locally) |
| **Session management** | ◯ planned | Automatic session lifecycle; participant tracking |
| **Proof verification** | ◯ planned | Verify PROV-O proof chains client-side |
| **Plugin architecture** | ◯ planned | Custom affordance handlers; event middleware |

**Browser support:** Modern browsers (ES2022+)  
**Node.js support:** 20+  
**Dependencies:** flatbuffers, zod (or equiv), @wasm (optional)  
**Break:** TypeScript 5.0+; Node.js 20 minimum; package exports restructured

---

## Feature Progression

```
v1.1.0              v1.2.0            v1.3.0              v2.0.0
─────────────────────────────────────────────────────────────────────
┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────────┐
│ Core JSON    │   │ OCI Bundle   │   │ Observer     │   │ Strong Type      │
│ NATS WSS     │──▶│ GHCR Publish │──▶│ Optimization │──▶│ TypeScript + TS  │
│ Transport    │   │ Dev Server   │   │ Binary Delta │   │ SHACL Validator  │
│ npm pkg      │   │ Sporaxis Int │   │ Perf Tune    │   │ Plugin System    │
└──────────────┘   └──────────────┘   └──────────────┘   └──────────────────┘
       ↑                   ↑                  ↑                   ↑
     Today          2026 Q2-Q3         2026 Q3-Q4            2026 Q4-2027
```

---

## References

- **Sporaxis OCI Germination:** https://github.com/sporaxis-com/oci-germination
- **Bundle spec:** SPEC.OCI.BUNDLE.v0.1.md (Sporaxis repo)
- **CKP v3.8 Subject families:** SPEC.CKP.v3.8-rc-06-nats.md (pgCK _WIP)
- **pgCK Deployment:** SPEC.PGCK.DEPLOY.v0.1.md (pgCK _WIP)
