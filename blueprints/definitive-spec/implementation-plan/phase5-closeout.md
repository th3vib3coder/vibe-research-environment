# Phase 5 Closeout

**Date:** 2026-04-10  
**Repo:** `vibe-research-environment`  
**Scope:** Phase 5 closeout for the local orchestrator MVP, saved coordinator evidence, and measured continuity/runtime baseline

---

## Verdict

VRE Phase 5 is **implementation-complete with saved evidence**.

What is now closed with files on disk:
- local orchestrator runtime state, queue replay, ledgers, and query surfaces
- continuity profile runtime, explicit update history, recall adapters, and context assembly
- public `/orchestrator-run` and `/orchestrator-status` runtime surfaces
- execution lane plus execution-backed review lane for the Phase 5 MVP; the
  original MVP wired one task kind end-to-end, and Phase 5.5 extends this via a
  task registry
- saved Phase 5 benchmark repeats, one saved Phase 5 operator-validation artifact, and one measured context/cost baseline artifact

What Phase 5 does **not** claim:
- it does not ship runnable reporting, monitoring, supervise, or recover lanes yet
- it does not ship dashboard UI or background orchestration outside the visible queue model
- it does not auto-capture operator preferences into the continuity profile
- it does not treat local CLI review as a cloud-managed or server-side supervision runtime

---

## Evidence Map

### Saved Benchmark Repeats

- [orchestrator-status-queue-resume / 2026-04-10-03](../../../.vibe-science-environment/operator-validation/benchmarks/orchestrator-status-queue-resume/2026-04-10-03/)
- [orchestrator-continuity-modes / 2026-04-10-02](../../../.vibe-science-environment/operator-validation/benchmarks/orchestrator-continuity-modes/2026-04-10-02/)
- [orchestrator-execution-review-lineage / 2026-04-10-02](../../../.vibe-science-environment/operator-validation/benchmarks/orchestrator-execution-review-lineage/2026-04-10-02/)
- [orchestrator-bounded-failure-recovery / 2026-04-10-02](../../../.vibe-science-environment/operator-validation/benchmarks/orchestrator-bounded-failure-recovery/2026-04-10-02/)

### Saved Artifacts

- operator validation: [phase5-operator-validation.json](../../../.vibe-science-environment/operator-validation/artifacts/phase5-operator-validation.json)
- context and cost baseline: [phase5-context-and-cost-baseline.json](../../../.vibe-science-environment/operator-validation/artifacts/phase5-context-and-cost-baseline.json)

### Repo Validation Surfaces

- benchmark definition contract: [definitions.test.js](../../../environment/tests/evals/definitions.test.js)
- saved artifact contract: [saved-artifacts.test.js](../../../environment/tests/evals/saved-artifacts.test.js)
- CI validators: [validate-runtime-contracts.js](../../../environment/tests/ci/validate-runtime-contracts.js), [validate-counts.js](../../../environment/tests/ci/validate-counts.js), [validate-no-kernel-writes.js](../../../environment/tests/ci/validate-no-kernel-writes.js)

---

## Exit Gate Outcome

| # | Gate | Result | Evidence |
|---|------|--------|----------|
| 1 | queued orchestrator work stays visible on disk and can be resumed safely | PASS | [queue-resume summary](../../../.vibe-science-environment/operator-validation/benchmarks/orchestrator-status-queue-resume/2026-04-10-03/summary.json) |
| 2 | continuity assembly proves `profile`, `query`, and `full` modes without read-side mutation | PASS | [continuity-modes summary](../../../.vibe-science-environment/operator-validation/benchmarks/orchestrator-continuity-modes/2026-04-10-02/summary.json) |
| 3 | one execution result can flow into an execution-backed review lineage with real provider execution | PASS | [session-digest-review-task.test.js](../../../environment/tests/integration/session-digest-review-task.test.js) (real subprocess binding + task-kind + self-ref guards), [codex-cli-executor.test.js](../../../environment/tests/lib/codex-cli-executor.test.js), [saved-artifacts.test.js](../../../environment/tests/evals/saved-artifacts.test.js) (evidenceMode assertion); real-codex benchmark evidence at `.vibe-science-environment/operator-validation/benchmarks/orchestrator-execution-review-lineage/2026-04-18-*/`; FU-6-002 retired |
| 4 | bounded execution failures become explicit recovery plus escalation state | PASS | [bounded-failure summary](../../../.vibe-science-environment/operator-validation/benchmarks/orchestrator-bounded-failure-recovery/2026-04-10-02/summary.json) |
| 5 | continuity assembly cost and one coordinator cycle have a measured baseline | PASS | [phase5-context-and-cost-baseline.json](../../../.vibe-science-environment/operator-validation/artifacts/phase5-context-and-cost-baseline.json) |

