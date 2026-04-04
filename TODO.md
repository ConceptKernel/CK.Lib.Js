# CK.Lib.Js — TODO for CKP v3.5-alpha-9

> Source: DELVINATOR triage (Py↔Js interop verification agent)
> Grounded in: https://conceptkernel.org/ontology/v3.5-alpha6/

## HIGH

### 1. Enforce `{action, data}` Body Contract

**Soft gap verified by interop agent.** `send()` (ck-client.js line 110) spreads the caller's object into the body without enforcing structure. If caller sends `{action: "ping", x: 1}` without `data:` wrapper, processor receives `data={}` silently.

```javascript
// Current:
send(body) { this.nc.publish(topic, jc.encode({ timestamp, ...body })); }

// Required:
send(body) {
    if (!body.action) throw new Error('CKClient.send: action required');
    if (body.data === undefined) body.data = {};
    this.nc.publish(topic, jc.encode({ timestamp: Date.now(), action: body.action, data: body.data }));
}
```

### 2. Fleet-Aware Subscriptions

Subscribe to multiple kernel event topics for fleet monitoring:

```javascript
await client.subscribeFleet(['Delvinator.ThreadScout', 'Delvinator.ExchangeParser', ...]);
client.onFleetEvent((kernel, event) => {
    console.log(`${kernel}: ${event.type}`);
});
```

Published ontology: `ckp:NATSBrowserClient` (kernel-metadata.ttl)

### 3. Ontology-Driven Action Discovery

ck-page.js already fetches `/ontology.yaml` (line 22) and extracts topics/edges. Extend to:
- Parse `spec.actions` from fetched ontology
- Render action buttons with access levels (anon/auth)
- Validate outbound message fields against ontology classes

### 4. Kernel Spawn Panel

Admin sidebar (ck-page.js) should allow sending `kernel.spawn` action:

```javascript
await client.action('kernel.spawn', {
    kernel_class: 'Delvinator.Concept.SqliteConnectionLeakPatterns',
    template: 'concept',
    metadata: { slug: 'sqlite-connection-leak-patterns', domain: 'data-layer' }
});
```

### 5. Test Cases

| Test | Description | Type |
|------|-------------|------|
| T001 | Connect anon, send status, receive result | Smoke |
| T002 | Connect anon, send auth-only action, expect rejection | Auth |
| T003 | Login via Keycloak, send auth action, receive result | Auth |
| T004 | Token refresh without reconnect | Auth |
| T005 | Send `{action: "ping"}` without data wrapper — should auto-wrap | Contract |
| T006 | Subscribe to fleet events, verify all 6 kernels fire | Fleet |
| T007 | Send kernel.spawn, verify new kernel appears | Spawn |
| T008 | Nested result at `data.data` — verify correct unwrapping | Interop |

## Provenance

```
prov:Activity    CK.Lib.Js-TODO-alpha-9
prov:used        DELVINATOR interop verification agent
prov:used        ck-client.js (NATS WSS, Keycloak JWT, message headers)
prov:used        ck-page.js (ontology fetch, admin panel, NATS wiring)
```
