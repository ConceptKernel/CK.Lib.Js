# tests/ — the strategy: virgin substrate → running bench → production door

Four tiers. Each answers a different question, needs a different amount of trust, and is safe
in a different place. **The tier you may run is decided by the door, not by what you want to
know.**

| tier | what it answers | door needed | destructive | safe on production |
|---|---|---|---|---|
| **0 · offline** `npm test` | does the client keep its own contracts? | none | no | n/a — no door touched |
| **1 · law** `door-confirm` | which LAW does this door enforce? | any, verified | no | **yes** |
| **2 · grants** `door-suite` | what am I granted, and does the reply axis work? | any, verified | no | **yes** |
| **3 · burn** `door-beat` | can a kernel be germinated, governed, sealed and proven? | **designated breakable only** | **YES** | **NEVER** |
| **4 · browser** `real-path` | does it work in a real page, same-origin? | any, verified | no | yes |

Exit protocol, fleet-wide and identical in every tier: **0 GREEN · 44 RED-measured (a refusal
is a result) · anything else BROKEN (the instrument could not measure — never read as a verdict
on the door).**

---

## Before any tier that touches a door

**Every CK door requires a verified bearer.** There is no anonymous mode, no dev exception, no
claimed identity — `pgck.admit_anonymous` is `off` fleet-wide and `on` is invalid. A door that
admits you unverified is **non-conformant**; tiers 1 and 2 detect this in their W0 rung and
abort, because every grant measured through such a door is void.

```sh
export NODE_EXTRA_CA_CERTS="$(mkcert -CAROOT)/rootCA.pem"    # node ignores the OS keychain
export CK_DOOR=wss://<host>/wss
export CK_KERNEL=<a kernel in THIS door's roster>
export CK_TOKEN=<bearer for your own bot identity>
```

**Two preconditions that fail as SILENCE, not as errors** — know them before you diagnose:

1. **Roster.** `CK_KERNEL` must be in that door's `pgck.kernels`. An un-rostered kernel's
   dispatches vanish: no error, no log line, no refusal. Silence ≠ refusal.
2. **Restart, not reload.** NATS grants mint at container **start**. `pg_reload_conf()` moves
   the GUC and not the grants, so a roster edit without a restart leaves the door serving the
   previous roster — silently. *(Measured; this has cost a full day, twice.)*

**Warm-up.** A first dispatch within ~10 s of a restart or after idle may time out. **Retry
once, reads only, and say that is what happened.** One cold dispatch is not a finding. Tier 1
does this retry for you and prints it.

---

## The progression — a substrate from virgin to trusted

### Stage A · virgin substrate (nothing sealed, nothing germinated)

A fresh volume has law but no kernel. Only tier 3 can move it forward, and only on a bench
designated breakable.

```sh
CK_BEAT=1 node tests/wire/door-beat.mjs
```

The ladder is the progression itself: **germinate → govern (propose→vote→apply) → seal →
prove (verify + provenance) → adopt → module verbs.** It stops climbing when a prerequisite
rung faults and reports the rest SKIPPED rather than inventing results. Every artifact it
creates is stamped with a run id, so what it made is identifiable afterwards.

**Quorum 1 is REHEARSAL, not governance** — the ladder says so in its own seal. A single actor
proposing, voting and applying is a dry run of the mechanism, never a governed decision.

### Stage B · running dev bench (kernel exists, work in flight)

Tiers 1 → 2 → 3, in that order, because each makes the next readable:

```sh
node tests/wire/door-confirm.mjs      # which law? pin it with CK_STRUCT_SHA to CONFIRM
node tests/wire/door-suite.mjs        # what is granted? does the reply axis answer?
CK_BEAT=1 node tests/wire/door-beat.mjs   # breakable benches ONLY
```

Run tier 0 first if the client changed at all — a client that fails its own contracts will
produce wire results that mean nothing.

### Stage C · running production door

**Tiers 1 and 2 only. Tier 3 never.** Both are strictly read-only: they subscribe, they
dispatch reads, and they run one negative control that the door is *supposed* to refuse. They
create nothing and seal nothing.

```sh
node tests/wire/door-confirm.mjs   # law identity — pin CK_STRUCT_SHA to this deployment
node tests/wire/door-suite.mjs     # grant surface + reply axis
```

**Pin per deployment, never per fleet.** Benches legitimately run different law — an
artifact-pinned door boots its artifact's law. A digest baked into the kit is guaranteed to go
false-RED on a correctly-pinned door, so `CK_STRUCT_SHA` has **no default**: unpinned, tier 1
*reports* what it measured; pinned, it *confirms*.

---

## What makes these gates trustworthy

A gate that cannot fail what it claims is not a gate. Three properties are load-bearing, and
each exists because its absence produced a false GREEN:

- **The `>` canary.** A full-wildcard subscription SHOULD be refused. If it is GRANTED, either
  the door is wide open or violation capture is blind — so the run is reported
  **BROKEN-INSTRUMENT**, never PROVEN. *(Until v1.6.1 this suite read permission violations
  from the wrong property and was structurally incapable of ever printing REFUSED. It reported
  PROVEN on a door where the broker was logging Subscription Violations in the same window.)*
- **The negative control.** A bare-name `instance.create` must be refused. If it seals, the run
  says FAIL-OPEN loudly. A control that passes for an unrelated reason is worse than no control
  — check *why* it refused, not just that it did.
- **The W0 admission rung.** Tier is **measured** from the connection (`verified` / `UNVERIFIED`,
  with `sub`/`iss`/`aud`), never inferred from whether an env var was set. This is what catches
  an expired bearer, which is admitted unverified and looks exactly like a grant failure.

## Three-state honesty

| state | meaning | effect on exit |
|---|---|---|
| `RESULT` / `GRANTED` | the door said yes and answered | — |
| `REFUSED` | the door said no, naming it — **a refusal is a result, never a failure** | — |
| `FAULT` | no verdict: timeout, transport death | non-zero |

A refusal carries the substrate's verdict verbatim — `sqlstate`, clause, `resultPath`. Never
flatten it: a SHACL `ValidationReport` and a procedural refusal are *different planes* and both
are correct. **No `sourceConstraintComponent` ⇒ not SHACL.**

## No HTTP, anywhere

The wire kit makes **zero HTTP requests**. Law confirmation is wire-native
(`surface.grounding → structuralDigest` — the law the door actually *loaded*). Served bytes
prove what a deployment SHIPS, never what it ENFORCES: *proximity is not adoption*. Packaging
verification belongs in the consumer's build gate, offline, against the attested artifact.

## Files

| path | tier | note |
|---|---|---|
| `tests/smoke-*.mjs` | 0 | six suites, 151 assertions, fake dispatchers — declared, never a real door |
| `tests/wire/door-confirm.mjs` | 1 | law identity · read-only |
| `tests/wire/door-suite.mjs` | 2 | grants + reply axis · read-only |
| `tests/wire/door-beat.mjs` | 3 | the ladder · **destructive**, `CK_BEAT=1` guarded |
| `tests/real-path/` | 4 | browser harness, full form coverage |
| `tests/wire/_*.mjs` | — | **not gates.** Single-question probes kept for reproduction; the `_` prefix marks "not part of any suite, never run by CI" |
