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

verification:

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

## T11.1.3 Scientific Invariant Blockers Trace

who: codex

when: 2026-06-17

why: T11.1.2 opened a manifest-gated Python subprocess corridor, but executor
success is not scientific authority. T11.1.3 adds the fail-closed export/claim
blocker layer for open confounders, killed or unverified citations, R2 reject,
and blocked dependencies before any scientific result can be treated as
claim-ready or export-ready.

what:

- `phase11-vre-feature-ledger.md`
- `phase9-vre-feature-ledger.md`
- `environment/phase11/scientific-invariant-blockers.js`
- `environment/lib/export-eligibility.js`
- `environment/tests/lib/export-eligibility.test.js`
- `environment/tests/ci/phase11-scientific-invariant-blockers.js`
- `environment/tests/ci/phase11-scientific-invariant-blockers.test.js`
- `environment/tests/ci/run-all.js`
- `environment/tests/ci/validate-counts.js`

HAT 1 amendments bound in HAT 2:

- scientific-substance claims must fail closed even without an opt-in flag;
- killed, invalidated, retracted, or withdrawn citations block independently
  of `verificationStatus`;
- R2 `status:passed` and `verdict:ACCEPT` are required beyond synthesis when
  scientific claim/export readiness requires R2;
- blocked dependency checks must be transitive and block even when the current
  claim head is `PROMOTED`;
- counts, Phase 9 bridge ledger, Phase 11 ledger, and `run-all.js` must be
  verified before HAT 3.

RED evidence captured before production edits:

- `node --test environment/tests/ci/phase11-scientific-invariant-blockers.test.js`
  failed with `ERR_MODULE_NOT_FOUND` before
  `environment/phase11/scientific-invariant-blockers.js` existed;
- `node --test environment/tests/lib/export-eligibility.test.js` showed the
  existing export path still returned eligible for unsafe scientific invariant
  evidence and for a scientific-substance claim without an opt-in flag.

verification:

- `node --test environment/tests/ci/phase11-scientific-invariant-blockers.test.js`
  PASS 9/9.
- `node --test environment/tests/lib/export-eligibility.test.js` PASS 8/8.
- `node environment/tests/ci/phase11-scientific-invariant-blockers.js` PASS.
- `node environment/tests/ci/validate-counts.js` PASS with `ciValidators` at
  48.
- Phase 9 and Phase 11 ledger checks PASS.
- `node environment/tests/ci/run-all.js` PASS.
- full `node --test --test-reporter=dot` PASS.
- `git diff --check` PASS.

Scope boundaries:

- no real GSE184880 or H5AD read;
- no CXCL13+ CD8 denominator, count, or fraction;
- no Rscript or notebook execution;
- no network;
- no export packaging implementation;
- no biomedical claim promotion.

Reviewer outcome:

Claude Code non-author HAT 1 ACCEPT recorded via
`C:/Users/Test-User/.codex/relay/nuove_skill_phase11/turns/claude-hat1-t11.1.3-scientific-invariant-blockers-verdict-2026-06-17.md`.

Claude Code non-author HAT 3 ACCEPT recorded via
`C:/Users/Test-User/.codex/relay/nuove_skill_phase11/turns/claude-hat3-t11.1.3-scientific-invariant-blockers-verdict-2026-06-17.md`.

Reviewer-confirmed verification:

- production `exportEligibility(...)` integration is a hard blocking reason,
  not an advisory detached checker;
- scientific-substance claims fail closed without an opt-in flag;
- killed citation lifecycle blocks independently from `VERIFIED`;
- R2 reject/missing and transitive blocked dependencies fail closed;
- non-scientific legacy export behavior remains compatible;
- no real data read, fraction/count/denominator, export packaging, or claim
  promotion is opened.

## T11.1.4 Coverage And Regression Harness Trace

who: codex

when: 2026-06-17

why: T11.1.0 through T11.1.3 were individually green, but Claude Code and an
independent pre-review identified a modular false-green risk: fake execution,
the scientific derivation harness, scientific invariant blockers, and export
eligibility could pass in isolation while the combined path leaked authority.
T11.1.4 adds the focused regression harness and hardens structural scientific
lineage classification.

what:

- `phase11-vre-feature-ledger.md`
- `phase9-vre-feature-ledger.md`
- `environment/phase11/scientific-invariant-blockers.js`
- `environment/tests/ci/phase11-coverage-regression-harness.js`
- `environment/tests/ci/phase11-coverage-regression-harness.test.js`
- `environment/tests/ci/run-all.js`
- `environment/tests/ci/validate-counts.js`

HAT 1 amendments bound in HAT 2:

- structural-lineage RED must block through the production export decision,
  not only helper-level fixtures;
- if the writing/export caller cannot supply structural scientific evidence
  for a real decision, HAT 2 must stop and re-hand off before GREEN;
- HAT 3 must show new T11.1.4 Phase 11 and Phase 9 bridge ledger rows naming
  touched shared CI files; checker pass alone is insufficient;
- classifier hardening must preserve existing T11.1.3 killed-citation, R2,
  transitive dependency, text/harness substance detection, and legacy
  non-scientific pass-through behavior;
- counts, `run-all.js`, Phase 9/11 ledger checks, and WIKI checks must be
  recomputed from the actual diff.

RED evidence captured before production hardening:

- `node --test environment/tests/ci/phase11-coverage-regression-harness.test.js`
  failed because a keyword-free structural scientific lineage claim returned
  `eligible:true` through `exportEligibility(...)`;
- `node environment/tests/ci/phase11-coverage-regression-harness.js` failed on
  the same structural-lineage export path;
- `node environment/tests/ci/validate-counts.js` failed `ciValidators`
  expected 48, got 49;
- `node environment/tests/ci/run-all.js` failed before the new validator was
  wired and before Phase 11 ledger trace existed.

verification so far:

- `node --test environment/tests/ci/phase11-coverage-regression-harness.test.js`
  PASS 9/9.
- `node environment/tests/ci/phase11-coverage-regression-harness.js` PASS.
- `node --test environment/tests/ci/phase11-scientific-invariant-blockers.test.js`
  PASS 9/9.
- `node --test environment/tests/lib/export-eligibility.test.js` PASS 8/8.
- `node environment/tests/ci/validate-counts.js` PASS with `ciValidators` at
  49.

Scope boundaries:

- no real GSE184880 or H5AD read;
- no CXCL13+ CD8 denominator, count, or fraction;
- no Rscript or notebook execution;
- no network;
- no export packaging implementation;
- no biomedical claim promotion.

