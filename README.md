# CK.Lib.Js — CKP v3.8 Browser Client Library

**Version:** 1.1.0  
**Status:** Production-ready (CKP v3.8 final alignment)  
**Package:** [@conceptkernel/cklib](https://www.npmjs.com/package/@conceptkernel/cklib)

A JavaScript client library for Concept Kernel Protocol (CKP) v3.8, enabling browser-based agents to:
- Connect to NATS WebSocket Secure (WSS) message bus
- Dispatch kernel actions via Envoy Gateway routing
- Subscribe to kernel state changes and events
- Manage kernel ontology queries and provenance chains

---

## Installation

```bash
npm install @conceptkernel/cklib
```

## Quick Start

```javascript
import { connect } from "nats.ws";

// Connect to NATS WSS bus
const nc = await connect({
  servers: ["wss://stream.example.com:9222"],
});

// Subscribe to kernel state updates
const sub = nc.subscribe("kernel.*.state");
for await (const msg of sub) {
  console.log("Kernel state:", msg.json());
}
```

## Runtime Requirements (CKP v3.8)

### NATS WSS Transport

CK.Lib.Js connects to a native NATS server with WebSocket Secure (WSS) listener.

**Server setup:**
```bash
# Using Docker
docker run -d \
  -p 4222:4222 \
  -p 8443:8443 \
  -e NATS_PORT=4222 \
  -e NATS_TLS_CERT=/etc/nats/tls/server.pem \
  -e NATS_TLS_KEY=/etc/nats/tls/server-key.pem \
  nats:2.14.1-scratch
```

**Client connection:**
```javascript
import { connect } from "nats.ws";

const nc = await connect({
  servers: ["wss://localhost:8443"],
});
```

**Subject families:**

Long-form (CKP v3.8 normative — canonical from v1.3.0):
- `input.kernel.<Kernel>.action.<verb>` — inbound action dispatch
- `result.kernel.<Kernel>.action.<verb>` — action result
- `event.kernel.<Kernel>.<event>` — state change events
- `event.kernel.<Kernel>.error` — per-kernel error broadcast (v1.3.0+)
- `event.kernel.Dictionary.v_bumped` / `.snapshot` — internal dictionary sync (v1.3.0+)
- `stream.kernel.<Kernel>.<stream>` — optional observer feeds
- `event.CK.Compliance.violation` — global LOCKS contract violations (opt-in via `extraSubjects:`)
- `broadcast.<project>.<channel>` — non-kernel-derived broadcasts (opt-in via `extraSubjects:`)

Short-form aliases (v1.2.x compatibility, **deprecated**, removed in v2.0):
- `input.<Kernel>`, `result.<Kernel>`, `event.<Kernel>`

CKClient v1.3.0+ subscribes to BOTH forms; publishes on both `input.<Kernel>` (short) and `input.kernel.<Kernel>.action.<verb>` (long, when `data.action` is present) so callers transition transparently.

### pgCK Governance Layer

CK.Lib.Js is a **transport client only**. All kernel business logic runs in pgCK:
- Affordance resolution
- Identity verification
- SHACL validation
- Governed state mutation
- Provenance tracking

The browser never directly mutates kernel state; all writes go through pgCK's `ckp.seal()` governance layer.

## Exported Modules

```javascript
import {
  CKClient,           // Kernel agent client
  CKRegistry,         // Ontology registry
  CKRuntime,          // Browser runtime environment
  CKMaterializer,     // Kernel instantiation
  CKPageHarness,      // Web component integration
  CKBus,              // Event bus (NATS wrapper)
  CKStore,            // Local state store
  CKShapes,           // BFO shape definitions
  CKAnim,             // Animation runtime
  CKSound,            // Audio output
} from "@conceptkernel/cklib";
```

## API Reference

### CKClient

```javascript
const client = new CKClient({
  natsConnection: nc,
  kernelUrn: "urn:ckp:kernel:XrVoyage.Plugin",
});

// Dispatch kernel action
await client.dispatch({
  action: "kernel.action.update_state",
  payload: { /* ... */ },
});

// Subscribe to kernel events
client.subscribe("XrVoyage.Plugin", (event) => {
  console.log("Event:", event);
});
```

### CKRegistry

```javascript
const registry = new CKRegistry({ natsConnection: nc });

// Query ontology
const kernels = await registry.query({
  rdf: "?kernel rdf:type ckp:Kernel .",
});
```

## Versioning

- **CK.Lib.Js v1.1.0** ← current stable
- **CKP Alignment:** v3.8-final
- **Node.js:** ≥18.0.0
- **Browser:** ES2020+ (modern browsers)

## License

MIT — see [LICENSE](LICENSE)

## Contributing

Contributions welcome. Please:
1. Fork [github.com/ConceptKernel/CK.Lib.Js](https://github.com/ConceptKernel/CK.Lib.Js)
2. Create feature branch
3. Test against CKP v3.8 validator
4. Submit PR with test coverage

## References

- **CKP Specification:** https://conceptkernel.org/specs/v3.8
- **Envoy Gateway:** https://gateway.envoyproxy.io
- **NATS Documentation:** https://docs.nats.io
- **npm Package:** https://www.npmjs.com/package/@conceptkernel/cklib
