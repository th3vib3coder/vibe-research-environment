# Phase 7 Wave 5 — Tests, Evidence, Closeout, And Cleanup

**Goal:** Add regression coverage for all Wave 1-4 deliverables, upgrade
`validate-closeout-honesty` to semantic cite-check (G-13), archive the
`surface-orchestrator/` spec legacy (G-14), regenerate evidence where required,
correct affected closeouts, and ship `phase7-closeout.md`.

---

## Scope Rule

Wave 5 creates test files, ships two small refactors (validator upgrade +
surface-orchestrator archive), regenerates benchmark evidence where Wave 1-4
changes invalidated prior artifacts, and edits closeout dossiers.

Every test must satisfy the pre/post criterion: fails on the pre-Wave-5
baseline and passes after its target Wave 1-4 WP lands.

Dependencies:
- Waves 1-4 skeleton code merged
- Phase 6 exit gate closed (no regression of G-01, G-02)

---

## WP-211 — Execution Expansion Regression Suite

Guard Wave 1 WP-183..WP-188.

New test files:
- `environment/tests/lib/task-registry-phase7.test.js`:
  - asserts the 5 new registry entries load (2 review + 3 execution)
  - asserts helper modules resolve for each new kind
  - asserts `listReviewTaskKinds()` returns ≥ 3 kinds
    (session-digest-review from Phase 6 + contrarian-claim-review +
    citation-verification-review from Wave 1)
- `environment/tests/integration/experiment-flow-register-task.test.js`:
  - routes via registry keywords
  - runs execution lane end-to-end
  - asserts manifest written to disk matches input
- `environment/tests/integration/writing-export-finalize-task.test.js`:
  - requires an existing frozen export snapshot (from Phase 5.6)
  - runs finalize task
  - asserts deliverable file exists at
    `.vibe-science-environment/writing/deliverables/<snapshotId>/<type>/`
  - asserts idempotency per WP-184 decision (fail-closed on rerun)
- `environment/tests/integration/results-bundle-discover-task.test.js`:
  - packages a bundle, then routes a discover task
  - asserts discovered bundles match
- `environment/tests/integration/contrarian-claim-review-task.test.js`:
  - fake provider-cli executor (reuses Phase 6 Wave 3 fixture)
  - fake kernel-bridge (reuses Phase 6 Wave 1 fixture)
  - asserts externalReview record carries verdict + materialMismatch
- `environment/tests/integration/citation-verification-review-task.test.js`:
  - similar shape to contrarian
  - asserts citationId + claimId tracked in lane-run-record

Acceptance:
- all six files fail on pre-Wave-5 baseline
- `listReviewTaskKinds` assertion encodes the F-08 closure invariant
  permanently

---

## WP-212 — Agent Surface Regression Suite

Guard Wave 2 WP-189..WP-195.

New/updated tests:
- `environment/tests/cli/bin-vre-all-commands.test.js`:
  - smoke invocation of each of 12 commands with `--help` (no side effects)
  - asserts each help output contains the description from its markdown
- `environment/tests/cli/bin-vre-dry-run.test.js`:
  - invokes dry-run on commands that declare support
  - asserts no writes to `.vibe-science-environment/`
  - asserts a dry-run report is printed
  - asserts dry-run on unsupported commands exits non-zero with clear error
- `environment/tests/cli/bin-vre-json-output.test.js`:
  - invokes `--json` on commands declaring support
  - asserts stdout parses as JSON matching
    `environment/schemas/vre-cli-output.schema.json` (Wave 2 WP-192 new schema)
- `environment/tests/cli/bin-vre-subcommand-parsing.test.js`:
  - asserts `flow-experiment --register` parses correctly
  - asserts unknown subcommands exit 3 with enumeration
- `environment/tests/lib/frontmatter-v3.test.js`:
  - updated to parse new v3 fields (`dryRunSupported`, `jsonOutputSupported`,
    `subcommands`)
  - backward-compat: v2 frontmatter still parses

Update `validate-commands-to-js.js` per WP-195:
- assert every command with `dryRunSupported: true` has a corresponding
  test
- assert every command with `subcommands` has DISPATCH_TABLE entries
  handling each declared subcommand

Acceptance:
- 5 new test files + 1 validator update
- `validate-counts.js` updated: cliTests grows, libTests grows

