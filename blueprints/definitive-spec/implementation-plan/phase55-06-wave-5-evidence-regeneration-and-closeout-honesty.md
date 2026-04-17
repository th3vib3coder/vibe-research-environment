# Phase 5.5 Wave 5 — Evidence Regeneration And Closeout Honesty

**Goal:** Produce the real evidence that Phase 1-5 closeouts claimed but never
measured, then rewrite the affected closeout lines against the honesty
standard (WP-119). Ship the Phase 5.5 closeout itself as the first document
that passes the honesty validator (WP-140).

---

## Scope Rule

Wave 5 does not ship runtime code. It ships:
- one regenerated operator-validation artifact for Phase 3 (WP-141)
- four corrected closeout dossiers (WP-142, WP-143, WP-144, WP-146)
- one corrected delivery roadmap (WP-147)
- one new closeout for Phase 5.5 (WP-148)
- one minor closeout note for Phase 2 (WP-145)

Every correction cites the prior phrasing, the evidence gap, and the revised
phrasing. No closeout line is rewritten by softening the language alone;
either new automated evidence lands (regrades PASS) or the gate is
explicitly downgraded to PARTIAL / FALSE-POSITIVE / DEFERRED.

Wave 5 depends on:
- Waves 1-3 runtime changes having merged (WP-120..WP-135)
- Wave 4 validators being registered (WP-139, WP-140)
- At least one live execution of each regenerated benchmark scenario

---

## WP-141 — Phase 3 Operator-Validation Metric Regeneration

Close F-03. The seven benchmarks under
`.vibe-science-environment/operator-validation/benchmarks/flow-writing-*`,
`flow-results-*`, and `export-warning-digest-*` today report
`resumeLatencySeconds: null` and `degradedHonestyScore: null` for every
scenario; only binary pass-stamp flags are populated.

**Missing harness (addresses audit P0-D).** Today `environment/evals/` has
`save-phase1-artifacts.js`, `save-phase2-artifacts.js`,
`save-phase2-operator-validation-artifact.js`,
`save-phase5-artifacts.js`,
`save-phase5-operator-validation-artifact.js`, and the generic
`save-operator-validation-artifact.js` — but **no Phase 3 counterpart**. The
current `phase3-operator-validation.json` was hand-authored, which is
exactly why its metric fields are `null`. WP-141 cannot proceed without
first adding the missing harness.

Deliverables:

0. **(PREREQUISITE)** Ship
   `environment/evals/save-phase3-operator-validation-artifact.js` modeled on
   `save-phase5-operator-validation-artifact.js`. The harness:
   - imports the 7 Phase 3 benchmark definitions from
     `environment/evals/benchmarks/phase3-*.benchmark.json`
   - for each benchmark, loads the latest saved repeat under
     `.vibe-science-environment/operator-validation/benchmarks/<id>/`, computes
     the metrics against the current runtime, and emits non-null numeric
     fields
   - writes the consolidated artifact to
     `.vibe-science-environment/operator-validation/artifacts/phase3-operator-validation.json`
   - adds the `eval:save-phase3` script to `package.json` alongside the
     existing `eval:save-phase1` entry
   - adds `environment/schemas/operator-validation-artifact.schema.json` and
     schema tests for the artifact shape described below
   Acceptance for this prerequisite: running `npm run eval:save-phase3`
   against a clean repo produces a valid (schema-checked) artifact with no
   `null` metric fields.

1. Re-run each of the 7 Phase 3 operator-validation benchmarks against the
   Phase 5.5-patched runtime. Each run must populate:
   - `resumeLatencySeconds`: real wall-clock seconds, measured via
     `performance.now()` or `process.hrtime.bigint()`, median of at least 3
     repeats
   - `degradedHonestyScore`: real score in [0, 1] computed by the honesty
     metric from `environment/evals/metrics/honesty-under-degradation.js`, or
     the not-applicable object defined below when degraded mode is not
     exercised
   - `attemptLifecycleCompleteness`: real 0/1 from the `attempts.jsonl`
     lifecycle trace, not a static `1`
   - `snapshotPublishSuccess`: real 0/1 from the `session-snapshot.json`
     write path

2. Where a benchmark genuinely cannot produce a numeric value for a given
   metric (e.g., a benchmark that does not degrade cannot produce
   `degradedHonestyScore`), the metric value MUST be an object:
   `{ "status": "not-applicable", "reason": "<why this metric does not apply>" }`.
   Numeric metrics remain numbers. Plain string `"not-applicable"` is not
   allowed. `null` is never allowed.

