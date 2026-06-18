# SPEC.ROADMAP.v1.5.1.CHECKLIST

Roadmap to **CK.Lib.Js v1.5.1** — typed-edge forms built-ahead + bug fixes + canonical wire spec.

**Predecessor:** `SPEC.ROADMAP.v1.5.0.CHECKLIST.md` — shipped v1.5.0 Edge Isolation.
**Surface spec:** `SPEC.CK-LIB-JS.v1.5.1.md` · **Wire spec:** `SPEC.CK-OPERATIONS.v1.5.1.md`
**Next (future):** `SPEC.ROADMAP.v1.6.0-FUTURE.CHECKLIST.md`
**Date:** 2026-06-18.

---

> **Status — v1.5.1 built, not yet released.**
>
> v1.5.0 is SHIPPED (`ghcr.io/conceptkernel/ck-lib-js:1.5.0`, attested, byte-verified, 2026-06-11).
> TE-10→TE-4 were built-ahead on the task branch and are in the current codebase. Three client
> bugs fixed this session. Wire spec written. Two external blockers open, neither blocks this tag.

---

## What is v1.5.1?

v1.5.0 shipped the dispatch-only floor (auth + `ckp.dispatch`, no RDF). v1.5.1 is the first
release of the **typed-edge forms** — kernel-derived typed operations that mirror pgCK v0.5
tracks T1–T6 — plus three bug fixes and the canonical NATS wire-contract spec.

The typed forms were built-ahead on the task branch (live-verified vs `v0.7.19` / pgCK `0.4.13`
on 2026-06-14). They are **form-live**: correct client payloads, correct handle sugar, but
enforcement is **vacuous on the demo** until BLK-1 (shape-graph mismatch) clears.

---

## Task list

`✅` coded (in current codebase) · `⏳` blocked external · `📄` doc/spec

| ID | Task | Depends on | File / line | Status |
|---|---|---|---|---|
| **TE-10** | `create(type, fields)` — uniform type-first body; no task/name key nesting | pgCK T0 · v0.4.5 ✅ | `ck.js:128` | ✅ |
| **TE-9** | `query(type, filter)` — derived QueryShape keys; no cache-filter fallback | pgCK T1 · v0.4.8 ✅ | `ck.js:188` | ✅ |
| **TE-8** | `link(source, predicate, target)` — plain IRI target (not `{'@id':…}`) | pgCK T2 · v0.4.9 ✅ | `ck.js:149` | ✅ |
| **TE-7** | `transition(id, toState)` — native sealed-map; surfaces `allowed` states | pgCK T3 · v0.4.10 ✅ | `ck.js:162` | ✅ |
| **TE-6** | `update(id, patch)` — declared-shape patch `{id, patch:{…}}`; undeclared keys rejected | pgCK T4 · v0.4.11 ✅ | `ck.js:146` | ✅ |
| **TE-5** | `validate(body)` — full SHACL `ValidationReport`; no boolean-grade reduction | pgCK T5 · v0.4.12 ✅ | `ck.js:169` | ✅ |
| **TE-4** | `match(term)` — governed `concept.match`; returns `candidates[]` | pgCK T6 · v0.4.13 ✅ | `ck.js:43,157` | ✅ |
| **FIX-A** | `notify(from, predicate, to, body?)` — was missing `target:to`; cross-kernel edges never sealed | — | `ck.js:150` | ✅ |
| **FIX-B** | `affordances()` verb name `'kernel.affordances'` → `'affordances'` | — | `ck.js:268` | ✅ |
| **G5a** | Gov-door routing: subscribe `result.kernel.<GOV>.>` when `gov ≠ kernel` | — | `ck-client.js:376` | ✅ |
| **WIRE-SPEC** | `SPEC.CK-OPERATIONS.v1.5.1.md` — canonical NATS subject grammar, headers, codec | — | root | 📄 ✅ |
| **CKLIB-SPEC** | `SPEC.CK-LIB-JS.v1.5.1.md` — current surface spec | — | root | 📄 ✅ |
| **FIX-C** | `reach` bare-id → SPARQL invalid-IRI error | pgCK NOTIFY pending | `ck.js:199` | ⏳ external |
| **BLK-1** | Demo enforcement vacuous — shapes in `/kernel/board`; pgCK reads `/kernel/ck` | oci-germination v0.7.20 | — | ⏳ external |

FIX-C and BLK-1 do NOT block the v1.5.1 tag. FIX-C is a pgCK server bug; the client degrades
honestly (`reach` returns `[]`). BLK-1 affects demo enforcement, not client code correctness.

---

## pgCK track alignment

| pgCK track | pgCK status | CK.Lib.Js item | Status |
|---|---|---|---|
| Tier 2 (create/apply/dispatch) | ✅ v0.4.5–v0.4.7 | base dispatch floor | ✅ v1.5.0 SHIPPED |
| T1 derived QueryShape | ✅ v0.4.8 | TE-9 | ✅ coded |
| T2 declared predicate set | ✅ v0.4.9 | TE-8 | ✅ coded |
| T3 sealed transition map | ✅ v0.4.10 | TE-7 | ✅ coded |
| T4 generic update patch | ✅ v0.4.11 | TE-6 | ✅ coded |
| T5 full ValidationReport | ✅ v0.4.12 | TE-5 | ✅ coded |
| T6 governed concept.match | ✅ v0.4.13 | TE-4 | ✅ coded |
| T7 plan compiler (server-internal) | ✅ v0.4.14 | — (transparent) | n/a |
| T8 F-A identity/snapshot | ⬜ v0.4.15 | TE-3 | ⏳ → FUTURE |
| T9 F-C session routing | ⬜ v0.4.16 | TE-2 | ⏳ → FUTURE |

---

## Release gate

v1.5.1 tag requires:

- [ ] `package.json` version → `1.5.1`
- [ ] `Dockerfile` LABEL → `1.5.1`
- [ ] `CHANGELOG.md` `[v1.5.1]` top entry added
- [ ] `v1.5.0` confirmed attested in `LATEST.md` ✅ (PROVENANCE Rule 4 — already verified)
- [ ] `main` clean + current before tag

After tag push: `scripts/gh-watch.sh v1.5.1` backgrounded. Confirm `gh attestation verify`
exit 0 + `LATEST.md` advanced before calling done. CI builds the pushed tag (Rule 1).

---

## Breaking changes vs v1.5.0

| Method | v1.5.0 | v1.5.1 | Migration |
|---|---|---|---|
| `notify` | `notify(to, predicate, body?)` | `notify(from, predicate, to, body?)` | add `from` as first arg; existing callers need updating |
| `create` | `create(type, { task: { …fields } })` | `create(type, { …fields })` | drop the `task:{}` wrapper |
| `query` filter | object with cache-fallback | QueryShape keys only (undeclared rejected) | use declared property localnames |

---

## What is NOT in v1.5.1

See `SPEC.ROADMAP.v1.6.0-FUTURE.CHECKLIST.md` for all post-v1.5.1 work.