Reviewer outcome:

Claude Code non-author HAT 1 ACCEPT recorded via
`C:/Users/Test-User/.codex/relay/nuove_skill_phase11/turns/claude-hat1-t11.1.4-coverage-regression-harness-verdict-2026-06-17.md`.

## T11.1.5 Wave 11.1 Closeout Trace

who: codex

when: 2026-06-17

why: T11.1.0 through T11.1.4 are closed and CI-green, but Wave 11.1 must close
as a scientific-lane foundation, not as a biomedical result. Claude Code HAT 1
ACCEPT required a fail-closed closeout fixture and validator, plus independent
grounding of the five-task roster against git and GitHub Actions before HAT 3.

what:

- `phase11-vre-feature-ledger.md`
- `phase9-vre-feature-ledger.md`
- `environment/tests/fixtures/phase11/wave-11-1-closeout.json`
- `environment/tests/ci/phase11-wave-11-1-closeout.js`
- `environment/tests/ci/phase11-wave-11-1-closeout.test.js`
- `environment/tests/ci/run-all.js`
- `environment/tests/ci/validate-counts.js`

HAT 1 amendments bound in HAT 2:

- ground-truth each roster commit as an ancestor of `origin/main` and each CI
  run as success/matching head SHA via git/gh; fixture self-consistency is not
  sufficient;
- add new diff-grounded Phase 11 closeout trace and Phase 9 bridge row because
  `validate-counts.js` and `run-all.js` are touched;
- close Wave 11.1 only; Phase 11 remains open and Wave 11.2 remains unopened;
- preserve no biomedical claim, real-data read, fraction, Rscript/notebook,
  network, export packaging, or claim-promotion boundaries.

RED evidence captured before GREEN:

- `node --test environment/tests/ci/phase11-wave-11-1-closeout.test.js`
  failed with `ERR_MODULE_NOT_FOUND` before the validator existed;
- `node environment/tests/ci/validate-counts.js` failed `ciValidators`
  expected 49, got 50;
- `node environment/tests/ci/check-phase11-ledger.js` failed
  `E_PHASE11_TRACE_MISSING` for the closeout validator;
- `node environment/tests/ci/run-all.js` failed on the count invariant and
  missing Phase 11 trace before wiring/count/ledger updates.

verification so far:

- `node --test environment/tests/ci/phase11-wave-11-1-closeout.test.js`
  PASS 7/7.
- `node environment/tests/ci/phase11-wave-11-1-closeout.js` PASS.

Scope boundaries:

- no real GSE184880 or H5AD read;
- no CXCL13+ CD8 denominator, count, or fraction;
- no Rscript or notebook execution;
- no network;
- no export packaging implementation;
- no biomedical claim promotion;
- no Wave 11.2 opening;
- no Phase 11 full closeout.

Reviewer outcome:

Claude Code non-author HAT 1 ACCEPT recorded via
`C:/Users/Test-User/.codex/relay/nuove_skill_phase11/turns/claude-hat1-t11.1.5-wave-11.1-closeout-verdict-2026-06-17.md`.

## T11.2.0 State-Source Taxonomy Trace

who: codex

when: 2026-06-17

why: Wave 11.2 needs a deterministic state-source contract before any doctor
or reconcile runtime opens. Claude Code HAT 1 ACCEPT required a fail-closed
taxonomy that distinguishes authority, projection, runtime ledger, scratch
noise, and state-risk surfaces, explicitly protects `analysis/` and other
operator/research scratch from auto-delete, and forward-binds T11.2.1/T11.2.2
to consume the taxonomy instead of duplicating delete/regenerate logic.

what:

- `phase11-vre-feature-ledger.md`
- `phase9-vre-feature-ledger.md`
- `environment/tests/fixtures/phase11/state-source-taxonomy.json`
- `environment/tests/ci/phase11-state-source-taxonomy.js`
- `environment/tests/ci/phase11-state-source-taxonomy.test.js`
- `environment/tests/ci/run-all.js`
- `environment/tests/ci/validate-counts.js`

HAT 1 amendments bound in HAT 2:

- `analysis/`, `audit.config.yaml`, `audit/`, and nested `vibe-science/` must
  be classified as `never-auto-delete`;
- disposable scratch such as `.tmp-vre-*` and `.tmp/` may be cleanup-eligible
  only with an explicit cleanup owner;
- authorities must be compare-only and not regenerated by the doctor;
- projections must name both generator and check commands;
- T11.2.1 doctor drift and T11.2.2 reconcile must consume the taxonomy
  cleanup policy and authority/projection rules as their binding source.

RED evidence captured before GREEN:

- `node --test environment/tests/ci/phase11-state-source-taxonomy.test.js`
  failed with `ERR_MODULE_NOT_FOUND` before the validator existed;
- `node environment/tests/ci/validate-counts.js` failed `ciValidators`
  expected 50, got 51;
- `node environment/tests/ci/check-phase11-ledger.js` failed
  `E_PHASE11_TRACE_MISSING` for the taxonomy validator before this trace;
- `node environment/tests/ci/run-all.js` failed on the count invariant and
  missing Phase 11 trace before wiring/count/ledger updates.

verification so far:

- `node --test environment/tests/ci/phase11-state-source-taxonomy.test.js`
  PASS 10/10.
- `node environment/tests/ci/phase11-state-source-taxonomy.js` PASS.

Scope boundaries:

- no doctor CLI implementation;
- no scratch deletion or cleanup;
- no semantic reconciliation or automatic conflict resolution;
- no Wave 11.2 closeout;
- no Phase 11 full closeout;
- no real H5AD read, fraction/count/denominator, export packaging, or
  biomedical claim promotion.

reviewer:

Claude Code non-author HAT 1 ACCEPT recorded via
`C:/Users/Test-User/.codex/relay/nuove_skill_phase11/turns/claude-hat1-t11.2.0-state-source-taxonomy-verdict-2026-06-17.md`.

Claude Code non-author HAT 3 ACCEPT recorded via
`C:/Users/Test-User/.codex/relay/nuove_skill_phase11/turns/claude-hat3-t11.2.0-state-source-taxonomy-verdict-2026-06-17.md`.

## T11.2.1 Doctor Drift Detector Trace

who: codex

when: 2026-06-17

