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

## T11.1.1 Interpreter Manifest Contract Trace

who: codex

when: 2026-06-16

why: Phase 9 analysis manifests already admitted Python/R syntax, but did not
bind interpreter version, dependency lock, executable hint, environment file
hash state, or the known Python 3.14 heavy-stack seam. T11.1.1 adds that
manifest authority before T11.1.2 opens subprocess execution.

what:

- `phase11-vre-feature-ledger.md`
- `environment/phase11/interpreter-manifest.js`
- `environment/tests/ci/phase11-interpreter-manifest.js`
- `environment/tests/ci/phase11-interpreter-manifest.test.js`
- `environment/tests/ci/run-all.js`
- `environment/tests/ci/validate-counts.js`

HAT 1 amendments bound in HAT 2:

- the shared Phase 9 schema extension must be truly additive;
- Python 3.14 with `numba`, `pynndescent`, UMAP, or `scanpy` must be rejected
  semantically when claimed as resolved;
- Python/R runtime rejection must remain until T11.1.2;
- counts, `run-all.js`, and Phase 9/11 ledger checks must run before HAT 3.

RED evidence captured before production files:

- schema test rejected the new `environment` object and still accepted
  Python/R manifests without it;
- semantic test failed with missing
  `environment/phase11/interpreter-manifest.js`;
- `validate-counts` failed with `ciValidators` expected 45, got 46.

verification:

- schema test 9/9 PASS.
- semantic test 4/4 PASS.
- `validateAnalysisManifest` integration test 5/5 PASS.
- `run-analysis` CLI test 12/12 PASS, including pinned Python manifest still
  rejected before the executor opens.
- CI validator PASS.
- `validate-counts` PASS with `ciValidators` at 46.
- Phase 9 and Phase 11 ledger checks PASS.
- `run-all.js` PASS.
- full `node --test --test-reporter=dot` PASS.
- Wave 6 Scenario D plus aggregate acceptance regression PASS after the
  pinned Python fixture repair.
- `git diff --check` PASS with known Phase 9 ledger CRLF warning.

reviewer: Claude Code non-author HAT 3 ACCEPT recorded via
`C:/Users/Test-User/.codex/relay/nuove_skill_phase11/turns/claude-hat3-t11.1.1-interpreter-manifest-verdict-2026-06-16.md`.

Scope boundaries:

- no Python/R subprocess executor;
- no real GSE184880 execution or H5AD read;
- no notebook execution;
- no CD8/CXCL13 denominator, count, or fraction;
- no export eligibility integration;
- no biomedical claim promotion.

## T11.1.2 Interpreter Subprocess Executor Trace

who: codex

when: 2026-06-16

why: T11.1.1 made Python manifests reproducible and semantically validated,
but `run-analysis` still rejected every Python manifest. T11.1.2 opens the
smallest Python-first subprocess corridor while keeping scientific authority,
real H5AD reads, export, and claim promotion closed.

what:

- `phase11-vre-feature-ledger.md`
- `phase9-vre-feature-ledger.md`
- `environment/orchestrator/execution-lane.js`
- `environment/phase11/interpreter-manifest.js`
- `environment/acceptance/wave6-harness.js`
- `environment/tests/acceptance/wave6-harness.test.js`
- `environment/tests/cli/run-analysis.test.js`
- `environment/tests/ci/check-phase9-ledger.js`
- `environment/tests/ci/phase11-interpreter-executor.js`
- `environment/tests/ci/phase11-interpreter-executor.test.js`
- `environment/tests/ci/phase11-interpreter-manifest.js`
- `environment/tests/ci/phase11-interpreter-manifest.test.js`
- `environment/tests/ci/run-all.js`
- `environment/tests/ci/validate-counts.js`

HAT 1 amendments bound in HAT 2:

- executable resolution must canonicalize with `realpath`, stay inside the
  reviewed venv root, reject Windows `.cmd`/`.bat` wrappers, require the
  executable to exist, and never fall back to host PATH;
- Wave 6 Scenario D must fail closed for a concrete unsafe Python reason after
  Python support opens;
- open Python must not imply scientific readiness and must not read real
  GSE184880/H5AD or emit authoritative CXCL13+ CD8 quantitative outputs;
- existing Node `run-analysis` behavior must remain additive and green;
- counts, `run-all.js`, and Phase 9/11 ledger checks must run before HAT 3.

RED evidence captured before production edits:

- `run-analysis` fake Python success/security tests failed because the runtime
  still returned `E_ANALYSIS_TEMPLATE_UNSUPPORTED`;
- the unresolved-environment test preserved the semantic `E_PHASE11_*` code
  instead of collapsing it to a generic manifest failure;
- `check-phase11-ledger` failed with `E_PHASE11_TRACE_MISSING` before this row
  named the new executor validator.
- `run-all.js` exposed Phase 9 checker stdout maxBuffer exhaustion in the
  noisy local worktree before `check-phase9-ledger.js` set an explicit git
  output buffer.

verification so far:

- `node --test environment/tests/cli/run-analysis.test.js` PASS 21/21.
- `node --test environment/tests/ci/phase11-interpreter-manifest.test.js
  environment/tests/ci/phase11-interpreter-executor.test.js` PASS 5/5.
- `node environment/tests/ci/phase11-interpreter-manifest.js` PASS.
- `node environment/tests/ci/phase11-interpreter-executor.js` PASS.
- `node environment/tests/ci/validate-counts.js` PASS with `ciValidators` at
  47.

Scope boundaries:

- fake interpreter CI proves spawn/env/timeout/log/output corridor mechanics
  only; it is not a scientific authority;
- no real GSE184880 or H5AD read;
- no CXCL13+ CD8 denominator, count, or fraction;
- no export eligibility integration;
- no biomedical claim promotion;
- Rscript and notebook execution remain deferred.

Reviewer outcome:

Claude Code non-author HAT 3 ACCEPT recorded via
`C:/Users/Test-User/.codex/relay/nuove_skill_phase11/turns/claude-hat3-t11.1.2-interpreter-subprocess-executor-verdict-2026-06-16.md`.

Additional reviewer-confirmed verification:

- `node environment/tests/ci/check-phase9-ledger.js` PASS with expected
  private-ledger diagnostic.
- `node environment/tests/ci/check-phase11-ledger.js` PASS.
- `node environment/tests/ci/run-all.js` PASS.
- full `node --test --test-reporter=dot` PASS.
- WIKI registry, entity exports, schema fields, lint, and mirror checks PASS.

Reviewer non-blocking note applied: `check-phase9-ledger.js` maxBuffer
hardening is explicitly in scope for this task. It only prevents noisy local
git discovery output from truncating changed-file discovery and does not
weaken ledger rules.
