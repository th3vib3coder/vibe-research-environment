# Phase 6 Wave 4 — Evidence And Closeout Honesty

**Goal:** Regenerate Phase 5 review-lineage evidence against the real provider
binding shipped in Wave 2, upgrade Phase 1 Gate 17 and Phase 5 Gate 3 based on
actual evidence, sync delivery roadmap + implementation plan, and ship the
Phase 6 closeout dossier as the first document written against the post-Phase 6
honest baseline.

---

## Scope Rule

Wave 4 does not ship runtime code. It produces:
- one regenerated benchmark repeat for `orchestrator-execution-review-lineage`
  (WP-171)
- two corrected closeout dossiers: `phase1-closeout.md` and `phase5-closeout.md`
  (WP-172, WP-173)
- updates to `13-delivery-roadmap.md` and `IMPLEMENTATION-PLAN.md` (WP-174)
- the new Phase 6 closeout `phase6-closeout.md` (WP-175)

Every correction cites prior phrasing, evidence gap, and revised phrasing.
No closeout line is rewritten by softening alone — either new automated
evidence lands OR the gate stays at its disclosed PARTIAL / FALSE-POSITIVE
severity.

Dependencies:
- Waves 1-3 merged
- Operator running Wave 4 has either `VRE_KERNEL_PATH` (for Gate 17 upgrade)
  AND/OR `VRE_CODEX_CLI` / `VRE_CLAUDE_CLI` (for Gate 3 regrade) available
- If neither is available on the Wave 4 host, the downgrade paths from Wave 2
  WP-165 decision table apply and are recorded honestly

---

## WP-171 — Phase 5 Review-Lineage Evidence Regeneration

Close F-04 at the evidence level.

Deliverables:

1. **Re-run** `environment/evals/save-phase5-artifacts.js` with
   `VRE_REVIEW_EVIDENCE_MODE=real-cli-binding` (or auto-detected if
   `VRE_CODEX_CLI` / `VRE_CLAUDE_CLI` are set) to regenerate the benchmark
   repeat at
   `.vibe-science-environment/operator-validation/benchmarks/orchestrator-execution-review-lineage/`.
2. The regenerated repeat MUST:
   - use `evidenceMode: "real-cli-binding-codex"` OR
     `"real-cli-binding-claude"` in the `summary.json` (set by Wave 2
     WP-162 + WP-164)
   - contain an `externalReview` record with non-mock `verdict`,
     `materialMismatch`, `summary`, `followUpAction` derived from real CLI
     output
   - include the `providerRef` in the lane-run-record distinguishing it
     from the legacy mock evidence
3. **Preserve** the pre-Phase-6 benchmark evidence under
   `.vibe-science-environment/operator-validation/benchmarks/orchestrator-execution-review-lineage/archive/pre-phase6/`
   so the FALSE-POSITIVE history remains auditable.
4. **Fallback (host-without-CLI)**: if Wave 4 executes on a host with
   neither Codex CLI nor Claude CLI available, the WP explicitly invokes
   the `cannot-regrade-on-this-host` row of Wave 2 WP-165 decision table:
   no regeneration happens, Phase 5 Gate 3 remains FALSE-POSITIVE with
   disclosure, Phase 6 exit gate blocks on host-config.

Acceptance:
- regenerated benchmark has `evidenceMode` matching a real-cli value
- `externalReview.verdict` is derived from CLI output, not a lambda
  returning `'affirmed'`
- archive preserved
- if regeneration is impossible on host, that fact is recorded in Phase 6
  closeout with explicit host profile

---

## WP-172 — Phase 1 Closeout Correction (Gate 17)

Close G-01 at the closeout level.

Apply the Wave 1 WP-159 closeout-preparation package to the actual
`phase1-closeout.md`. Two possible outcomes:

**Outcome A — real probe succeeds**:
Gate 17 upgrades PARTIAL → PASS. Cited evidence:
- `environment/tests/compatibility/kernel-governance-probe.test.js` (Wave 1
  WP-157) — asserts on real kernel projection output
- Saved benchmark artifact or CI run log showing the probe passed
- New phrasing: `| 17 | Kernel governance prerequisites verified against live
  kernel probe | PASS | [kernel-governance-probe.test.js](...) |`