why: T11.2.0 classified Wave 11.2 authorities, projections, runtime ledgers,
CI enforcement, scratch/noise, and state-risk surfaces, but still had no
read-only doctor that could report drift without deleting scratch, regenerating
authorities, or silently treating local noise as live VRE state. T11.2.1 adds
that report-only layer before any reconcile or cleanup task opens.

what:

- `phase11-vre-feature-ledger.md`
- `phase9-vre-feature-ledger.md`
- `environment/phase11/doctor-drift-detector.js`
- `environment/tests/ci/phase11-doctor-drift-detector.js`
- `environment/tests/ci/phase11-doctor-drift-detector.test.js`
- `environment/tests/ci/run-all.js`
- `environment/tests/ci/validate-counts.js`

HAT 1 amendments bound in HAT 2:

- the detector must be literally read-only and emit `actions: []`;
- taxonomy `kind`, `path`, `cleanupPolicy`, `cleanupEligible`, and
  `regenerationAllowed` are the binding source for classification;
- authority regeneration attempts are reported as semantic conflicts, not
  executed;
- `analysis/`, `audit.config.yaml`, `audit/`, and nested `vibe-science/`
  remain never-auto-delete operator/research scratch;
- `.tmp-vre-*` and `.tmp/` are classified as owned scratch only when the
  taxonomy names an explicit cleanup owner;
- T11.2.1 stays unbundled from T11.2.2 reconcile and Wave 11.2 closeout.

RED evidence captured before GREEN:

- `node --test environment/tests/ci/phase11-doctor-drift-detector.test.js`
  failed with `ERR_MODULE_NOT_FOUND` before
  `environment/phase11/doctor-drift-detector.js` existed;
- `node environment/tests/ci/check-phase11-ledger.js --changed-file ...`
  failed with `E_PHASE11_TRACE_MISSING` before this trace named the new
  helper and validator paths.

verification so far:

- `node --test environment/tests/ci/phase11-doctor-drift-detector.test.js`
  PASS 11/11.
- `node environment/tests/ci/phase11-doctor-drift-detector.js` PASS.
- `node environment/tests/ci/validate-counts.js` PASS with `ciValidators`
  at 52.
- explicit Phase 9 and Phase 11 ledger probes PASS with T11.2.1 changed files
  and private Phase 9 ledger note included.
- `node environment/tests/ci/run-all.js` PASS.
- WIKI registry, entity export, schema field, lint, mirror, coverage, and
  decision-gate JSON checks PASS.
- `git diff --check` PASS.
- `npm run check` PASS with 1472 tests, 1463 pass, 0 fail, 9 skipped.

Scope boundaries:

- no `vre doctor` CLI;
- no projection generator execution;
- no scratch deletion or cleanup;
- no semantic reconciliation or automatic conflict resolution;
- no Wave 11.2 closeout;
- no Phase 11 full closeout;
- no real H5AD read, fraction/count/denominator, export packaging, or
  biomedical claim promotion.

reviewer:

Claude Code non-author HAT 1 ACCEPT recorded via
`C:/Users/Test-User/.codex/relay/nuove_skill_phase11/turns/claude-hat1-t11.2.1-doctor-drift-detector-verdict-2026-06-17.md`.

Claude Code non-author HAT 3 ACCEPT recorded via
`C:/Users/Test-User/.codex/relay/nuove_skill_phase11/turns/claude-hat3-t11.2.1-doctor-drift-detector-verdict-2026-06-17.md`.

## T11.2.2 Doctor Reconcile Mode Trace

who: codex

when: 2026-06-17

why: T11.2.1 can report drift but intentionally emits no actions. T11.2.2
opens the narrow reconcile layer that turns those report issues into safe,
reviewable plans, while allowing actual deletion only for taxonomy-owned
scratch under explicit non-dry-run and post-canonicalization safety checks.

what:

- `phase11-vre-feature-ledger.md`
- `phase9-vre-feature-ledger.md`
- `environment/phase11/doctor-reconcile-mode.js`
- `environment/tests/ci/phase11-doctor-reconcile-mode.js`
- `environment/tests/ci/phase11-doctor-reconcile-mode.test.js`
- `environment/tests/ci/run-all.js`
- `environment/tests/ci/validate-counts.js`

HAT 1 amendments bound in HAT 2:

- reconcile plans must be derived from T11.2.1 doctor report issues and the
  T11.2.0 taxonomy, never from caller-supplied destructive actions;
- `analysis/`, `audit.config.yaml`, `audit/`, and nested `vibe-science/`
  remain protected `never-auto-delete` scratch;
- `.tmp-vre-*` and `.tmp/` cleanup requires taxonomy `cleanupEligible:true`,
  `cleanupPolicy: owned-cleanup`, and matching `cleanupOwner`;
- dry-run is the default and must mutate nothing;
- before any unlink/rm, the target is realpath-canonicalized and re-checked
  for workspace containment plus protected-path membership;
- non-dry-run scratch cleanup requires an owned-scratch marker at the cleanup
  root, `.vre-owned-scratch.json`, with matching `sourceId` and
  `cleanupOwner`, so opaque Windows/MSYS links fail closed before mutation;
- projection regeneration is plan-only and never spawns WIKI generators;
- authority regeneration and semantic conflicts are reported, not resolved.

RED evidence captured before GREEN:

- `node --test environment/tests/ci/phase11-doctor-reconcile-mode.test.js`
  failed with `ERR_MODULE_NOT_FOUND` before
  `environment/phase11/doctor-reconcile-mode.js` existed;
- `node environment/tests/ci/validate-counts.js` failed with
  `ciValidators` expected 52, got 53 before the count was updated.

verification:

- `node --test environment/tests/ci/phase11-doctor-reconcile-mode.test.js`
  PASS 12/12, including dry-run no-mutation, explicit owned scratch delete
  with marker, protected `analysis/` block, caller action rejection,
  Node-recognized symlink/junction block, native `ln.exe`/junction-like
  protected/outside file survival, projection plan-only, authority conflict,
  source/path mismatch, and invalid report fail-closed cases;
- `node environment/tests/ci/phase11-doctor-reconcile-mode.js` PASS;
- synthetic Claude-shape `.tmp-evil -> protected-data` and
  `.tmp-out -> outside` probe blocked with `executed=0`; both files survived;
- `node environment/tests/ci/validate-counts.js` PASS with
  `ciValidators:53`;
- explicit Phase 11 and Phase 9 ledger probes PASS;
- `node environment/tests/ci/run-all.js` PASS;
- WIKI checks PASS after export inventory/registry/mirror refresh;
- `git diff --check` PASS;
- `npm run check` PASS with 1484 tests, 1475 pass, 0 fail, 9 skipped.

