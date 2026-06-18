# SPEC.ROADMAP.v1.6.0.CHECKLIST

Roadmap to **CK.Lib.Js v1.6.0 — Typed Edge** (the client-edge twin of **pgCK v0.5.0**, which completes
**CKP v3.9** by replacing every server-side *concretion* with the kernel's **declared** shape). The prior
epoch — **v1.5.0 "Edge Isolation"** (the dispatch-only client; twin of pgCK Tier 2 / CKP v3.9 Critical
Isolation) — is **SHIPPED + adopted**. Each v1.6.0 stage aligns to a pgCK **v0.5 track (T1…T9)** and may
not ship until that track lands.

**Grounding model:** `_WIP/ref-SPEC.CKP.v3.9.md` (three rings, closed `ckp.dispatch` four-tuple, §7
Postgres role isolation, P1–P10).
**The twin we align to:** `_WIP/ref-SPEC.pgCK.ROADMAP.v0.5.0.md` — the T1…T10 tracks (`v0.4.8 → v0.4.16`,
the final green cut re-tagged `v0.5.0`; the kernel-derived forms).
**Specs:** `SPEC.CK-LIB-JS.v1.6.0.md` (the typed-edge surface) + `SPEC.CK-OPERATIONS.v1.6.0.md` (the wire
contract — per-track payload/reply deltas). `SPEC.CK-LIB-JS.v1.5.0` is the shipped precursor.

---

> **Status (2026-06-12) — v1.5.0 SHIPPED + adopted; pgCK Tier 2 complete + attested (`v0.4.7`); v1.6.0 opens.**
> **v1.5.0 (Edge Isolation) is live:** dispatch-only client (`ck.js` L2 facade + `CKStore` typed cache +
> dispatch transport on the vendored NATS client), `instance.*` **ADOPTED** in the shipped tracked surface
> (digest `sha256:195c2071…`), verified live vs pgCK `0.4.2` / ociger `0.7.17`. The alias-retirement clock's
> first hand is down (our adoption); `task.*` retires one minor after web2-green.
> **pgCK shipped Tier 2 (`v0.4.5`–`v0.4.7`) AND v0.5 tracks T1–T5 (`v0.4.8`–`v0.4.12`), all attested:**
> Tier 2 = generic typed `create`, governance shape-mutation, reach edge-materialization, governed query
> affordances; **T1** derived QueryShape, **T2** declared predicate set, **T3** per-kernel sealed transition
> map, **T4** generic update patch, **T5** full SHACL `ValidationReport`. **The pgCK v0.5 roadmap is PAUSED
> at this attested floor** (T6 governed `concept.match`, T7 plan compiler remain; T8/T9/T10 upstream-gated).
> So the server-side gates for **TE-5…TE-9 are now LANDED** — those client tasks are client-adoption-pending,
> not pgCK-gated. The wire-contract **Q1/Q2 are pinned** (per-verb reply fields final; `instance.create`'s
> uniform `{type,…fields}` body is the target — the `type→payload-key` map is transient — see
> `SPEC.CK-OPERATIONS` §7).
> **v1.6.0 (Typed Edge) is the NEXT phase:** as pgCK's verbs route against the kernel's **DECLARED** shape
> (v0.5 T1…T9), the client's typed forms become kernel-derived — declared filter keys, declared predicates,
> sealed transition maps, the full `ValidationReport`, the governed `concept.match` — and the client retires
> its transitional fallbacks (the cache-filter, the boolean-grade validate, the `type→payload-key` map).
> npm note: publish `1.6.0 --provenance` at tag (user-gated); registry hygiene per PROVENANCE.

---

## The thesis (one line)

> v1.5.0 collapsed the client to **authentication + `ckp.dispatch`** — no RDF, no quad store, no query
> engine. v1.6.0 keeps that floor and makes the typed surface **kernel-derived**: every typed form the
> client sends or renders — filters, predicates, transitions, patches, validation, match — is the kernel's
> **declared** shape, mirrored from pgCK's v0.5 verbs, never a client-side guess or fallback. *The client
> still addresses URNs + typed instances, never triples* — but now the types are exactly the server's.

---

## Descending-index task list (aligned to pgCK v0.5 T1…T9)

Build/ship order is **descending**: index 1 ships **v1.6.0** (aligned to pgCK **v0.5.0**). Each task names
the **pgCK track it consumes** and its **readiness** — a gated task cannot ship until that track lands.

`#` descending · `ID` = `TE-<n>` (Typed Edge) · ⛴ = ship-it · ✅ done · 🔨 built-ahead (parked in
`_WIP/v1.6.0-thread/`) · ⏳ in progress · ⬜ gated on the pgCK track.

| # | ID | Task (client consume-side) | pgCK track | Status |
|---:|---|---|---|---|
| 10 | TE-10 | Adopt the uniform `instance.create {type, …fields}` body; **drop the transient `type→payload-key` map** | keystone (v0.4.5, shipped) | ⬜ pgCK shipped → client adopt |
| 9 | TE-9 | `instance.query` sends the kernel's **declared filter keys** (derived QueryShape); **drop the client cache-filter fallback** | **T1 · v0.4.8** | ⬜ gated |
| 8 | TE-8 | `instance.link` / `instance.reach` use the kernel's **declared predicate set** (drop the namespace assumption) | **T2 · v0.4.9** | ⬜ gated |
| 7 | TE-7 | `instance.transition` renders the kernel's **sealed transition map** (offer only legal `to_state`s) | **T3 · v0.4.10** | ⬜ gated |
| 6 | TE-6 | `instance.update` sends a **declared-shape patch** (drop the Task-shaped assumption) | **T4 · v0.4.11** | ⬜ gated |
| 5 | TE-5 | `validate` surfaces the full **`ValidationReport`** (typed violations); **drop boolean-grade local validate** | **T5 · v0.4.12** | ⬜ gated |
| 4 | TE-4 | `concept.match` calls the **governed query** form (typed params; never query text) | **T6 · v0.4.13** | ⬜ gated |
| 3 | TE-3 | `instance.snapshot` — supply the **validated JWT**; render granted bodies (drop the `snapshot_not_granted` degrade) | **T8 · v0.4.15** (F-A) | ⬜ gated (+ SPORE) |
| 2 | TE-2 | **Per-session result routing** — subscribe the granted reply subject; correlate to the dispatch | **T9 · v0.4.16** (F-C) | ⬜ gated |
| 1 | TE-SHIP ⛴ | **Ship v1.6.0 — Typed Edge** (build+attest `ck-lib-js:1.6.0`; flip the spec authoritative) | **pgCK v0.5.0** | ⬜ |

**Cross-track notes:** pgCK **T7** (plan compiler, `v0.4.14`) is server-internal + **transparent to the
client** (reads just get epoch-correct/faster) — no TE task. pgCK **T10** (engine asks #1/#2) gates
`instance.explain`'s full derivation chain, which the client surfaces opaquely when pgRDF v0.6 lands.

---

## pgCK track alignment (kept in sync with the v0.5 roadmap)

| pgCK track | pgCK target | CK.Lib.Js stage | CK.Lib.Js status |
|---|---|---|---|
| Tier 2 (create / apply / reach / governed-query) | ✅ **v0.4.5–v0.4.7 attested** | v1.5.0 Edge Isolation + adopt | ✅ **SHIPPED** `:1.5.0` (`instance.*` adopted) |
| **T1** derived QueryShape | ✅ **v0.4.8 attested** | TE-9 | ⬜ pgCK shipped → client adopt |
| **T2** declared predicate set | ✅ **v0.4.9 attested** | TE-8 | ⬜ pgCK shipped → client adopt |
| **T3** sealed transition map | ✅ **v0.4.10 attested** | TE-7 | ⬜ pgCK shipped → client adopt |
| **T4** generic update patch | ✅ **v0.4.11 attested** | TE-6 | ⬜ pgCK shipped → client adopt |
| **T5** full `ValidationReport` | ✅ **v0.4.12 attested** | TE-5 | ⬜ pgCK shipped → client adopt |
| **T6** governed `concept.match` | ⬜ v0.4.13 | TE-4 | ⬜ gated |
| **T7** plan compiler (server-internal) | ⬜ v0.4.14 | — (transparent) | n/a |
| **T8** F-A identity (snapshot) | ⬜ v0.4.15 | TE-3 | ⬜ gated (+ SPORE) |
| **T9** F-C result routing | ⬜ v0.4.16 | TE-2 | ⬜ gated |
| **v0.5.0** (CKP v3.9 fully built) | ⬜ | ship v1.6.0 (TE-1) | ⬜ |

**Cross-side rule (unchanged):** if a pgCK track slips, the dependent TE task is **blocked, not worked
around** — surface via NOTIFY. The client degrades **honestly** against any unshipped track (stable
signatures), exactly as it did across CI-A…CI-E.

---

## v1.5.0 removals (done — the dispatch-only floor; archived to `_WIP/deprecated/`, reversible)

| Removed | Was | Successor |
|---|---|---|
| `ck-rdf-bridge.js` | `toQuads`/`dataFactory`/`makeNativeDatasetCore` | none (no client quads) |
| `ck-hex-store.js` (+ `ck-hex-store/`) | `CKHexStore` RDF mirror, hex index, `toRdfJs` | `ck.js`+`CKStore` typed cache |
| `ck-page/bus/kernel/runtime/registry/shapes/materializer/anim/anim-grammar/sound`, `ck-store`, `index.html` | legacy render/page tier + demo | none — web2 needs only `ck-client.js` |
| `vendor/anime.esm.min.js`, `scripts/gh-watch.sh` | vendored 3rd-party + dev tooling | none |
| `build-ck-lib-js.sh`, `smoke-ck-lib-js.sh`, `bundle-ck-lib-js.yaml` | stale dev artifacts (build script **violated PROVENANCE Rule 1**) | none |
| `SPEC.CK-LIB-JS.v1.4.2.md` | obsolete L2-over-RDF DRAFT (never shipped) | superseded by `SPEC.CK-LIB-JS.v1.5.0` → `v1.6.0` |

The dispatch-only floor stands in v1.6.0 — v1.6.0 adds **no** RDF/quad/query tier back; it only makes the
typed surface kernel-derived. *(Correction — CK.Lib.Js review 2026-06-12: the transport vendoring of
`nats.ws`+`@msgpack` is already **DONE** — shipped in **v1.4.2**, byte-verified, no runtime CDN. It is not
outstanding hardening. The legacy prod-endpoint default scrub — `wss://stream.tech.games`/`id.tech.games`/
realm `techgames` → same-origin-derived or explicit-required — also landed in **v1.5.0**.)*

---

## Inherited prerequisites (owned elsewhere)

- **Identity = verified JWT + seal-time claim check** (v3.9 TR-02 / SPORE Phases 0–1; pgCK T8). The client
  supplies the JWT, never asserts identity — TE-3 activates when pgCK consumes the injected identity.
- **F-C per-session result routing** (transport-side; pgCK T9) — the granted-scope subscription is the
  client half (TE-2).
- **pgRDF engine asks #1/#2** (pgCK T10, v0.6-FUTURE) — `instance.explain`'s full derivation chain surfaces
  opaquely through the client when pgRDF lands the trace.

---

## Release posture & compliance (PROVENANCE)

- **Staged, not one cut.** v1.5.0 (Edge Isolation) shipped first; v1.6.0 ships across TE-9…TE-2 as pgCK
  opens each v0.5 track, then index 1 ships v1.6.0.
- **CI-only publish.** A release = a **`v*` tag push** → `oci-publish.yml` builds + attests + publishes +
  renders `LATEST.md`. Workstation `docker push`/`gh release create` are **prohibited** (Rule 1); plain
  `git push` of a branch is allowed. **Byte-verification is standing release policy** (the `:1.4.1`/`:1.4.2`
  pre-strip incident).
- **Rule 4:** a `v1.6.0` tag is permitted once `v1.5.0` is attested in `LATEST.md`. The tag is the
  user's authorized step.
- **Branch discipline (LOCKS):** all writes land on the task branch (`ck-lib-js.task.*`), never `main`.
- **Visibility:** `SPEC*` detail v3.9, which pgCK holds "public only when ratified" (§15) → kept
  **untracked/local** until a pgCK NOTIFY clears the public push. The shipped artifact (npm/OCI) never
  carries a spec regardless.

---

## Alignment statement

The client-edge twin of `_WIP/ref-SPEC.pgCK.ROADMAP.v0.5.0.md`. v1.5.0 carried v3.9's *isolation* proof to
the client edge (no RDF/quad/pgRDF/query engine — authenticate + dispatch). v1.6.0 carries v3.9's
*kernel-derived* completion one tier out: as pgCK replaces each concretion with the kernel's declared shape
(T1…T9), the client mirrors exactly those typed forms and drops its transitional fallbacks. pgCK marches
`v0.4.8 → v0.5.0`; CK.Lib.Js ships v1.6.0 in step — so a concept kernel is typed **and** secure end-to-end,
with no participant holding more than `EXECUTE ckp.dispatch`.