**Result: 5 PASS, 0 PARTIAL.** Gate 3 upgraded FALSE-POSITIVE → PARTIAL in
Phase 6 Wave 4, then PARTIAL → PASS in Phase 6.1 after the real Codex CLI
envelope adapter shipped and produced real adversarial review evidence
(provider-specific `real-cli-binding-codex`, benchmark `2026-04-18-04`).

---

## Phase 5.5 Correction Note — Review Lineage Gate

Gate 3 was retracted as a Phase 5 closeout `PASS`. The saved
[lineage summary](../../../.vibe-science-environment/operator-validation/benchmarks/orchestrator-execution-review-lineage/2026-04-10-02/summary.json)
shows execution-backed lineage on disk, but the review verdict was produced by a
deterministic in-repo executor rather than a real local provider process. That is
valuable schema and lineage coverage, not proof of provider-backed adversarial
review.

Phase 5.5 closed the missing runtime surface separately by adding a task
registry, a `local-subprocess` executor, and a smoke-real review mode. The
corrected Phase 5.5 evidence is reported in `phase55-closeout.md`, not folded
back into this historical Phase 5 gate.

## Phase 6 Wave 4 Correction Note — Gate 3 Regrade (FALSE-POSITIVE → PARTIAL)

Phase 6 shipped:
1. The `session-digest-review` review-lane task kind ([registry entry](../../../environment/orchestrator/task-registry/session-digest-review.json),
   [helper](../../../environment/flows/session-digest-review.js)) chains off a
   completed session-digest-export lane-run, validates the input contract,
   guards against cross-session refs, against non-digest task kinds (WP-168
   finding 4), and against self-loop references (WP-168 finding 5).
2. Real provider bindings: [codex-cli.js](../../../environment/orchestrator/executors/codex-cli.js)
   and [claude-cli.js](../../../environment/orchestrator/executors/claude-cli.js)
   spawn real subprocess with the v1 envelope; integration tests exercise
   the full chain route → execute → review with fake-but-real subprocesses.
3. Schema cross-validation: [lane-run-record.schema.json](../../../environment/schemas/lane-run-record.schema.json)
   now rejects `evidenceMode: "real-cli-binding-*"` without
   `integrationKind: "provider-cli"` (WP-169).

What remains out of reach for PASS: the real Codex CLI (`codex exec --json`)
emits a JSONL **event stream** via stdout and writes the final message to a
separate file via `--output-last-message`. Wave 2's `codex-cli.js` assumed
stdout returns a single v1 envelope. The mismatch means real-CLI evidence
cannot be generated against the current `codex-cli.js` without a small
adapter script. The same applies to Claude CLI's `{type:"result",result:...}`
unwrapping (Wave 2 handled that but has no production run on record).

Upgrade path (PARTIAL → PASS) is mechanical: Phase 6.1 Wave 1 ships a thin
envelope adapter — either a shell/Node wrapper that parses Codex JSONL events
into the v1 envelope, or a refactor of `codex-cli.js` to use
`--output-last-message <tmp>` + parse the file. Once a real-CLI run produces
a benchmark artifact with `evidenceMode: "real-cli-binding-codex"`, Gate 3
upgrades to PASS automatically against the already-shipped schema guards.

## Phase 6.1 Correction Note — Gate 3 Upgrade (PARTIAL → PASS)

Phase 6.1 closed FU-6-002 by adding `invokeRealCodexCli` +
`buildRealCodexCliExecutor` in `environment/orchestrator/executors/codex-cli.js`.
The adapter uses `codex exec --output-last-message <tmpfile>` with a
prompt-engineered JSON instruction set, reads the final message, validates
it as a v1 output envelope, and returns the parsed record. The Phase 5.5
review fixture was also corrected to `integrationKind: 'provider-cli'`
so the lane-run-record's `evidenceMode: 'real-cli-binding-codex'` passes
the WP-169 cross-check.