Scope boundaries:

- no root `vre doctor` CLI;
- no private-WIKI write from VRE runtime;
- no shell-spawned projection generator;
- no authority regeneration;
- no semantic conflict resolution;
- no Wave 11.2 closeout;
- no Phase 11 full closeout;
- no real H5AD read, fraction/count/denominator, export packaging, or
  biomedical claim promotion.

reviewer:

Claude Code non-author HAT 1 ACCEPT recorded via
`C:/Users/Test-User/.codex/relay/nuove_skill_phase11/turns/claude-hat1-t11.2.2-doctor-reconcile-mode-verdict-2026-06-17.md`.

Claude Code non-author HAT 3 ACCEPT recorded via
`C:/Users/Test-User/.codex/relay/nuove_skill_phase11/turns/claude-hat3-t11.2.2-doctor-reconcile-mode-second-redirect-fix-verdict-2026-06-17.md`.

who: codex

when: 2026-06-17

why: T11.2.2 can report and plan around WIKI drift only when a caller supplies
trusted `observedState`. T11.2.3 adds a read-only WIKI fidelity observer that
derives the doctor-facing WIKI checks and coverage entries from supplied WIKI
evidence, so stale or contradictory WIKI coverage cannot remain a hand-waved
green check.

what:

- `phase11-vre-feature-ledger.md`
- `phase9-vre-feature-ledger.md`
- `environment/phase11/wiki-fidelity-observer.js`
- `environment/tests/ci/phase11-wiki-fidelity-observer.js`
- `environment/tests/ci/phase11-wiki-fidelity-observer.test.js`
- `environment/tests/ci/run-all.js`
- `environment/tests/ci/validate-counts.js`
- `../vibe-science/blueprints/private/WIKI_VRE/entities/phase11-wiki-fidelity-observer-js.md`
- `../vibe-science/blueprints/private/phase9-vre-autonomous-research-loop/16-implementation-status-ledger.md`

HAT 1 amendments bound in HAT 2:

- freshness is non-circular: the primary signal is cross-artifact disagreement,
  not a caller-typed expected date;
- the real current WIKI artifacts
  `coverage-summary.json`, `ownership-resolution-summary.json`, and
  `live-source-gaps.md` must be probed through the helper and
  `buildDoctorDriftReport`;
- WIKI coverage paths are normalized from
  `vibe-research-environment/<path>` to VRE-repo-relative paths only, while
  sibling `vibe-science/` remains distinct from nested
  `vibe-research-environment/vibe-science/`;
- downstream reconcile proof must show `executedActions: []` and projection
  plans with `execute:false`;
- `doctor-drift-detector.js`, `doctor-reconcile-mode.js`, and the T11.2.0
  taxonomy fixture remain immutable surfaces for this task.

RED evidence captured before GREEN:

- `node --test environment/tests/ci/phase11-wiki-fidelity-observer.test.js`
  failed with `ERR_MODULE_NOT_FOUND` before
  `environment/phase11/wiki-fidelity-observer.js` existed;
- `node environment/tests/ci/phase11-wiki-fidelity-observer.js` failed with
  the same missing helper before implementation;
- `node environment/tests/ci/validate-counts.js` failed with
  `ciValidators` expected 53, got 54 before the count was updated;
- `node environment/tests/ci/run-all.js` failed with
  `E_PHASE11_TRACE_MISSING environment/phase11/wiki-fidelity-observer.js`
  before this ledger trace was added.

verification:

- `node --test environment/tests/ci/phase11-wiki-fidelity-observer.test.js`
  PASS 9/9, including registry drift, mirror drift, non-circular coverage
  freshness, three-source count mismatch, VRE path normalization,
  sibling-vs-nested `vibe-science/`, fail-closed malformed evidence,
  reconcile boundedness, real on-disk WIKI artifact drift, and no spawn/write
  source scan;
- `node environment/tests/ci/phase11-wiki-fidelity-observer.js` PASS;
- `node environment/tests/ci/validate-counts.js` PASS with
  `ciValidators:54`;
- explicit `node environment/tests/ci/check-phase11-ledger.js
  --changed-file=...` PASS for the T11.2.3 VRE delta;
- explicit `node environment/tests/ci/check-phase9-ledger.js
  --changed-file=...` PASS after Phase 9 bridge row 171 and the private Phase
  9 implementation-status ledger note were both included;
- `node environment/tests/ci/run-all.js` PASS;
- WIKI checks PASS: `build-registries --check`, `audit-entity-exports`
  with 0 errors and 6 pre-existing missing-owner warnings, `audit-schema-fields`,
  `wiki-lint` issueCount 0, `sync-mirror --check` changed 0, and
  `generate-vre-coverage --check`;
- `git diff --check` PASS;
- decision gates JSON parse PASS;
- `npm run check` PASS with 1493 tests, 1484 pass, 0 fail, 9 skipped.

Scope boundaries:

- no root `vre doctor` CLI;
- no private-WIKI write from VRE runtime;
- no shell-spawned WIKI generator;
- no scratch deletion or cleanup;
- no automatic semantic decision or authority regeneration;
- no Wave 11.2 closeout;
- no Phase 11 full closeout;
- no real H5AD read, fraction/count/denominator, export packaging, or
  biomedical claim promotion.

reviewer:

Claude Code non-author HAT 1 REDIRECT recorded via
`C:/Users/Test-User/.codex/relay/nuove_skill_phase11/turns/claude-hat1-t11.2.3-wiki-fidelity-integration-verdict-2026-06-17.md`.

Claude Code non-author HAT 1 ACCEPT after amendment recorded via
`C:/Users/Test-User/.codex/relay/nuove_skill_phase11/turns/claude-hat1-t11.2.3-wiki-fidelity-integration-rereview-verdict-2026-06-17.md`.

Claude Code non-author HAT 3 ACCEPT recorded via
`C:/Users/Test-User/.codex/relay/nuove_skill_phase11/turns/claude-hat3-t11.2.3-wiki-fidelity-integration-verdict-2026-06-17.md`.

## T11.2.4 Research-Loop Governance Flake Trace

Changed Phase 11 VRE paths:

