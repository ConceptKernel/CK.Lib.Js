# Wire gate — bi-directional NATS through a real door

## The burn kit — three entrypoints, all directable at any door via env

Point them at ANY deployment (a fresh ck-allinone, a new bench, a candidate bundle):

```sh
export NODE_EXTRA_CA_CERTS="$(mkcert -CAROOT)/rootCA.pem"   # node ignores the OS keychain
export CK_DOOR=wss://<host>/wss CK_KERNEL=<rostered-kernel>

node tests/wire/door-confirm.mjs    # 1. ROOT gate (read-only): which law runs here?
                                    #    wire shape-count + served-file/sidecar digest match
                                    #    [CK_ROOT_SHA=… CK_SHAPES=… CK_ONTOLOGY=…]
node tests/wire/door-suite.mjs      # 2. OBSERVER (read-only): bench health (auth-storm,
                                    #    wire-openness), grant surface w/ `>` canary,
                                    #    bi-directional reply axis  [--json]
CK_BEAT=1 CK_SUB=<party> \
node tests/wire/door-beat.mjs       # 3. BURN (DESTRUCTIVE, guarded): the full ladder —
                                    #    germinate → govern → seal → prove → adopt →
                                    #    recon pair → wave/lex, three-state honest,
                                    #    run-id stamped into everything it creates
```

**One fleet exit protocol** (aligned with pgCK `v312-tdd` and ocig `local-tdd`,
2026-08-27): **0 = GREEN · 44 = RED-measured (a refusal is a result; negative findings
recorded honestly) · other = BROKEN (the instrument could not measure — never read as a
verdict on the door).** Confirm: the FILE DIGEST is the binding criterion (byte-exact,
deployment-independent); the composed shape count is deployment-dependent (root +
adoptions — a bundle sealing wave+lexicon at init reports 47, a virgin root 30) and is
informational unless pinned with `CK_SHAPES`.

**The admission matrix** (measured by oci-germination on their artifact, confirmed against
our §CONNECT rule — the diagonal is the trap, and it is symmetric):

| | no token | valid token |
|---|---|---|
| **callout ON** (OIDC) | connects; SUB denied, WRITE denied (on that bundle: NO access — do not assume "subscribe-only") | SUB ok · WRITE seals |
| **callout OFF** (anon shell) | SUB ok · WRITE seals (id-form claim) | **Authorization Violation at CONNECT** |

One posture per door, never both: `CK_SUB` (claimed) on anon shells; `CK_TOKEN` on OIDC
benches. Grant scope under a callout is the DEPLOYMENT's policy — measure it with
door-suite, never assume it. Before diagnosing a dead door: rostered? (silence ≠ refusal) ·
within ~10s of restart? (warm-up — retry once).

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
