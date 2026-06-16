# Phase 11 VRE Feature Ledger

who: codex
when: 2026-06-16
why: T11.0.1 opens the first Phase 11 runtime scaffold only after T11.0.0
  proved the real HGSOC data is inventory-ready but not claim-ready.
what: Minimal research packet schema, semantic validator, and fail-closed
  Phase 11 ledger checker.
verification: RED-first missing schema/module/count failures captured; target
  GREEN requires schema tests, packet validator tests, ledger checker tests,
  validate-counts, run-all, full node --test, WIKI checks, and Claude Code
  non-author HAT 3 ACCEPT.
reviewer: claude-code

## T11.0.1 Research Packet Scaffold Trace

Changed Phase 11 VRE paths:

- `phase11-vre-feature-ledger.md`
- `environment/phase11/research-packet.js`
- `environment/schemas/phase11-research-packet.schema.json`
- `environment/tests/schemas/phase11-research-packet.schema.test.js`
- `environment/tests/ci/phase11-research-packet.js`
- `environment/tests/ci/phase11-research-packet.test.js`
- `environment/tests/ci/check-phase11-ledger.js`
- `environment/tests/ci/check-phase11-ledger.test.js`
- `environment/tests/ci/run-all.js`
- `environment/tests/ci/validate-counts.js`

Required inherited blockers:

- GSE184880 HGSOC remains packet-scaffold-only, not claim-ready.
- `GSE111976_full.h5ad` remains `STUB_BLOCKED_FOR_H5AD_USE`.
- Cell-type annotation is absent in the T11.0.0 metadata-only inventory.
- Prior CORE confounder reports remain first-class packet evidence.
- Quantitative claims remain blocked until the LAW 9 harness is complete.

RED evidence captured before production files:

- schema test failed with missing `phase11-research-packet.schema.json`;
- packet test failed with missing `environment/phase11/research-packet.js`;
- ledger checker test failed with missing `check-phase11-ledger.js`;
- `validate-counts` failed with `schemaTests` expected 67, got 68.

Self-found hardening:

- initial explicit fail-closed probe showed `check-phase11-ledger` direct-run
  ignored `--changed-file`; fixed argv/env parsing and added a regression.
- post-fix probe fails as expected with `E_PHASE11_TRACE_MISSING` for
  `environment/phase11/not-traced.js` and passes for the traced
  `environment/phase11/research-packet.js`.

HAT 3 reviewer cleanup applied before commit:

- replaced a fail-closed but dead `claimReady` ternary with explicit
  `claimReady: false` plus a scaffold-only comment in
  `environment/phase11/research-packet.js`.