Saved benchmark `2026-04-18-04` contains real Codex output with
`evidenceMode: "real-cli-binding-codex"` and a durable external-review
record embedded in the saved artifact payload.
The upgrade from PARTIAL to PASS is backed by: integration tests, schema
cross-check, real-codex evidence artifact, and the tightened
`saved-artifacts.test.js` assertion that requires providerRef
`openai/codex`, integrationKind `provider-cli`, evidenceMode
`real-cli-binding-codex`, and a durable `externalReview` record.

FU-6-002 is retired. Adversarial review (Phase 6.1 FU-6-003) surfaced
one P1 (integrationKind lie between fixture and executor) which was
corrected before the Phase 6.1 commit.

## Phase 6.2 Correction Note — Gate 3 `projectPath` Contract Closed

A second adversarial review after Phase 6.1 found that the real Codex
adapter in `environment/orchestrator/executors/codex-cli.js` spawns
without setting `cwd: projectPath` and the review payload does not
carry `projectPath`. The `2026-04-18-02` benchmark evidence was
authentic — a real Codex CLI produced a real `"challenged"` verdict —
but it worked accidentally from the repo root. From a nested
directory the adapter would silently fail to produce valid output.

Gate 3 stayed PASS because the evidence on disk was real, but a
loose-contract honest limit was recorded as FU-6-006. Phase 6.2-B
closed it: `review-lane.js` now includes `projectPath` in provider
payloads, `invokeRealCodexCli` rejects calls without `projectPath`,
spawns from `cwd: projectPath`, and `codex-cli-executor.test.js`
covers the nested-directory case. Phase 6.2-C regenerated the evidence
at `2026-04-18-04`. See [phase6_2-closeout.md](./phase6_2-closeout.md).

## Declared Follow-Ups

- FU-6-006: CLOSED in Phase 6.2-B/C. Codex adapter now spawns with
  `cwd: projectPath`; payload carries `projectPath`; regression test
  from nested dir is present; evidence regenerated at `2026-04-18-04`.

---

## Final Decisions

### Public Resume Surface

- queued work remains operator-visible through `/orchestrator-status`
- resume happens through explicit task-id based continuation, not hidden worker loops
- interrupted work remains a durable queue concern, not a conversational memory trick

### Continuity Surface

- continuity profile updates remain explicit operator actions or explicit confirmed proposals
- read-side continuity assembly remains bounded and helper-backed
- measured continuity cost remains a sub-budget input for the caller, not the total prompt budget owner

### Lane Surface

- the MVP execution lane remains local logic
- the MVP review lane remains local CLI-backed with visible provider binding
- execution-backed review lineage is required before external review evidence is written
- the original MVP execution lane shipped one end-to-end task kind; Phase 5.5
  moves task selection to a registry so additional task kinds are explicit

---

## Deferred By Design

### Future Work

- runnable reporting, monitoring, supervise, and recover lanes
- broader provider bindings and explicit API-fallback exercise coverage
- richer recall search beyond the current helper-backed MVP query behavior
- operator-facing dashboards or richer UI beyond the current command-plus-filesystem shell
- broader automated benchmark generation instead of saved curated repeats only

---

## Final Status

What we can defend now:
- Phase 5 ships a real local coordinator MVP with durable queue state, bounded continuity assembly, and public run/status surfaces
- the coordinator MVP is backed by runtime code, tests, validators, saved repeats, one saved operator-validation artifact, and one measured context/cost artifact
- failure handling, resume visibility, and review lineage all stay explicit on disk

What we should **not** overclaim:
- Phase 5 is not a general multi-lane agent platform yet
- Phase 5 does not provide hosted supervision, background autonomy, or hidden memory capture
- Phase 5 does not claim that the continuity assembler owns total prompt budget or provider policy beyond the frozen MVP surface

Recommended next action:
- treat Phase 5 as the stable orchestrator MVP baseline and open Phase 6 only once the saved evidence above is reviewed and accepted