---

## WP-213 — Three-Tier Writing Regression Suite

Guard Wave 3 WP-196..WP-199.

New test files:
- `environment/tests/schemas/writing-seed-block.schema.test.js`:
  - accept-valid: claim-backed block with non-empty claimRefs
  - reject-invalid: claim-backed block with empty claimRefs
  - accept-valid: artifact-backed block with artifactRefs
  - reject-invalid: artifact-backed block with claimRefs also present
  - accept-valid: free block with no refs
  - reject-invalid: free block with refs present
- `environment/tests/flows/writing-tier-structure.test.js`:
  - buildWritingHandoff produces tier-scoped subdirectories
  - each seed file has frontmatter matching its tier
  - mixed-tier content in source rejected pre-write via
    `WritingTierValidationError`
- `environment/tests/lib/writing-tier-enforcer.test.js`:
  - each assertion function throws on the right violation
  - error class carries tier + reason + blockId
- `environment/tests/ci/validate-three-tier-writing.test.js`:
  - synthetic fixture seeds pass/fail the validator correctly
  - killed-claim fixture produces the expected rejection

Register `validate-three-tier-writing.js` in `tests/ci/run-all.js`;
`validate-counts.js` ciValidators 12 → 13 (after Phase 6 Wave 3 landed
`validate-ci-workflow.js` at 11 → 12).

Acceptance:
- all 4 test files fail on baseline
- negative-case assertions (mixed-tier rejected) prove F-13 is
  structurally enforced, not just rendered

---

## WP-214 — Connectors, Automation, Domain-Packs Regression Suite

Guard Wave 4 WP-201..WP-210.

New/updated tests:
- `environment/tests/lib/connector-rename.test.js` (if Contract B chosen):
  - asserts `environment/connectors/vault-target-export.js` exists
  - asserts old `obsidian-export.js` removed (git grep returns empty)
  - asserts manifest file renamed
  - asserts all references in code + specs updated
- `environment/tests/integration/scheduled-workflow-dispatch.test.js`:
  - invokes `bin/vre weekly-digest --json` directly (simulating what the
    scheduled workflow runs)
  - asserts exit 0, JSON output parseable, artifact created
- `environment/tests/lib/domain-pack-rule-engine.test.js`:
  - enforceRule happy path for both `forbiddenMutations` and `doesNotModify`
  - enforceRule rejection throws `DomainPackRuleViolationError` with
    correct payload
  - rule handler registry supports extension
- `environment/tests/integration/domain-pack-rule-integration.test.js`:
  - register experiment → try to modify a `forbiddenMutations` field →
    rule violation surfaces
  - package results → attempt operation in `doesNotModify` → rule violation
  - exercises at least 3 of the 6 omics forbiddenMutations rules

`validate-scheduled-workflow.js` from Wave 4 WP-210 registered in
`tests/ci/run-all.js`; `validate-counts.js` ciValidators 13 → 14.

Acceptance:
- all new test files fail on baseline
- connector-rename test codifies G-08 closure permanently

---

## WP-215 — Closeout Honesty Validator Semantic Upgrade

Close G-13.

Current state: `validate-closeout-honesty.js` enforces link existence,
banned phrases, and null-metric detection, but does NOT verify that the
evidence file actually supports the gate claim.

Upgrade algorithm:
1. For each Exit Gate row with Result = PASS, parse the gate description
   text
2. Extract ≥3 content keywords (length ≥ 4 chars, excluding stopwords)
3. For each cited evidence file (markdown link in Evidence column):
   - read the file
   - assert at least 1 content keyword from the gate description appears
     in the file (case-insensitive)
4. If no keyword match for any cited evidence file → validator fails with
   message naming the gate row and the missing keywords
5. Exception: evidence files marked with `.jsonl` extension are
   line-scanned (any line matching counts); `.md` files scanned in full

Implementation:
- extend `environment/tests/ci/validate-closeout-honesty.js` with a
  `validateGateSemantics()` function
- add stopwords list (≈100 words)
- output mode: strict (fails on any mismatch) in CI; diagnostic
  (warns, no fail) via `VRE_LENIENT_CLOSEOUT=1` env var for dev workflow