- `phase11-vre-feature-ledger.md`
- `phase9-vre-feature-ledger.md`
- `environment/tests/cli/research-loop.test.js`
- `environment/phase11/doctor-drift-detector.js`
- `environment/tests/fixtures/phase11/state-source-taxonomy.json`
- `environment/tests/ci/phase11-state-source-taxonomy.js`
- `environment/tests/ci/phase11-state-source-taxonomy.test.js`
- `environment/tests/ci/phase11-doctor-drift-detector.js`
- `environment/tests/ci/phase11-doctor-drift-detector.test.js`
- `environment/tests/ci/phase11-doctor-reconcile-mode.js`
- `environment/tests/ci/phase11-doctor-reconcile-mode.test.js`
- `environment/tests/ci/phase11-wiki-fidelity-observer.js`
- `environment/tests/ci/phase11-wiki-fidelity-observer.test.js`

HAT 1 binding conditions honored in HAT 2:

- the fix extends the existing governance-event identity helpers instead of
  adding an event-type-only selector;
- the selector keys on `event_type`, `source_component`, `objective_id`, and
  relevant `details` identity;
- duplicate matching events remain fail-closed;
- state-risk closure requires evidence pointing at the deterministic
  regression and duplicate-guard tests.

RED evidence captured before GREEN:

- `node --test --test-name-pattern="research-loop logs objective_blocked governance event for rule-only blocker" environment/tests/cli/research-loop.test.js`
  failed with `2 !== 1` after seeding an unrelated governance event into the
  capture file while the old total-count assertion remained;
- `node --test --test-name-pattern="reviewed-closed state-risk without closure evidence fails closed" environment/tests/ci/phase11-state-source-taxonomy.test.js`
  failed because the taxonomy validator ignored evidence-less closed risks;
- `node --test --test-name-pattern="reviewed-closed state-risk without closure evidence is reported" environment/tests/ci/phase11-doctor-drift-detector.test.js`
  failed because the doctor report accepted an evidence-less closed risk.

GREEN verification:

- targeted seeded-unrelated governance regression PASS;
- duplicate matching event guard PASS;
- taxonomy evidence-less closure test PASS;
- doctor evidence-less closure test PASS;
- `node --test environment/tests/cli/research-loop.test.js` PASS 48/48;
- `node --test environment/tests/ci/phase11-state-source-taxonomy.test.js`
  PASS 11/11;
- `node environment/tests/ci/phase11-state-source-taxonomy.js` PASS;
- `node --test environment/tests/ci/phase11-doctor-drift-detector.test.js`
  PASS 12/12;
- `node environment/tests/ci/phase11-doctor-drift-detector.js` PASS;
- `node --test environment/tests/ci/phase11-doctor-reconcile-mode.test.js`
  PASS 12/12;
- `node environment/tests/ci/phase11-doctor-reconcile-mode.js` PASS;
- `node --test environment/tests/ci/phase11-wiki-fidelity-observer.test.js`
  PASS 9/9;
- `node environment/tests/ci/phase11-wiki-fidelity-observer.js` PASS;
- `node environment/tests/ci/validate-counts.js` PASS, counts unchanged;
- explicit `node environment/tests/ci/check-phase11-ledger.js
  --changed-file=...` PASS for the T11.2.4 VRE delta;
- explicit `node environment/tests/ci/check-phase9-ledger.js
  --changed-file=...` PASS after Phase 9 bridge row 172 and the private Phase
  9 implementation-status ledger note were both included;
- `node environment/tests/ci/run-all.js` PASS;
- `npm run check` PASS with 1496 tests, 1487 pass, 0 fail, 9 skipped;
- `git diff --check` PASS;
- WIKI checks PASS after generated registry/export refresh: local `wiki-lint`
  issueCount 0, `sync-mirror --check` changed 0, `build-registries --check`
  changed 0, `audit-entity-exports` ok with 0 errors and 6 pre-existing
  missing-owner warnings, `audit-schema-fields` ok, and
  `generate-vre-coverage --check` ok.

Scope boundaries:

- no Wave 11.2 closeout;
- no Phase 11 full closeout;
- no root `vre doctor` CLI;
- no private-WIKI write from VRE runtime;
- no scratch deletion or cleanup;
- no automatic semantic decision or authority regeneration;
- no real H5AD read, fraction/count/denominator, export packaging, or
  biomedical claim promotion.

reviewer:

Claude Code non-author HAT 1 ACCEPT recorded via
`C:/Users/Test-User/.codex/relay/nuove_skill_phase11/turns/claude-hat1-t11.2.4-research-loop-governance-flake-verdict-2026-06-17.md`.

Codex HAT 3 handoff authored at
`C:/Users/Test-User/Desktop/Tesi_Python_scRNA/nuove_skill/vibe-science/blueprints/private/phase11-implementation-plan/40-hat3-t11-2-4-research-loop-governance-flake-closure-2026-06-17.md`.

Claude Code non-author HAT 3 ACCEPT recorded via
`C:/Users/Test-User/.codex/relay/nuove_skill_phase11/turns/claude-hat3-t11.2.4-research-loop-governance-flake-verdict-2026-06-17.md`.

## T11.2.5 Wave 11.2 Closeout Trace

Changed Phase 11 VRE paths:

- `phase11-vre-feature-ledger.md`
- `phase9-vre-feature-ledger.md`
- `environment/tests/fixtures/phase11/wave-11-2-closeout.json`
- `environment/tests/ci/phase11-wave-11-2-closeout.js`
- `environment/tests/ci/phase11-wave-11-2-closeout.test.js`
- `environment/tests/ci/run-all.js`
- `environment/tests/ci/validate-counts.js`
- `../vibe-science/blueprints/private/WIKI_VRE/closures/phase11-wave-11-2-closeout-2026-06-17.md`
- `../vibe-science/blueprints/private/WIKI_VRE/closures/phase11-wave-11-2-closeout-evidence-2026-06-17.json`
- `../vibe-science/blueprints/private/phase9-vre-autonomous-research-loop/16-implementation-status-ledger.md`

HAT 1 binding conditions honored in HAT 2:

- the closeout markdown carries a real `## Delivery Attestation` fenced JSON
  block, outside code fences;
- the closeout markdown is checked with `validate-closeout-honesty.js` against
  linked evidence files;
- the new validator follows the `phase11-wave-11-1-closeout.js` per-wave
  pattern, not the general closeout-honesty linter surface;
- REQUIRED_TASKS are `T11.2.0` through `T11.2.4`;
- FORBIDDEN_BOUNDARIES include root doctor CLI, private-WIKI runtime writes,
  runtime-spawned generators, semantic auto-resolution, real H5AD/GEO reads,
  export packaging, claim promotion, and Phase 11 full closeout.

