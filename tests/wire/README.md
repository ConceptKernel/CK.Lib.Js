# Wire gate — bi-directional NATS through a real door

North star (operator, 2026-08-26): mirror pgCK's v3.12 TDD discipline — **structural** and
**post-structural** — but **over the wire**, measuring what the door *allows* (the grant
surface) and *communicates* (replies, refusals, sealed events), with the shipped client as the
instrument. Complements `tests/real-path/` (browser, full form coverage); this suite is node,
headless, CI-able, and grant-focused.

```sh
NODE_EXTRA_CA_CERTS="$HOME/Library/Application Support/mkcert/rootCA.pem" \
CK_DOOR=wss://pgck.localhost/wss CK_KERNEL=ck-lib-js [CK_TOKEN=<bearer>] \
node tests/wire/door-suite.mjs [--json]
```

## Three-state honesty

| state | meaning | effect on exit |
|---|---|---|
| GRANTED / RESULT | the door said yes and answered | — |
| REFUSED | the door said no, naming it — **a refusal is a result, never a failure** | — |
| FAULT | no verdict (timeout, transport death) | non-zero |

A **negative control is a pass when it refuses** (bare-name create must refuse; if it seals,
the run reports FAIL-OPEN loudly). The **`>` canary** guards the instrument itself: a full
wildcard should refuse, and if it doesn't, every GRANTED in the run is marked *uncertain* —
either the door is wide open or violation capture is blind. A suite that cannot fail what it
claims is not a suite.

## Axes

- **Structural** — the subject grammar probed subject-by-subject: canonical long forms, the
  deprecated short forms (expected REFUSED on v3.9+), the error subject, the canary. Run twice
  (anonymous, then `CK_TOKEN`) and diff: identity-invariance of the grant set is the PASS-9
  finding as a repeatable measurement.
- **Post-structural** — bi-directional through the full dispatch path (`input.kernel.<k>.action.*`
  out, `result.kernel.<k>.>` back, Trace-Id correlated): a typed read, a must-refuse negative
  control, and — on a granted identity — the sealed-event plane (`event.kernel.<k>.*`).

## Measured runs

| date | door | tier | verdict |
|---|---|---|---|
| 2026-08-26 | wss://pgck.localhost/wss (operator-flagged OUT OF SYNC) | anonymous | NOT-PROVEN — canary GRANTED (grant surface uncertain); dispatch: no reply in 4s, both probes. Honest fault, not a client claim. |
| 2026-08-26 (later) | wss://pgck.localhost/wss — REBUILT: pgck 0.4.82 + pgrdf 0.6.34, v3.12 FINAL 7de02b35…, virgin substrate; served cklib byte-identical to working tree (6931b425…/aa661514…) | anonymous | NOT-PROVEN — bench-health preflight (new): anonymous wire OPEN (loopback-proven, $SYS visible) and an AUTH-STORM ~7/s (stale-bearer clients; traced by hand to lingering pgck-mcp processes on the operator host holding pre-wipe bearers). Publishes flow; the relay answers neither the read probe nor the negative control on the action grammar. Substrate-side item; the client's publish/subscribe axes are proven, the reply axis is not. |