- Summary verdict: "Result: 17 PASS, 0 PARTIAL" (up from 16 PASS + 1 PARTIAL)
- `FU-55-001` retired; retirement note recorded

**Outcome B — real probe inconclusive (kernel sibling absent on CI host)**:
Gate 17 stays PARTIAL but with upgraded follow-up.
- New phrasing keeps PARTIAL grade, updates evidence citation to include the
  new probe test file with an explicit note "passes when VRE_KERNEL_PATH is
  set; automated CI-bound upgrade pending on host provisioning"
- `FU-55-001` retired; replaced with `FU-6-001`: provision CI runner with
  `VRE_KERNEL_PATH` + sibling kernel checkout to unlock Gate 17 PASS

Acceptance:
- `phase1-closeout.md` updated per chosen outcome
- `validate-closeout-honesty` accepts the updated closeout
- the chosen outcome is consistent with WP-171 fallback handling (same host
  profile)

---

## WP-173 — Phase 5 Closeout Correction (Gate 3)

Close G-02 at the closeout level.

Apply the regraded evidence from WP-171 to `phase5-closeout.md` Gate 3
(`one execution result can flow into an execution-backed review lineage`).

**Outcome A — real provider rerun produced real evidence**:
Gate 3 upgrades FALSE-POSITIVE → PASS.
- Quote the original PASS line + the FALSE-POSITIVE retraction from Phase 5.5
  WP-146
- Cite the new regenerated benchmark at
  `.vibe-science-environment/operator-validation/benchmarks/orchestrator-execution-review-lineage/<new-repeat-id>/summary.json`
- Cite the `evidenceMode` field from that summary as proof of non-mock
- Cite the integration test `session-digest-review-task.test.js` (Wave 3
  WP-168) as the regression guard
- Summary verdict: "Result: 5 PASS, 0 PARTIAL" (up from 4 PASS + 1 FALSE-POSITIVE)

**Outcome B — host without provider CLI**:
Gate 3 stays FALSE-POSITIVE with disclosure upgraded.
- New phrasing retains `FALSE-POSITIVE` grade, adds a Wave 2 WP-165
  `cannot-regrade-on-this-host` note, links to Phase 6 Wave 4 evidence
- `FU-6-002` added: regrade Phase 5 Gate 3 once CI host has at least one
  provider CLI available
- Phase 6 exit gate explicitly blocks on this outcome (Phase 7 does not
  open)

Acceptance:
- `phase5-closeout.md` updated per chosen outcome
- `validate-closeout-honesty` accepts the updated closeout
- the narrative in closeout prose clarifies the "task-kind narrowness" note
  from Phase 5.5 WP-146 in light of Phase 6 NOT expanding task kinds
  (Phase 7 territory)

---

## WP-174 — Delivery Roadmap And Implementation-Plan Sync

Apply the Phase 6 outcome to the global planning documents.

Updates to `blueprints/definitive-spec/13-delivery-roadmap.md`:
- add a Phase 6 section with status (COMPLETE or BLOCKED per outcome)
- link to `phase6-00-index.md` and `phase6-closeout.md`
- summarize which gates changed across all earlier closeouts

Updates to `blueprints/definitive-spec/IMPLEMENTATION-PLAN.md`:
- add `### Phase 6 (completed|blocked)` section with 6 doc links
- update `## Current Phase State` to reflect Phase 6 status
- mark Phase 7 as "unblocked" or "still blocked per Gate 3 outcome"

Acceptance:
- no place in the docs says "everything green" where the outcome is
  actually PARTIAL or blocked
- every doc link resolves to an existing file
- `validate-closeout-honesty` (if it scans these — it does not today, but
  the spec drift between docs and closeouts is manually reviewed here)

---

## WP-175 — Phase 6 Closeout Dossier

Ship `phase6-closeout.md` as the canonical Phase 6 outcome document,
written natively against the WP-119 closeout honesty standard from Phase
5.5 Wave 0.

Structure (mandatory):