RED evidence captured before GREEN:

- `node --test environment/tests/ci/phase11-wave-11-2-closeout.test.js`
  failed with `ERR_MODULE_NOT_FOUND` before the validator existed;
- `node environment/tests/ci/validate-counts.js` failed with
  `ciValidators` expected 54, got 55 before the count was updated;
- `node environment/tests/ci/run-all.js` failed through the aggregate count
  and Phase 11 trace checks before count and ledger repair;
- explicit `node environment/tests/ci/check-phase9-ledger.js
  --changed-file=...` failed until the Phase 9 bridge row and private Phase 9
  status-ledger note were included;
- explicit `node environment/tests/ci/check-phase11-ledger.js
  --changed-file=...` failed with `E_PHASE11_TRACE_MISSING` before this trace
  named the new closeout files.

verification:

- `node --test environment/tests/ci/phase11-wave-11-2-closeout.test.js`
  PASS 7/7;
- `node environment/tests/ci/phase11-wave-11-2-closeout.js` PASS;
- `node environment/tests/ci/validate-counts.js` PASS with
  `ciValidators:55`;
- explicit `node environment/tests/ci/check-phase11-ledger.js
  --changed-file=...` PASS for the T11.2.5 VRE delta;
- explicit `node environment/tests/ci/check-phase9-ledger.js
  --changed-file=...` PASS after Phase 9 bridge row 173 and the private Phase
  9 implementation-status ledger note were both included;
- `node environment/tests/ci/run-all.js` PASS;
- full `npm run check` PASS;
- WIKI checks PASS: `build-registries --check`, `audit-entity-exports`,
  `audit-schema-fields`, `wiki-lint`, `sync-mirror --check`,
  `generate-vre-coverage --check`, and closeout-honesty validation against
  the Wave 11.2 closeout markdown;
- `git diff --check` PASS;
- decision gates JSON and closeout evidence JSON parse PASS.

Scope boundaries:

- closes Wave 11.2 state-reconciliation foundation only;
- no Phase 11 full closeout;
- no root `vre doctor` CLI;
- no private-WIKI write from VRE runtime;
- no runtime-spawned WIKI generator;
- no scratch deletion or cleanup beyond the already-reviewed owned-marker
  planner contract;
- no automatic semantic decision or authority regeneration;
- no real H5AD/GEO read, fraction/count/denominator, export packaging, or
  biomedical claim promotion.

reviewer:

Claude Code non-author HAT 1 ACCEPT recorded via
`C:/Users/Test-User/.codex/relay/nuove_skill_phase11/turns/claude-hat1-t11.2.5-wave-11.2-closeout-verdict-2026-06-17.md`.

Claude Code non-author HAT 3 ACCEPT recorded via
`C:/Users/Test-User/.codex/relay/nuove_skill_phase11/turns/claude-hat3-t11.2.5-wave-11.2-closeout-verdict-2026-06-17.md`.

Reviewer-confirmed verification:

- fail-closed fixture probes covered missing task, non-closed task, missing
  commit, non-green CI, missing follow-up closure, forbidden boundary,
  Phase 11 full-closeout overclaim, and weakened follow-up evidence;
- all five Wave 11.2 roster commits were grounded as ancestors of
  `origin/main`;
- the T11.2.4 governance-flake follow-up closure was grounded in the
  authoritative closed evidence, not in a historical open gate snapshot;
- Delivery Attestation and closeout-honesty checks are real and distinct from
  the new per-wave closeout validator;
- `run-all.js` and full `npm run check` passed with 1503 tests, 1494 pass,
  0 fail, and 9 skipped.

## T11.3.0 Generated Current Status Trace

Changed Phase 11 VRE paths:

- `README.md`
- `phase11-vre-feature-ledger.md`
- `phase9-vre-feature-ledger.md`
- `environment/phase11/current-status.js`
- `environment/tests/fixtures/phase11/current-status-authority.json`
- `environment/tests/fixtures/phase11/current-status-wiki.md`
- `environment/tests/ci/phase11-current-status.js`
- `environment/tests/ci/phase11-current-status.test.js`
- `environment/tests/ci/run-all.js`
- `environment/tests/ci/validate-counts.js`
- `../vibe-science/blueprints/private/WIKI_VRE/state/current-status.md`
- `../vibe-science/blueprints/private/WIKI_VRE/log.md`
- `../vibe-science/blueprints/private/WIKI_VRE/state/decision-gates.json`

HAT 1 binding conditions honored in HAT 2:

- README English and Italian current-status and surface-count sections are
  marker-bounded generated projections, not hand-maintained stale prose;
- the CI validator reads only tracked VRE files: README plus
  `environment/tests/fixtures/phase11/current-status-authority.json` and
  `environment/tests/fixtures/phase11/current-status-wiki.md`;
- the private WIKI authority relation is recorded as a HAT handoff
  cross-check, not as a sibling `../vibe-science` CI dependency;
- surface counts come from live `expectedCounts` exported by
  `environment/tests/ci/validate-counts.js`;
- carry-forward/deferred items enumerate `FU-EOF-NOISE-CLEANUP`,
  `W10.4-DEFERRED-EXPORT-PACKAGING-001`,
  `W10.5-DEFERRED-PERSISTED-MULTI-DOMAIN-EXECUTION-001`, and
  `GRAPHIFY-DEFERRED-NOT-READY-FOR-BRIDGE`.

RED evidence captured before GREEN:

- `node --test environment/tests/ci/phase11-current-status.test.js` failed
  with `ERR_MODULE_NOT_FOUND` before `environment/phase11/current-status.js`
  existed;
- the new fail-closed test suite covers stale English/Italian README status,
  stale surface counts, private sibling-WIKI CI dependency, snapshot drift
  against canonical private WIKI, missing carry-forward items, and Phase 11
  full-closeout overclaim;
- `validate-counts` required `ciValidators` to move from 55 to 56 after the
  new non-test CI validator was added;
- `run-all.js` required explicit wiring for `phase11-current-status`.

verification:

- `node --test environment/tests/ci/phase11-current-status.test.js` PASS 8/8;
- `node environment/tests/ci/phase11-current-status.js` PASS;
- `node environment/tests/ci/validate-counts.js` PASS with
  `ciValidators:56`;
- explicit `node environment/tests/ci/check-phase11-ledger.js
  --changed-file=...` PASS for the T11.3.0 VRE delta;