Update `phase55-closeout.md` note (WP-148 / `:132-146`) to reflect that
the validator is now PARTIALLY semantic (cite-check) but still not
deep-semantic (it doesn't verify that the cited JSON actually encodes
the gate's invariant at value level).

Acceptance:
- all existing closeouts continue to pass (backward-compat) OR fail with
  specific actionable errors that Wave 5 WP-217/218 then addresses
- synthetic fixture tests cover happy path, missing keyword, empty
  evidence file
- `phase55-closeout.md` honesty note truthfully describes the new
  behavior

---

## WP-216 — Surface-Orchestrator Legacy Cleanup

Close G-14.

Current state: 12 spec docs under
`blueprints/definitive-spec/surface-orchestrator/` predate the Phase 5
MVP. They share the term "orchestrator" with
`environment/orchestrator/`, creating cognitive collision.

Disposition (two options):
- **Option A (preferred, default)**: move the folder to
  `blueprints/definitive-spec/archive/surface-coordinator/` — rename
  on move to avoid the collision; inside the folder, leave docs
  unchanged but add a top-level README pointing future readers to the
  Phase 5 MVP orchestrator as the authoritative implementation
- **Option B**: rewrite every doc header to use "coordinator" instead
  of "orchestrator" — more invasive, risks semantic drift

Default: **Option A** (archive + rename). Minimal disruption.

Updates:
- move folder
- add `archive/surface-coordinator/README.md` with:
  - one-paragraph explanation: "these docs predate the Phase 5 MVP and
    are preserved for design lineage"
  - link to `environment/orchestrator/` and `phase5-00-index.md`
- update `blueprints/definitive-spec/IMPLEMENTATION-PLAN.md` +
  `13-delivery-roadmap.md` references
- update `blueprints/definitive-spec/00-INDEX.md` if it references the
  folder

Acceptance:
- `blueprints/definitive-spec/surface-orchestrator/` no longer exists
  (moved to archive)
- no broken links across the spec tree (`validate-references.js` CI
  validator catches these — run it post-move)

---

## WP-217 — Affected Closeout Corrections

Apply Wave 1-4 outcomes to existing closeouts.

Required edits:
- `phase3-closeout.md`: F-13 three-tier upgrade per Wave 3 WP-200
  preparation
- `phase4-closeout.md`:
  - connector catalogue updated per Wave 4 WP-202 (honest description)
  - Zotero section updated per Wave 4 WP-203 (formal deferral + FU-7-001)
  - scheduling section updated per Wave 4 WP-204 (GitHub Actions workflow
    referenced)
  - domain-pack section updated per Wave 4 WP-208 (rules now enforced)
- `phase55-closeout.md`:
  - WP-146 note about "task kind narrowness" amended: Phase 7 Wave 1 now
    ships 5 additional kinds; Phase 5.5 narrowness was Phase 5 MVP scope,
    not a permanent state
  - honesty validator note (WP-148 / `:132-146`) updated per WP-215

Acceptance:
- every edited closeout continues to pass `validate-closeout-honesty`
  (including new semantic cite-check from WP-215)
- every correction cites prior phrasing, new evidence, new phrasing

---

## WP-218 — Delivery Roadmap And Implementation-Plan Sync

Apply Phase 7 outcome.

Updates to `13-delivery-roadmap.md`:
- add Phase 7 section with status
- link to `phase7-00-index.md` and `phase7-closeout.md`
- summarize cross-closeout corrections from WP-217

Updates to `IMPLEMENTATION-PLAN.md`:
- add `### Phase 7 (completed|blocked)` section with 7 doc links
- update `## Current Phase State` to reflect Phase 6 + Phase 7 outcomes
- update `surface-orchestrator` references to the archive path (per
  WP-216)
- Phase 8+ candidates listed as deferred with named follow-ups

Acceptance:
- no doc says "all green" where outcome is actually PARTIAL or blocked
- every link resolves
- `validate-references.js` passes post-update

---

## WP-219 — Phase 7 Closeout Dossier

Ship `phase7-closeout.md` as the Phase 7 canonical outcome document,
written natively against the WP-119 honesty standard AND the new WP-215
semantic cite-check upgrade.

Structure (mandatory):

1. **`## Verdict`** — Phase 7 COMPLETE OR Phase 7 COMPLETE-WITH-PARTIALS.
   If gates G-05..G-15 all close clean: COMPLETE. Else:
   COMPLETE-WITH-PARTIALS (declare which gates remain open + named
   follow-ups).

2. **`## Evidence Map`** — tables for:
   - New registry entries (5 paths)
   - CLI dispatcher coverage (12 commands with declared state)
   - Three-tier writing artifacts (seed subdirectories example)
   - Connector/automation/domain-pack changes
   - Scheduled workflow file
   - New CI validators (count + names)

3. **`## Exit Gate Outcome`** — one row per Phase 7 exit gate from
   `phase7-00-index.md` (13 gates). Each cites real evidence or declares
   PARTIAL/DEFERRED with named FU.

4. **`## Gap Reconciliation (G-05..G-15)`** — per-gap status.

5. **`## Closeout Corrections Applied`** — list from WP-217.

6. **`## Final Decisions`**:
   - Obsidian: honest rename (default) or deep integration (alt path)
   - Zotero: formal deferral, kernel-side prerequisite named
   - Scheduling: GitHub Actions scheduled workflow canonical
   - Rule engine: generic, extensible beyond omics
   - Honesty validator: semantic cite-check added (not deep-semantic)
   - surface-orchestrator: archived to preserve lineage

7. **`## Deferred By Design`**:
   - Zotero ingress (Phase 8+ with kernel-side contract frozen)
   - Deep-semantic honesty validation (Phase 8+ candidate)
   - Reporting/monitoring/supervise/recover lanes (still out of Phase
     scope per Phase 5 closeout)
   - Performance/cost CI continuous regression (Phase 8+ candidate)

8. **`## Final Status`** — defensible claims vs overclaims.

Acceptance:
- passes `validate-closeout-honesty` including the new semantic cite-check
- every Exit Gate row cites a real file
- every PARTIAL/DEFERRED row names a follow-up
- timestamped

---

## WP-220 — Adversarial Review Preparation

Package Phase 7 for the final external adversarial review round, matching
the Phase 5.5 / 5.6 / 5.7 discipline.

Deliverables:
- Brief summary file `phase7-adversarial-review-package.md` listing:
  - scope of changes (files + WP range)
  - expected attack surface: new task kinds (complexity), CLI
    expansion (entry-point proliferation), three-tier enforcement
    (data boundary), connector rename (reference drift), rule engine
    (performance + correctness), honesty validator semantic upgrade
  - known disclosed gaps (G-13 now partial, not deep-semantic; Zotero
    deferred; Obsidian rename not integration)
  - what the reviewer should NOT attack (Phase 6 closeures, kernel
    semantics)

This WP does NOT ship code. It's a meta-document to focus the external
review and avoid re-litigating closed issues.

Acceptance:
- file exists
- linked from `phase7-closeout.md` `## Final Status` section

---

## Parallelism

- WP-211..WP-214 parallelize (tests for independent subsystems)
- WP-215, WP-216 parallelize with test suites
- WP-217 depends on Waves 1-4 merged AND WP-215 landed (to know what the
  validator accepts)
- WP-218 depends on WP-217
- WP-219 depends on WP-217 + WP-218
- WP-220 runs last; consumes all prior work

---

## Six Implementation Questions (wave-level)

1. **Enters how?** `npm test` for regression suites; manual eval
   regeneration where needed; editor for closeout corrections.
2. **State where?** Test files, validator code, closeout markdown,
   archive folder move.
3. **Read by?** CI, developers, reviewers, `validate-closeout-honesty`,
   `validate-references`.
4. **Written by?** Phase 7 contributors; adversarial review feedback may
   trigger an additional iteration.
5. **Tested how?** Every WP's claim has a fixture or regression test.
6. **Degrades how?** No kernel writes; if host lacks CLI for Phase 6
   dependencies, the tests use fake fixtures (same pattern as Phase 6
   Wave 3).

---

## Exit Condition

Wave 5 is complete when:
- all six regression test suites (WP-211..WP-214) land and pass
- `validate-closeout-honesty` has the semantic cite-check active
- `surface-orchestrator/` archived, no broken links
- all affected closeouts edited per WP-217
- `13-delivery-roadmap.md` + `IMPLEMENTATION-PLAN.md` reflect Phase 7
- `phase7-closeout.md` exists and passes the upgraded validator
- adversarial review package ready for final external review
- `npm run check` passes with new validators registered
