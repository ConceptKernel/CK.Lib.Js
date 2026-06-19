# Real-path verification — the v1.5.1 honesty gate

Proves the **shipped** client modules round-trip end-to-end through the **real** transport
(browser → wss → relay → pgCK), **not** a mock transport and **not** `psql ckp.dispatch` (which
bypasses the transport — exactly how the gov-routing timeout once slipped past us). See
[`harness.js`](./harness.js) for the run procedure (docker-cp the modules into the dev env's
`/app/cklib`, then `page.evaluate(() => runHarness(CK))` on `https://ck-lib-js.localhost/`).

## Proof — 2026-06-19, vs `ociger-ck-allinone:v0.7.20` / pgCK `0.4.14` (real enforcement)

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

## Enforcement — real on v0.7.20 (`enforcementReal: true`)

`runHarness` also asserts the **enforcement** axis — the check the original v0.7.19 run *lacked*, which let
the v1.5.1 `target_kernel`-strip regression ship under *vacuous* enforcement:

| signal | result |
|---|---|
| `enforcement.rejectsIncompleteCreate` | ✅ a create missing a declared-required field is **rejected** (`ckp.seal: missing required …`) |
| `enforcement.filteredQueryResolves` | ✅ the declared short-key filter **resolves** (BLK-1 fixed — shapes now in `kernel/ck`) |
| `degrade.reach_FIXC` | ✅ `reach` returns the linked target (FIX-C resolved in v0.7.20) |

**BLK-1** (enforcement vacuous) and **FIX-C** (reach bare-id) were resolved by oci-germination **v0.7.20**.
The v1.5.1 regression they exposed — `create` stripping `target_kernel` — is fixed in **v1.5.2**, guarded by
a unit test (no-strip) and this harness (incomplete create must be rejected). The harness can no longer
false-green against vacuous enforcement.