- explicit `node environment/tests/ci/check-phase9-ledger.js
  --changed-file=...` PASS after including Phase 9 bridge row 174 and the
  private Phase 9 implementation-status ledger path;
- `node environment/tests/ci/run-all.js` PASS;
- full `npm run check` PASS with 1511 tests, 1502 pass, 0 fail, and
  9 skipped;
- WIKI checks PASS: `build-registries --check`, `wiki-lint`,
  `sync-mirror --check`, `audit-schema-fields`, and
  `generate-vre-coverage --check`;
- WIKI entity export audit PASS with no errors and the six pre-existing
  Phase 11 missing-owner warnings unchanged;
- `git diff --check` PASS;
- decision gates JSON and current-status authority JSON parse PASS;
- tracked VRE `current-status-wiki.md` and private WIKI
  `state/current-status.md` compare equal.

Scope boundaries:

- no Phase 11 full closeout;
- no root `vre doctor` CLI;
- no private-WIKI read from repository CI;
- no VRE runtime writing into the private WIKI;
- no runtime-spawned WIKI generator;
- no scratch deletion or cleanup;
- no automatic semantic decision or authority regeneration;
- no real H5AD/GEO read, fraction/count/denominator, export packaging, or
  biomedical claim promotion.

reviewer:

Claude Code non-author HAT 1 ACCEPT recorded via
`C:/Users/Test-User/.codex/relay/nuove_skill_phase11/turns/claude-hat1-t11.3.0-generated-current-status-verdict-2026-06-17.md`.

Codex HAT 3 handoff authored at
`C:/Users/Test-User/Desktop/Tesi_Python_scRNA/nuove_skill/vibe-science/blueprints/private/phase11-implementation-plan/44-hat3-t11-3-0-generated-current-status-closure-2026-06-17.md`.

Claude Code non-author HAT 3 ACCEPT recorded via
`C:/Users/Test-User/.codex/relay/nuove_skill_phase11/turns/claude-hat3-t11.3.0-generated-current-status-verdict-2026-06-17.md`.

Reviewer-confirmed verification:

- validator probe rejected private sibling-WIKI CI dependency, snapshot drift,
  Phase 11 closed overclaim, missing Graphify deferral, manual README drift,
  count mismatch, and edited WIKI projection;
- README EN/IT marker blocks contain Phase 11/Wave 11.2 truth and no stale
  Wave 5 status prose;
- counts are live from `expectedCounts`, with `ciValidators:56`;
- tracked VRE `current-status-wiki.md` and private WIKI
  `state/current-status.md` are byte-identical;
- full `npm run check` passed with 1511 tests, 1502 pass, 0 fail, and
  9 skipped;
- no runtime, cleanup, real-data, export, Graphify runtime, or biomedical
  scope was opened.

## T11.3.1 Ledger Row Budget Trace

Changed Phase 11 VRE paths:

- `phase11-vre-feature-ledger.md`
- `phase9-vre-feature-ledger.md`
- `environment/phase11/ledger-row-budget.js`
- `environment/tests/ci/phase11-ledger-row-budget.js`
- `environment/tests/ci/phase11-ledger-row-budget.test.js`
- `environment/tests/ci/run-all.js`
- `environment/tests/ci/validate-counts.js`
- `../vibe-science/blueprints/private/phase11-implementation-plan/45-hat1-stop-t11-3-1-ledger-row-budget-2026-06-17.md`
- `../vibe-science/blueprints/private/WIKI_VRE/log.md`
- `../vibe-science/blueprints/private/WIKI_VRE/state/decision-gates.json`

Summary:

- adds a forward-only Phase 11 ledger budget helper and CI validator;
- grandfathers pre-T11.3.1 ledger prose;
- enforces compact-or-linked evidence for T11.3.1+ sections;
- compares task ids semantically, so `T11.3.10` is post-policy;
- rejects malformed post-policy headings and evidence links that do not
  resolve on disk.

RED evidence captured before GREEN:

- target test failed with `ERR_MODULE_NOT_FOUND` before the helper existed;
- `validate-counts` failed `ciValidators` expected 56, got 57;
- `run-all.js` failed before count, trace, and validator wiring repair.

Verification plan:

- targeted ledger-row-budget test and validator;
- `validate-counts` with `ciValidators:57`;
- explicit Phase 9/11 ledger probes;
- `run-all.js`, full `npm run check`, WIKI checks, and Claude Code HAT 3.

Scope boundaries:

- no historical ledger rewrite;
- no Phase 11 full closeout;
- no T11.3.2 phase-entry validator or T11.3.3 runbook;
- no real H5AD/GEO read, export, Graphify runtime, scratch cleanup, EOF-only
  cleanup, or biomedical claim promotion.

reviewer:

Claude Code non-author HAT 1 ACCEPT recorded via
`C:/Users/Test-User/.codex/relay/nuove_skill_phase11/turns/claude-hat1-t11.3.1-ledger-row-budget-verdict-2026-06-17.md`.

Codex HAT 3 handoff authored at
`C:/Users/Test-User/Desktop/Tesi_Python_scRNA/nuove_skill/vibe-science/blueprints/private/phase11-implementation-plan/46-hat3-t11-3-1-ledger-row-budget-closure-2026-06-17.md`.

Claude Code non-author HAT 3 ACCEPT recorded via
`C:/Users/Test-User/.codex/relay/nuove_skill_phase11/turns/claude-hat3-t11.3.1-ledger-row-budget-verdict-2026-06-17.md`.

## T11.3.2 Phase-entry Validator Trace

who: Codex authored the HAT 2 patch after Claude Code non-author HAT 1
ACCEPT of the amended STOP.

when: 2026-06-17.

why: Phase 12+ entry needs a deterministic guard that refuses process-only
closeout evidence, synthetic/fake research evidence, blocked first-packet
artifacts, unreviewed medical evidence, missing lineage, killed citations,
and blocked dependencies before the next phase can open.

what:

- `README.md`
- `phase11-vre-feature-ledger.md`
- `phase9-vre-feature-ledger.md`
- `environment/phase11/phase-entry-gate.js`
- `environment/tests/ci/phase11-phase-entry-gate.js`
- `environment/tests/ci/phase11-phase-entry-gate.test.js`
- `environment/tests/ci/run-all.js`
- `environment/tests/ci/validate-counts.js`
- `environment/tests/fixtures/phase11/current-status-authority.json`
- `environment/tests/fixtures/phase11/current-status-wiki.md`
- `../vibe-science/blueprints/private/WIKI_VRE/state/current-status.md`
- `../vibe-science/blueprints/private/phase9-vre-autonomous-research-loop/16-implementation-status-ledger.md`