1. **`## Verdict`** — one paragraph. Either:
   - "Phase 6 COMPLETE — Gate 17 upgraded to PASS, Gate 3 upgraded to PASS,
     Phase 7 entry unblocked", or
   - "Phase 6 BLOCKED on host config — one or both of Gate 17/Gate 3 remain
     PARTIAL/FALSE-POSITIVE; follow-ups FU-6-001/FU-6-002 open; Phase 7
     remains blocked"

2. **`## Evidence Map`** — tables:
   - Regenerated benchmark repeat paths
   - Saved artifacts (Phase 6 operator-validation if applicable)
   - Repo validation surfaces (tests + validators)
   - CI workflow reference

3. **`## Exit Gate Outcome`** — Markdown table `| # | Gate | Result |
   Evidence |` with one row per Phase 6 exit gate listed in
   `phase6-00-index.md`. Each row cites a real test or evidence file, OR
   declares `PARTIAL` / `FALSE-POSITIVE` / `DEFERRED` with a named follow-up.

4. **`## Gap Reconciliation (G-01..G-04, G-15)`** — per-gap status:
   RESOLVED / PARTIAL / DEFERRED.

5. **`## Closeout Corrections Applied`** — one line per corrected closeout
   (WP-172, WP-173) citing the edit diff.

6. **`## Final Decisions`** — crisp list:
   - kernel-bridge is the canonical way to read kernel state in integration
     tests going forward
   - `provider-cli` is the first real binding; `local-subprocess` stays for
     smoke/fake tests
   - `evidenceMode` is now a required lane-run-record field for
     `integrationKind === "provider-cli"`
   - Phase 7 blocks or unblocks are declared explicitly

7. **`## Deferred By Design`** — Phase 7 candidates surfaced during Phase
   6 that remain safe to defer:
   - broader task registry (Phase 7)
   - wider CLI dispatcher (Phase 7)
   - three-tier writing enforcement (Phase 7)
   - connector depth (Phase 7)

8. **`## Final Status`** — what we can defend vs what we will NOT overclaim.

Acceptance:
- passes `validate-closeout-honesty` (WP-140 from Phase 5.5)
- every Exit Gate row cites a real file (no placeholder "CI run" without
  link)
- every PARTIAL/FALSE-POSITIVE/DEFERRED row names a follow-up
- is timestamped with the date of authorship

---

## Parallelism

- WP-171 runs first within Wave 4 — the regenerated benchmark feeds WP-173
- WP-172 can run in parallel with WP-171 (Gate 17 and Gate 3 are
  independent)
- WP-173 depends on WP-171
- WP-174 depends on WP-172 + WP-173
- WP-175 runs last; it consumes all prior corrections

---

## Six Implementation Questions (wave-level)

1. **Enters how?** Operator invokes `npm run eval:save-phase5` with
   appropriate env vars; editors update closeout MD files.
2. **State where?** Corrected closeouts under
   `blueprints/definitive-spec/implementation-plan/phase*-closeout.md`;
   regenerated evidence under
   `.vibe-science-environment/operator-validation/`.
3. **Read by?** Developers, reviewers, Codex adversarial review, the
   `validate-closeout-honesty` validator.
4. **Written by?** Phase 6 contributors (humans + agents) + the eval
   regeneration script.
5. **Tested how?** By WP-140 validator; by regenerated-benchmark tests
   from Wave 3 WP-167 + WP-168.
6. **Degrades how?** No kernel writes. If regeneration is impossible on
   the host, the WP-171 fallback triggers and Phase 6 exit gate correctly
   reflects the blocking state (loud, not silent).

---

## Exit Condition

Wave 4 is complete when:
- `phase5-operator-validation.json` (or equivalent Phase 5 benchmark
  artifact) reflects the regenerated evidence from WP-171 OR the fallback
  is honestly recorded
- `phase1-closeout.md` reflects the WP-172 correction (PASS or
  PARTIAL-with-upgraded-FU)
- `phase5-closeout.md` reflects the WP-173 correction (PASS or
  FALSE-POSITIVE-with-upgraded-disclosure)
- `13-delivery-roadmap.md` and `IMPLEMENTATION-PLAN.md` reference Phase 6
- `phase6-closeout.md` exists and passes `validate-closeout-honesty`
- `npm run check` is green post-merge
