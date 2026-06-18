# Real-path verification — the v1.5.1 honesty gate

Proves the **shipped** client modules round-trip end-to-end through the **real** transport
(browser → wss → relay → pgCK), **not** a mock transport and **not** `psql ckp.dispatch` (which
bypasses the transport — exactly how the gov-routing timeout once slipped past us). See
[`harness.js`](./harness.js) for the run procedure (docker-cp the modules into the dev env's
`/app/cklib`, then `page.evaluate(() => runHarness(CK))` on `https://ck-lib-js.localhost/`).

## Proof — 2026-06-18, vs `ociger-ck-allinone:v0.7.19` / pgCK `0.4.13`

`runHarness(CK)` → `allFormsProven: true`. Every client form round-trips through the real path:

| verb (TE) | real-path result |
|---|---|
| `create` (TE-10) | sealed — `verified:true`, real `proof_digest` ✅ |
| `verify` / `provenance` | full proof chain (ledger seq, declared-IRI body) ✅ |
| `query` unfiltered (TE-9) | rows returned ✅ |
| `transition` (TE-7) | `ok`, verified (config-map fallback) ✅ |
| `update` (TE-6) | `ok`, verified, re-seals ✅ |
| `validate` (TE-5) | `{conforms, violations}` report ✅ |
| `match` (TE-4) | governed plan runs → `candidates` ✅ |
| `link` (TE-8) | edge sealed, verified ✅ |
| **gov-routing (G5a)** | every verb routed to the gov door + reply correlated ✅ |

## Known gaps — server/bundle-side, NOT client code (tracked for v1.6.0)

| signal | meaning |
|---|---|
| `vacuous.filteredQuery_BLK1: 0` | declared-shape **enforcement vacuous** on the *demo* — its shapes are sealed into `urn:ckp:demo/kernel/board` while pgCK reads `…/kernel/ck`. **BLK-1** (oci-germination bootstrap). Enforcement *works* on a correctly-seeded kernel (CSVC proved it). |
| `degrade.reach_FIXC: 0` | pgCK `reach` bare-id → SPARQL invalid-IRI; client **degrades honestly to `[]`**. **FIX-C** (pgCK). |

Neither blocks the v1.5.1 tag: the client forms are correct; the gaps are a demo-bundle misconfiguration
and a pgCK server bug, both tracked, both disclosed.