verification:

- RED: `node --test environment/tests/ci/phase11-phase-entry-gate.test.js`
  failed with `ERR_MODULE_NOT_FOUND` before the helper existed;
- REDIRECT: Claude Code proved an evaluator-bypass false green where artifact
  metadata, lineage, and review fields returned `eligible` without
  `scientificInvariantInput`, `researchPacket`, or
  `firstResearchPacketExecution`;
- RED: the new no-evaluator regression failed with `decision:"eligible"`
  before the redirect fix;
- RED: `check-phase11-ledger` failed `E_PHASE11_TRACE_MISSING` before
  this trace existed;
- RED: explicit `check-phase9-ledger --changed-file ...` failed
  `E_SPEC_LEDGER_UPDATE_REQUIRED` before the private Phase 9 note;
- GREEN: phase-entry gate target test PASS 17/17;
- GREEN: semantic validator PASS and requires
  `substance_evaluator_required` for the evaluator bypass;
- GREEN: `validate-counts` PASS with `ciValidators:58`;
- GREEN: `phase11-current-status`, `check-phase11-ledger`,
  explicit Phase 9 ledger probe, `phase11-ledger-row-budget`, `run-all.js`,
  `git diff --check`, WIKI lint, and WIKI mirror check PASS after
  regenerating the tracked README/current-status projection for T11.3.2.

scope:

- no Phase 11 or Phase 12 closeout;
- no real H5AD/GEO read, export packaging, Graphify runtime, root doctor CLI,
  scratch cleanup, EOF-only cleanup, biomedical claim promotion, or override
  that authorizes claims/export/runtime.

reviewer:

Claude Code non-author HAT 1 ACCEPT recorded via
`C:/Users/Test-User/.codex/relay/nuove_skill_phase11/turns/claude-hat1-t11.3.2-phase-entry-validator-amended-verdict-2026-06-17.md`.

Claude Code non-author HAT 3 REDIRECT recorded via
`C:/Users/Test-User/.codex/relay/nuove_skill_phase11/turns/claude-hat3-t11.3.2-phase-entry-validator-verdict-2026-06-17.md`.

Claude Code non-author HAT 3 redirect-fix ACCEPT recorded via
`C:/Users/Test-User/.codex/relay/nuove_skill_phase11/turns/claude-hat3-t11.3.2-phase-entry-validator-redirect-fix-verdict-2026-06-17.md`.

Commit/push/CI closure:

- VRE commit `1b38312ac2874c24a8da9fb35e47290642de119a` was pushed to
  `origin/main` and `origin/fix/control-plane-lock-eperm-windows`;
- GitHub Actions run `27688981736` completed with conclusion `success`;
- duplicate GitHub Actions run `27688981326` also completed with conclusion
  `success`.

T11.3.2 is closed, pushed, and CI-green. Phase 11 remains open; next task is
T11.3.3 Research Runbook Handoff behind a fresh HAT 1 STOP.

## T11.3.3 Research Runbook Handoff Trace

who: Codex authored the HAT 2 patch after Claude Code non-author HAT 1
ACCEPT with binding provenance-fidelity and tracked-CI-authority amendments.

when: 2026-06-17.

why: Operators need a machine-checked handoff from the real GSE184880
blocked packet to Elisa/Goette review without letting the document imply a
completed CD8/CXCL13 result, a Phase 12 bridge, or agent authority over
biomedical claims.

what:

- `phase11-vre-feature-ledger.md`
- `phase9-vre-feature-ledger.md`
- `README.md`
- `environment/phase11/research-runbook.js`
- `environment/runbooks/phase11-research-runbook.md`
- `environment/tests/fixtures/phase11/current-status-authority.json`
- `environment/tests/fixtures/phase11/current-status-wiki.md`
- `environment/tests/fixtures/phase11/research-runbook-authority.json`
- `environment/tests/ci/phase11-research-runbook.js`
- `environment/tests/ci/phase11-research-runbook.test.js`
- `environment/tests/ci/run-all.js`
- `environment/tests/ci/validate-counts.js`
- `../vibe-science/blueprints/private/phase9-vre-autonomous-research-loop/16-implementation-status-ledger.md`

verification:

- RED: `node --test environment/tests/ci/phase11-research-runbook.test.js`
  failed with `ERR_MODULE_NOT_FOUND` before the helper existed;
- RED cases in the target suite fail closed on wrong total cells, wrong
  per-file SHA-256, stale snapshot total, sibling-private WIKI CI authority,
  CD8/claim/Phase 12 overclaim, missing medical boundary, and Graphify or
  scratch authority leakage;
- GREEN: target test PASS 8/8;
- GREEN: semantic validator PASS;
- GREEN: `validate-counts` PASS with `ciValidators:59`;
- GREEN: `phase11-current-status` PASS after regenerating README and
  tracked WIKI projection to the live `ciValidators:59` count and HAT3-accepted
  pending-commit task status.
- GREEN final: `run-all.js` PASS; `npm run check` PASS; `git diff --check`
  PASS; WIKI lint/mirror/registry/schema/protocol checks PASS; Claude Code
  independently re-ran a fidelity mutation battery and `npm run check`.

scope:

- documentation/CI-only handoff;
- no real H5AD/GEO read in CI, no new analysis, no CD8 denominator/count/
  fraction, no Graphify authority, no export packaging, no Phase 12 bridge,
  no scratch cleanup, no EOF-only cleanup, and no biomedical claim promotion.

reviewer:

Claude Code non-author HAT 1 ACCEPT recorded via
`C:/Users/Test-User/.codex/relay/nuove_skill_phase11/turns/claude-hat1-t11.3.3-research-runbook-handoff-verdict-2026-06-17.md`.

Claude Code non-author HAT 3 ACCEPT recorded via
`C:/Users/Test-User/.codex/relay/nuove_skill_phase11/turns/claude-hat3-t11.3.3-research-runbook-handoff-verdict-2026-06-17.md`.

Commit/push/CI closure:

- VRE commit `9dbb730678367d86b5fffbfda161992c82dffd78` was pushed to `origin/main` and `origin/fix/control-plane-lock-eperm-windows`; GitHub Actions run `27693689233` completed with conclusion `success`.

T11.3.3 is closed, pushed, and CI-green. Phase 11 remains open; next task is
T11.3.4 Phase 11 Full Closeout behind a fresh HAT 1 STOP.