Artifact schema rule:
- each benchmark metric value is either a number or the not-applicable object
  above
- `generatedAt`, `sourceRepeats`, and `schemaVersion` are required
- the pre-5.5 archived artifact is not validated as current, but its path is
  recorded in the regenerated artifact under `replacesArtifact`

3. Write the regenerated artifact at
   `.vibe-science-environment/operator-validation/artifacts/phase3-operator-validation.json`
   with a new `generatedAt` timestamp AND preserve the pre-regeneration
   artifact under `artifacts/archive/phase3-operator-validation.pre-5_5.json`
   for audit trail.

4. Add the regenerated artifact to the `saved-artifacts.test.js` expected set.

Acceptance:
- no field in `phase3-operator-validation.json` is `null`
- the `validate-closeout-honesty.js` validator (WP-140) accepts the artifact
  against the Phase 3 closeout after it is corrected (WP-143)
- the pre-Phase-5.5 artifact is preserved in the archive subdirectory

---

## WP-142 — Phase 1 Closeout Correction (Gate 17)

Close F-01. `phase1-closeout.md:80` declares PASS on Gate 17 ("kernel
governance prerequisites verified") citing `profiles.test.js`,
`state-machine.test.js`, and `config-protection.test.js`. Those three tests
assert hardcoded literals against themselves; they never import the sibling
kernel.

Correction approach: DOWNGRADE Gate 17 from PASS to **PARTIAL**. Justified:
the kernel sibling exists and the documented prerequisites are satisfied by
manual inspection, but VRE's own test suite does not automate that
verification. PASS overstates the evidence.

Required edits to `phase1-closeout.md`:

1. In the Exit Gate table (line ~80), replace:
   ```
   | 17 | Kernel governance prerequisites verified | PASS | checklist below — ...
   ```
   with:
   ```
   | 17 | Kernel governance prerequisites verified | PARTIAL | manual verification against sibling kernel; no automated VRE-side probe — see correction note below |
   ```

2. After the Exit Gate table, add a new `## Gate 17 Correction Note (Phase
   5.5)` section that:
   - quotes the original claim
   - quotes each compatibility test's top line showing it is self-asserting
   - explains why PARTIAL is the correct grade
   - links to the follow-up ticket for automated kernel-sibling probing
     (phase6 candidate)

3. Update the summary verdict:
   - before: "Result: 17 PASS, 0 PARTIAL"
   - after: "Result: 16 PASS, 1 PARTIAL"

Acceptance:
- `validate-closeout-honesty.js` no longer flags Gate 17
- the correction note cites file paths for each of the three tests

---

## WP-143 — Phase 3 Closeout Correction

Close F-02 (immutability), F-03 (metrics), F-13 (three-tier writing).

Required edits to `phase3-closeout.md`:

1. **Frozen snapshot gate** (the gate declaring "claim-backed writing runs
   against frozen export snapshots"):
   - before Phase 5.5 runtime fix: PARTIAL with note "runtime allowed silent
     overwrite of the same `snapshotId`; see F-02 forensic finding"
   - after WP-120, WP-121 merge: upgrade to PASS citing
     `environment/tests/lib/export-snapshot-immutability.test.js` and
     `environment/tests/flows/writing-seeds-immutable.test.js`

2. **Operator-validation metric gate**:
   - quote the prior line that declared PASS on "saved operator-validation
     evidence"
   - retract to **FALSE-POSITIVE**: the prior artifact had `null` for every
     non-binary metric; the PASS was evidence-free
   - regrade to PASS once WP-141 regenerates the artifact; cite the new
     `phase3-operator-validation.json` with non-null fields

3. **Three-tier writing distinction gate**:
   - quote the prior PASS
   - regrade to **PARTIAL**: the three-tier distinction is rendered as three
     markdown section headers in `writing-render.js:18,24,35` but has no
     schema boundary, no validator, no data-layer enforcement; the tiers are
     prose headings the researcher can cross-pollute
   - link to a Phase 6 follow-up for a structured three-tier data contract
     (tier declared per content block, schema-enforced)

4. Update the verdict block with explicit gate rows instead of compressed
   arithmetic. After WP-120/WP-121 and WP-141 land, the expected Phase 3
   posture is:
   - frozen snapshot gate: PASS, citing immutability tests
   - operator-validation evidence gate: PASS-after-regeneration, citing the
     regenerated non-null artifact and preserving the prior false-positive in
     the correction note
   - three-tier writing distinction: PARTIAL, citing the lack of schema/data
     boundary and a Phase 6 follow-up

The summary line must not hide the prior false-positive. It should say that
the former PASS was retracted and then replaced by regenerated evidence, while
the three-tier distinction remains PARTIAL.

Acceptance:
- every regraded gate cites a real test file or a real artifact with non-null
  metrics
- validator passes on the corrected closeout

---

## WP-144 — Phase 4 Closeout Correction

Close F-11 (Zotero silent omission), F-12 (Obsidian branding).

Required edits to `phase4-closeout.md`:

1. **Connector catalogue** section:
   - quote the prior phrasing that did not acknowledge Zotero
   - add an explicit `### Deferred Connectors` subsection stating Zotero is
     deferred out of Phase 4, with rationale (ingress would touch kernel
     truth; Wave 0 kept Phase 4 as export-only substrate)
   - link to the Phase 6 follow-up for Zotero ingress design

2. **Obsidian connector** gate:
   - rephrase from "Obsidian connector ships" to "Vault-target markdown
     export ships, branded Obsidian because the target is typically an
     Obsidian vault; there is no Obsidian plugin API integration, no URI
     scheme, no plugin hook"
   - grade remains PASS for what actually shipped (markdown copy into a
     named target directory), but the capability description is reduced
   - add a note that the file `obsidian-export.js:17-20` hardcodes two mirror
     files (`project-overview.md`, `decision-log.md`) — this is the full
     extent of the "Obsidian" adapter

3. **Scheduling** gate:
   - quote the prior phrasing about "weekly digest"
   - clarify: the automation runtime is on-demand; "weekly" is enforced via
     an ISO-week idempotency key in `builtin-plans.js:47,66`, not by a
     scheduler
   - grade: PASS for "weekly dedupe correctness", PARTIAL for "true weekly
     cadence" (requires a host scheduler that does not exist in this repo)

4. **Domain-pack `omics`** gate:
   - if the existing closeout has a generic "deferred by design" or
     "not enforced at runtime" note, promote that limitation into a dedicated
     PARTIAL line with the grade made machine-readable for the honesty
     validator
   - do not cite generic line numbers as if they were an omics-specific hedge;
     the corrected closeout must state the omics limitation directly

Acceptance:
- Zotero is explicitly deferred or explicitly shipped; no silent omission
- Obsidian scope is accurate; the brand-name-vs-behavior gap is disclosed
- Scheduling grade distinguishes dedupe correctness from cadence
- honesty validator passes

---

## WP-145 — Phase 2 Closeout Addendum

Close F-06's closeout side. Phase 2's closeout says "packaging does not
backdoor Phase 3 writing/export policy" — strictly true for gating, false for
code-level coupling (`flows/results.js:4` imports
`lib/export-eligibility.js`).

Minimal edit to `phase2-closeout.md`:

1. Add a dated addendum section at the bottom:
   ```
   ## Phase 5.5 Correction Note (2026-...)

   The Wave 0 Packaging Rule stated "packaging does not backdoor Phase 3
   writing/export policy." This was true for runtime gating (Phase 2 never
   blocked on eligibility result) but false for code-level coupling:
   `flows/results.js:4` imported `lib/export-eligibility.js` to annotate
   bundles with citation-check context.

   Phase 5.5 WP-124 removes this import. The original closeout verdict is
   not retracted (the Wave 0 gating semantic held); only the coupling
   description is corrected.
   ```

Acceptance:
- addendum is dated
- honesty validator accepts the closeout (no `null`-metric artifacts in
  Phase 2, so no metric regeneration needed)

---

## WP-146 — Phase 5 Closeout Correction

Close F-04 (review mock) and F-08 (task kind narrowness) at the closeout
level.

Required edits to `phase5-closeout.md`:

**Byte-exact gate quotes** (addresses audit P1-I). WP-119 honesty standard
requires quoting the exact prior phrasing. The Phase 5 closeout gate table
(`phase5-closeout.md:54-58`) reads:

1. "queued orchestrator work stays visible on disk and can be resumed safely" — PASS
2. "continuity assembly proves `profile`, `query`, and `full` modes without read-side mutation" — PASS
3. "one execution result can flow into an execution-backed review lineage" — PASS
4. "bounded execution failures become explicit recovery plus escalation state" — PASS
5. "continuity assembly cost and one coordinator cycle have a measured baseline" — PASS

WP-146 corrections below cite these rows by index and reproduce the exact
gate text; any closeout amendment that paraphrases rather than quotes is
rejected by the WP-140 validator.

1. **Gate 3 — "one execution result can flow into an execution-backed
   review lineage"**: see corrections below.

2. **Narrative clarification (non-table)**: the closeout prose mentions
   "execution lane plus execution-backed review lane for the Phase 5 MVP"
   (`phase5-closeout.md:17`). Add a footnote after that line: *"Execution
   lane wired exactly one task kind end-to-end in Phase 5
   (`session-digest-export`); Phase 5.5 extends to three via the task
   registry (WP-127)."* Prose is clarified; the PASS gate grade stands.

3. **Gate 3 — Execution-backed review lineage**:
   - quote the prior PASS verbatim: `| one execution result can flow into
     an execution-backed review lineage | PASS | [orchestrator-execution-review-lineage / 2026-04-10-02](...) |`
   - retract to **FALSE-POSITIVE** for the pre-Phase-5.5 evidence: the sole
     Codex executor in the saved eval was the mock in
     `save-phase5-artifacts.js:213-221` returning `{verdict: 'affirmed'}`
     unconditionally; a gate cannot pass on a tautology
   - regrade, conditional on Wave 2 WP-131 hybrid outcome:
     - if `smoke-real-subprocess` default ships: PASS, citing the real
       subprocess call and the `evidenceMode: "smoke-real-subprocess"`
       field in the regenerated benchmark
     - if the operator opts into `mocked-review` via `VRE_CODEX_CLI=""`:
       PARTIAL for that run, with disclosure in the benchmark artifact

3. **Saved-benchmark set**:
   - re-run the four `orchestrator-*` benchmarks under Phase 5.5 patched
     runtime
   - the regenerated `orchestrator-execution-review-lineage` benchmark MUST
     carry `evidenceMode` in its summary and the corresponding test
     (`environment/tests/integration/review-gate-honesty.test.js`) guards the
     field's presence

4. Update the verdict block:
   - before: "Result: 5 PASS, 0 PARTIAL"
   - after: "Result: 4 PASS (one narrowed), 0 PARTIAL, 0 FALSE-POSITIVE
     outstanding, 1 FALSE-POSITIVE regraded to PASS via Phase 5.5 smoke-real
     binding"

Acceptance:
- no gate in `phase5-closeout.md` cites a mock executor as evidence
- the narrowness of the MVP execution lane is disclosed in the same
  paragraph as the PASS
- validator accepts the closeout

---

## WP-147 — Delivery Roadmap And Implementation-Plan Sync

Close the documentation drift called out in the first audit (roadmap shows
`PLANNED` / `[ ]` for phases already closed).

Required edits:

1. `blueprints/definitive-spec/13-delivery-roadmap.md`:
   - add a top section `## Phase 5.5 — Audit Hardening (COMPLETE|IN-PROGRESS)`
     with a one-line summary and a link to `phase55-00-index.md` and
     `phase55-closeout.md`
   - replace the per-phase `PLANNED` labels and unchecked `[ ]` boxes with
     EITHER real checkmarks citing the closeout evidence OR a bold note
     `> Historical checklist retained for lineage; see {phase}-closeout.md
     for current status.` The current file-level note (lines 18-20) stays but
     is no longer sufficient: each deliverable table gets its own callout.
   - add a top-of-file banner block clarifying the read order: "read closeouts
     for status; this file preserves historical structure"

2. `blueprints/definitive-spec/IMPLEMENTATION-PLAN.md`:
   - verify or update the existing `### Phase 5.5 (completed|in-progress)`
     section listing the 7 Phase 5.5 docs; do not add a duplicate section
   - update `## Current Phase State` to include Phase 5.5 status
   - do NOT rewrite the entire file; it is intentionally short

3. `blueprints/definitive-spec/00-INDEX.md`:
   - the Phase 5.5 doc set does not appear here (the spec index is
     capability-scoped; Phase 5.5 is plan-scoped) — leave 00-INDEX alone
     unless a new section is added for Phase 5.5 spec artifacts (there are
     none beyond the implementation-plan files)

Acceptance:
- delivery roadmap no longer shows `PLANNED` next to shipped work without
  a closeout pointer
- IMPLEMENTATION-PLAN.md lists Phase 5.5 with a closeout link
- a reader arriving fresh can determine current status from the roadmap
  alone without reading every wave

---

## WP-148 — Phase 5.5 Closeout Dossier

Ship `phase55-closeout.md` as the first closeout written natively against
the honesty standard (WP-119).

Structure (mandatory):

1. `## Verdict` — one-paragraph summary distinguishing what Phase 5.5 shipped
   and what remains explicitly deferred
2. `## Evidence Map` — tables for saved-benchmark repeats, saved artifacts,
   repo validation surfaces
3. `## Exit Gate Outcome` — one Markdown table with columns `| # | Gate |
   Result | Evidence |`, one row per Phase 5.5 exit gate from
   `phase55-00-index.md`
4. `## Finding-ID Reconciliation` — Phase 5.5-specific table mapping each
   F-01..F-13 to its resolution status:
   - `RESOLVED` — fix landed, test guards it
   - `PARTIAL` — fix landed but a disclosed gap remains
   - `DEFERRED` — not fixed in Phase 5.5; reason stated; Phase 6 link
5. `## Closeout Corrections Applied` — one line per corrected closeout
   (WP-142..WP-146), citing the edit diff
6. `## Final Decisions` — crisp list of what Phase 5.5 decided (e.g., task
   registry canonical path, frontmatter v2 opt-in)
7. `## Deferred By Design` — Phase 6 candidates that surfaced during Phase
   5.5 and are safe to defer
8. `## Final Status` — what we can defend, what we should NOT overclaim

Every row in the Exit Gate and Finding-ID tables must cite an evidence file
OR a disclosed gap. No `null` fields.

Acceptance:
- the closeout passes `validate-closeout-honesty.js` (WP-140)
- `validate-closeout-honesty.js` is registered in `environment/tests/ci/run-all.js`
  only after the corrected closeouts and `phase55-closeout.md` exist
- `validate-counts.js` expects 11 validators (up from the Wave 4 count of 10)
- every P0 finding (F-01..F-04) is either RESOLVED or explicitly PARTIAL
  with a linked follow-up
- every P1 finding (F-05..F-10) is RESOLVED, PARTIAL, or DEFERRED with
  justification
- every P2 finding (F-11..F-13) is RESOLVED
- no gate in the Exit Gate table is graded PASS without a test or a real
  non-null artifact
- the closeout is timestamped and links back to the Phase 5.5 adversarial
  review rounds (Codex + Claude)

---

## Parallelism

- WP-141 runs first within Wave 5 — the regenerated metrics are input to
  WP-143.
- WP-142, WP-144, WP-145 can run in parallel (independent closeouts).
- WP-143 depends on WP-141.
- WP-146 depends on Wave 2's WP-131 final outcome and on the WP-131-driven
  benchmark regeneration.
- WP-147 runs near the end; it consumes all prior corrections.
- WP-148 runs last; it is the final document.

---

## Six Implementation Questions (wave-level)

1. **How does it enter the system?** Editors writing corrected closeout MD
   files; re-running benchmark scripts in `environment/evals/`.
2. **Where does its state live?**
   - Corrected closeouts: `blueprints/definitive-spec/implementation-plan/phase*-closeout.md`
   - Regenerated evidence: `.vibe-science-environment/operator-validation/`
   - New closeout: `blueprints/definitive-spec/implementation-plan/phase55-closeout.md`
3. **Who reads that state?** Developers, reviewers, Codex adversarial review
   sessions, and the new `validate-closeout-honesty.js` validator.
4. **Who writes that state?** Phase 5.5 contributors (humans + agents) and
   the eval regeneration scripts (`npm run eval:save-phase3`,
   `eval:save-phase5`).
5. **How is it tested or validated?** By WP-140 validator; by the
   regenerated-benchmark tests from WP-137.
6. **How does it degrade without harming the kernel?** No kernel writes.
   Benchmark regeneration is idempotent (same inputs → same artifacts modulo
   timestamps). Failure to regenerate degrades to a preserved archive file
   and a failing validator — loud, not silent.

---

## Exit Condition

Wave 5 is complete when:
- `phase3-operator-validation.json` has no `null` metric fields (WP-141)
- `phase1-closeout.md` Gate 17 is PARTIAL with a correction note (WP-142)
- `phase3-closeout.md` reflects the three corrections (WP-143)
- `phase4-closeout.md` includes Zotero deferral, Obsidian scope clarification,
  scheduling reality (WP-144)
- `phase2-closeout.md` carries the Phase 5.5 correction note addendum (WP-145)
- `phase5-closeout.md` reflects the task-kind narrowness and review evidence
  corrections (WP-146)
- `13-delivery-roadmap.md` and `IMPLEMENTATION-PLAN.md` reference Phase 5.5
  (WP-147)
- `phase55-closeout.md` exists and passes `validate-closeout-honesty.js`
  (WP-148)
- `validate-closeout-honesty.js` is registered in default CI and validator
  count is 11
- all of the above pass `npm run check`
