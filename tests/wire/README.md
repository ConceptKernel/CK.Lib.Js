# tests/wire/ — the three door gates

**Strategy, tiers, and when each gate is safe to run: [`../README.md`](../README.md).** This
file is the kit's own reference only.

```sh
export NODE_EXTRA_CA_CERTS="$(mkcert -CAROOT)/rootCA.pem"
export CK_DOOR=wss://<host>/wss CK_KERNEL=<rostered-kernel> CK_TOKEN=<your bot bearer>

node door-confirm.mjs                 # gate 1 · LAW      · read-only · safe on production
node door-suite.mjs [--json]          # gate 2 · GRANTS   · read-only · safe on production
CK_BEAT=1 node door-beat.mjs          # gate 3 · BURN     · DESTRUCTIVE · breakable benches only
```

**Exit: 0 GREEN · 44 RED-measured · anything else BROKEN.**

## Environment

| var | gate | required | note |
|---|---|---|---|
| `CK_DOOR` | all | **yes** | `wss://<host>/wss`. No default — a door is a wire-meaning value |
| `CK_KERNEL` | all | **yes** | must be in **this door's** roster, or dispatches are silent |
| `CK_TOKEN` | all | **yes in practice** | every CK door requires a verified bearer |
| `CK_STRUCT_SHA` | 1 | no | **no default.** Unpinned ⇒ reports; pinned ⇒ confirms. Per deployment, never per fleet |
| `CK_SHAPES` | 1 | no | informational unless pinned; deployment-dependent (root + adoptions) |
| `CK_WAIT_MS` | 2 | no | reply deadline, default 4000 |
| `CK_BEAT` | 3 | **yes** | must be `1`; the guard is the point |
| `CK_SUB` | 3 | — | **retired.** `claimSub` is gone: doors grant on the connection's own verified sub |

## What each gate refuses to lie about

- **Gate 1** measures the law the door **loaded** (`surface.grounding → structuralDigest`), not
  bytes it serves. **Zero HTTP requests** — the kit has no HTTP dependency at all.
- **Gate 2** carries the `>` canary. If a full wildcard is GRANTED the verdict is
  **BROKEN-INSTRUMENT**, not PROVEN — either the door is open or capture is blind, and every
  other GRANTED is then meaningless. Violations are read from `status.permissionContext`
  (top-level; `status.data` is only the error *code*).
- **Gate 3** stops climbing when a prerequisite rung faults and reports the rest SKIPPED. It
  never fabricates a rung it could not reach. Quorum 1 is **rehearsal**, said in the seal.

All three assert **W0 admission** first: `verified` with `sub`/`iss`/`aud` read from the
connection — never `TOKEN ? 'token-supplied' : …`, which measures an env var, not a door.

## `_`-prefixed files are not gates

`_gov-probe.mjs`, `_ck-ops.mjs` — single-question probes kept for reproduction. The `_` marks
"not part of any suite, never run by CI, no exit protocol". Promote one to a real gate only by
giving it a controlled failure.

## Measured runs

| date | door | verdict |
|---|---|---|
| 2026-08-26 | pgck.localhost | NOT-PROVEN — canary GRANTED, dispatch silent. **Both symptoms were ours**: the suite read violations from the wrong property (so REFUSED was unreachable) and never passed `gov` (so it published to a kernel id the substrate refuses by name). Recorded then as a substrate item; that attribution was wrong. |
| 2026-08-28 | pgck.localhost · ck-lib-js · verified | **PROVEN** (exit 0). Canary **REFUSED** · deprecated short forms **REFUSED** · long forms GRANTED · `instance.query` **RESULT** · negative control **REFUSED `type_must_be_iri`** · tier **verified** (measured). Gate 1: `47d24485…`, 30 NodeShapes, LAW CONFIRMED when pinned. |
