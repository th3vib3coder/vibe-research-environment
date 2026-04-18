# Phase 6 Wave 2 — Review-Lineage Regrade Plan (WP-165)

**Status:** Plan only. Execution is Wave 4. This document freezes the
contract that determines whether the Phase 5 Gate 3 FALSE-POSITIVE (F-04)
regrades to PASS, PARTIAL, or cannot-regrade-on-this-host.

**Authoritative source:** `phase6-03-wave-2-real-provider-binding.md` §WP-165
plus the WP-151 / WP-160 / WP-161 executor contracts landed in Wave 2.

---

## Target Benchmark

| Field | Value |
|-------|-------|
| Benchmark file | `environment/evals/tasks/orchestrator-execution-review-lineage.json` |
| Current grade basis | `evidenceMode: "mocked-review"` via `buildMockReviewExecutor` in `save-phase5-artifacts.js:213` |
| Current F-04 status | FALSE-POSITIVE (blocks Phase 6 exit gate) |
| Regrade gate | Phase 5 Gate 3 |

---

## Executor-Mode Selection Table

Deterministic. Logged into `summary.json` at rerun time.

| Env present at rerun | `evidenceMode` | Action |
|---|---|---|
| `VRE_CODEX_CLI` set + executable | `real-cli-binding-codex` | spawn via `buildCodexCliExecutor` (WP-160) |
| `VRE_CLAUDE_CLI` set + executable | `real-cli-binding-claude` | spawn via `buildClaudeCliExecutor` (WP-161) |
| Both set | `real-cli-binding-codex` | deterministic preference — Codex first |
| Neither set | DECLARED SKIP | `gradeDecision: "cannot-regrade-on-this-host"` + `FU-60-00N` follow-up |
| Either set but smoke-mode also requested | FAIL config | reject at startup; do NOT silently downgrade |

**Why declared-skip is mandatory.** Silently falling back to
`smoke-real-subprocess` (the `node -e` echo that shipped in Phase 5.6) would
repeat the F-04 sin and defeat the point of Wave 2. The regrade harness must
exit non-zero with `gradeDecision: "cannot-regrade-on-this-host"` whenever
neither real CLI is reachable.

---

## Required `summary.json` Extensions

Beyond today's shape (baseline:
`.vibe-science-environment/operator-validation/benchmarks/orchestrator-execution-review-lineage/2026-04-10-02/summary.json`):

```json
{
  "evidenceMode": "real-cli-binding-codex|real-cli-binding-claude|cannot-regrade",
  "providerCliBinding": {
    "providerRef": "openai/codex|anthropic/claude",
    "binaryPath": "<abs path, home-dir redacted>",
    "timeoutMs": 180000,
    "exitCode": <int>,
    "stderrBytes": <int>,
    "elapsedSeconds": <float>
  },
  "reviewOutcome": {
    "verdict": "affirmed|challenged|inconclusive",
    "materialMismatch": <bool>,
    "sourceOfVerdict": "cli-stdout-json|cli-timeout|cli-nonzero-exit|cli-contract-mismatch"
  },
  "gradeDecision": "PASS|PARTIAL|cannot-regrade-on-this-host"
}
```

`externalReview` lane-run-record must carry `integrationKind:"provider-cli"`
and `evidenceMode` matching `summary.json`. Both artifacts are compared
against the lane-run-record at validation time.

---

## Real Evidence vs Evidence-Shaped Mock

**Real evidence (ALL must hold):**
- `evidenceMode` starts with `real-cli-binding-`.
- `providerCliBinding.binaryPath` resolves to an existing file on host at
  grading time.
- `exitCode === 0`.
- `sourceOfVerdict === "cli-stdout-json"`.
- `lane-run-record` persisted with `integrationKind: "provider-cli"` and
  `evidenceMode` matching `summary.json`.

**Evidence-shaped mock (ANY auto-fails the regrade):**
- Non-zero `exitCode` but `summary.json` claims `affirmed` → AUTO-FAIL.
- Stdout failed to parse → AUTO-FAIL (contract-mismatch suppresses PASS).
- `evidenceMode === "smoke-real-subprocess"` → does NOT clear F-04
  (that is already what Phase 5.6 produced).

