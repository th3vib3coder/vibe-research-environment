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

## T11.0.2 HGSOC CD8 Script Formalization Trace

Changed Phase 11 VRE paths:

- `phase11-vre-feature-ledger.md`
- `environment/phase11/hgsoc-cd8-script.js`
- `environment/phase11/hgsoc_cd8_synthetic.py`
- `environment/schemas/phase11-hgsoc-cd8-script-contract.schema.json`
- `environment/tests/schemas/phase11-hgsoc-cd8-script-contract.schema.test.js`
- `environment/tests/ci/phase11-hgsoc-cd8-script.js`
- `environment/tests/ci/phase11-hgsoc-cd8-script.test.js`
- `environment/tests/ci/run-all.js`
- `environment/tests/ci/validate-counts.js`

HAT 1 amendments bound in HAT 2:

- task ships a reviewed synthetic-only Python artifact, not contract-only.
- default Python 3.14 is not authoritative for real h5ad; the contract pins
  `venv_scrna` Python 3.13.5 plus `anndata==0.12.9` and `numpy==2.3.5`.
- the pinned interpreter hint is repository-relative:
  `../../venv_scrna/Scripts/python.exe`.
- synthetic fixture is deterministic in-repo data, not sampled from GSE184880.
- heavy stack imports (`scanpy`, `numba`, `pynndescent`, `umap`) are deferred
  and fail closed if they appear in the reviewed script source.

Required inherited blockers:

- T11.0.2 performs no real GSE184880 execution and produces no claim.
- `GSE111976_full.h5ad` remains blocked as an invalid/stub h5ad input.
- real h5ad execution remains deferred to T11.0.3 with backed-r read policy.
- absent cell-type annotation and incomplete LAW 9 keep the quantitative path
  blocked even when the synthetic CD8/CXCL13 arithmetic is green.

RED evidence captured before production files:

- schema test failed with missing
  `phase11-hgsoc-cd8-script-contract.schema.json`;
- script semantic test failed with missing
  `environment/phase11/hgsoc-cd8-script.js`;
- `validate-counts` failed with `schemaTests` expected 68, got 69.

## T11.0.3 First Research Packet Execution Trace

Changed Phase 11 VRE paths:

- `phase11-vre-feature-ledger.md`
- `environment/phase11/first-research-packet.js`
- `environment/phase11/first_research_packet_probe.py`
- `environment/tests/ci/phase11-first-research-packet.js`
- `environment/tests/ci/phase11-first-research-packet.test.js`
- `environment/tests/ci/run-all.js`
- `environment/tests/ci/validate-counts.js`

HAT 1 amendments bound in HAT 2:

- blocked packet must be actionable, with exact unblock conditions and owner.
- real H5AD reads are local-only and must stay out of CI.
- execution-time H5AD hashes must be recomputed and compared to T11.0.0.
- `phase11.research-packet.v1` must be reused unless a new schema is justified.

Required inherited blockers:

- no reviewed CD8 cell-type derivation key exists for GSE184880.
- LAW 9 batch/donor harness is incomplete for quantitative claims.
- `GSE111976_full.h5ad` remains blocked as an invalid/stub h5ad input.
- T11.0.2 synthetic arithmetic cannot become real-data authority.
- scratch `analysis/scripts/hgsoc_cd8_subset.py` remains non-authoritative.

RED evidence captured before production files:

- `node --test environment/tests/ci/phase11-first-research-packet.test.js`
  failed with `ERR_MODULE_NOT_FOUND` for
  `environment/phase11/first-research-packet.js`.

Local real-data evidence:

- `../../venv_scrna/Scripts/python.exe` executed
  `environment/phase11/first_research_packet_probe.py` outside CI.
- nine GSE184880 HGSOC h5ad files were opened with `backed="r"` only.
- execution-time SHA-256 hashes matched T11.0.0 inventory hashes for all files.
- CXCL13 gene-symbol presence was verified in all selected h5ad files.
- output remains a blocked packet because reviewed CD8 derivation is absent
  and the LAW 9 batch/donor harness is incomplete.

## T11.1.0 Scientific Derivation Harness Contract Trace

who: codex

when: 2026-06-16

why: T11.0.3 proved that GSE184880 HGSOC files are present, hash-bound,
backed-r-readable, and CXCL13-present, but the quantitative path is still
blocked by absent reviewed CD8 derivation and incomplete LAW 9 batch/donor
harness evidence. T11.1.0 adds the positive contract for that scientific
authority before any Python/R runner or fraction work.

what:

- `phase11-vre-feature-ledger.md`
- `environment/phase11/scientific-derivation-harness.js`
- `environment/schemas/phase11-scientific-derivation-harness.schema.json`
- `environment/tests/schemas/phase11-scientific-derivation-harness.schema.test.js`
- `environment/tests/ci/phase11-scientific-derivation-harness.js`
- `environment/tests/ci/phase11-scientific-derivation-harness.test.js`
- `environment/tests/ci/run-all.js`
- `environment/tests/ci/validate-counts.js`

HAT 1 amendments bound in HAT 2:

- LAW 9 `complete` means evidence-of-control, not key presence or a
  `confounderStatus` string.
- batch and study-source completion require passing metric evidence; an iLISI
  value below threshold remains blocking.
- reviewed CD8 derivation requires an identifiable human reviewer decision
  artifact with hash; agent self-review is forbidden.

RED evidence captured before production files:

- schema test failed with missing
  `phase11-scientific-derivation-harness.schema.json`;
- semantic test failed with missing
  `environment/phase11/scientific-derivation-harness.js`.

verification:

- schema test 5/5 PASS.
- semantic test 18/18 PASS.
- CI validator PASS.
- `validate-counts` PASS with `schemas/schemaTests/ciValidators` at 70/70/45.
- Phase 9 and Phase 11 ledger checks PASS.
- `run-all.js` PASS.
- full `node --test --test-reporter=dot` PASS.
- `git diff --check` PASS with known Phase 9 ledger CRLF warning.

reviewer: Claude Code non-author HAT 3 ACCEPT recorded via
`C:/Users/Test-User/.codex/relay/nuove_skill_phase11/turns/claude-hat3-t11.1.0-scientific-derivation-harness-verdict-2026-06-16.md`.

Scope boundaries:

- no real GSE184880 execution;
- no Python/R runner;
- no CXCL13+ CD8 denominator, count, or fraction;
- no export eligibility integration;
- no biomedical claim promotion.
