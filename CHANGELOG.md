# Changelog

All notable changes to CK.Lib.Js are documented here.

## [1.2.0] — 2026-05-26

### Added
- **OCI Bundle Release** — Static artifact published to GHCR (`ghcr.io/conceptkernel/ck-lib-js:1.2.0`)
- **Multi-Platform Support** — Images built for linux/amd64 and linux/arm64
- **GitHub Actions Automation** — Workflow-dispatch-based release pipeline via `workflow_dispatch` inputs
- **Sporaxis Compliance** — Bundle adheres to SPEC.OCI.BUNDLE.v0.1; static-only (ckp:static designation)

### Changed
- **Removed Dev Target** — Eliminated 145MB http-server variant; bundle is now 2.07MB static artifact only
- **Simplified Dockerfile** — Single `FROM scratch` target for folder mounting (no Node runtime in bundle)

### Fixed
- **Multi-Platform Manifest** — Corrected per-architecture digest handling (amd64 and arm64 now properly differentiated)
- **Public Access** — Bundle is anonymous-accessible via GHCR (no authentication required for pulls)

### Technical Details
- **Bundle Size:** 2.07MB (JS source + nats.ws deps)
- **Artifact Type:** ckp:static (mount-friendly filesystem layer)
- **Transport:** NATS WSS v2.14+ (input.kernel.* → result.kernel.* affordance pattern)
- **Compliance:** CKP v3.8 Core JSON profile (v1.1.0); binary optimization deferred to v1.3.0

---

## [1.1.0] — 2026-05-20

### Initial Release
- Core JSON message profile for NATS WSS browser client
- Affordance request/reply pattern (input.kernel.* → result.kernel.*)
- Event subscription (event.kernel.*, stream.kernel.*)
- nats.ws v1.30.3 as sole dependency

---

## Versioning Roadmap

| Version | Focus | Status |
|---------|-------|--------|
| **1.1.0** | Core JSON profile | ✓ Released |
| **1.2.0** | OCI bundle + GHCR publishing | ✓ Released |
| **1.3.0** | Binary compact delta + deduplication | ⧗ Planned |
| **2.0.0** | TypeScript definitions + API stabilization | ⧗ Planned |

---

**Repository:** https://github.com/ConceptKernel/CK.Lib.Js  
**Package:** https://ghcr.io/conceptkernel/ck-lib-js  
**License:** MIT