---

## Decision Table — Rerun Outcome vs F-04 Regrade

| Outcome | Phase 5 Gate 3 regrade | Phase 6 exit gate |
|---|---|---|
| `gradeDecision = PASS` | **PASS.** Cite regenerated `summary.json` by path + sha256 in phase6 closeout. F-04 closed. | Contributes to PASS. |
| `gradeDecision = PARTIAL` (real run; verdict inconclusive OR materialMismatch true) | **PARTIAL.** Gate 3 stays PARTIAL with new `FU-60-00N` naming both the verdict and the PASS prerequisites. F-04 closed with disclosure. | Contributes to PARTIAL (phase 6 exit gate still passes per §109 rule 4). |
| `gradeDecision = cannot-regrade-on-this-host` | **PARTIAL with explicit deferral.** F-04 remains FALSE-POSITIVE until a host with at least one real CLI reruns. | **FAILS** Phase 6 exit gate; host must have at least one CLI. |
| CLI spawned but `contract-mismatch` | **FAIL the regrade.** Do NOT mark PASS. Blocker for Wave 3 rerun with tuned prompt. | FAILS (contract drift requires prompt fix before declaring pass). |
| CLI spawned but `tool-failure` (non-zero exit, timeout, signal) | **PARTIAL** if transient + one retry clears it. Else escalate with `FU-60-00N`. | Same as PARTIAL. |

---

## Follow-Up Tickets Reserved

- `FU-60-001` — allocated for `cannot-regrade-on-this-host` outcome when
  neither `VRE_CODEX_CLI` nor `VRE_CLAUDE_CLI` is reachable at Wave 4
  grading time. Ticket body: "Re-run `orchestrator-execution-review-lineage`
  on a host with at least one real provider CLI; cite the new `summary.json`
  sha256 in the phase6 closeout Gate 3 regrade."
- `FU-60-002` — reserved for `real-cli-binding-*` + `verdict:"inconclusive"`
  outcomes; ticket body names the verdict + prompts the reviewer to tighten
  the review prompt before re-run.
- `FU-60-003` — reserved for `contract-mismatch` outcomes; ticket body names
  the exact `schemaVersion` drift and requires a prompt-engineering pass
  before the next regrade attempt.

---

## Handoff To Wave 4

Wave 4 executes this plan as follows:
1. Run `orchestrator-execution-review-lineage` with `VRE_CODEX_CLI` or
   `VRE_CLAUDE_CLI` set per operator availability.
2. Capture the regenerated `summary.json` and `lane-runs.jsonl` at
   `.vibe-science-environment/operator-validation/benchmarks/orchestrator-execution-review-lineage/<DATE>/`.
3. Compare against the decision table above; write the resulting regrade
   text into the phase6 closeout, citing file path + sha256 for every
   evidence reference.
4. Apply the WP-119 closeout-honesty standard: quote prior FALSE-POSITIVE
   phrasing, quote regenerated evidence, quote new grade.

---

## Scope Guardrails (do NOT relax in Wave 4)

- **Do not** rerun against stale operator-validation artifacts from
  2026-04-10 — that is the evidence F-04 already exposed as mocked.
- **Do not** substitute `smoke-real-subprocess` for missing CLIs.
- **Do not** raise a PASS regrade without a matching `lane-run-record`
  carrying `integrationKind: "provider-cli"` + `evidenceMode`.
- **Do not** commit the regenerated `summary.json` under the same dated
  folder as the 2026-04-10 mock output; use a new `<DATE>-wave4` folder so
  the FALSE-POSITIVE evidence remains auditable.

---

## Provenance

- WP-151 / WP-160 / WP-161 (provider-cli contract + executors)
- WP-162 (`evidenceMode` field + `integrationKind` widening)
- WP-163 / WP-164 (session-digest-review registry entry + review-lane
  adapter wiring)
- Phase 5.5 closeout F-04 FALSE-POSITIVE finding
- `phase6-03-wave-2-real-provider-binding.md` §WP-165
