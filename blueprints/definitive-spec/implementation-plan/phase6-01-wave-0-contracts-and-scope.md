# Phase 6 Wave 0 — Contracts And Scope

**Goal:** Freeze the kernel-bridge contract, real-provider contract, and CI
workflow contract that Phase 6 Waves 1-4 must conform to. No runtime code
lands in Wave 0.

---

## Scope Rule

Wave 0 freezes only what Phase 6 actually touches:
- one kernel-bridge integration contract (how `core-reader-cli.js` is spawned
  and consumed)
- one real-provider executor contract (Codex CLI and Claude CLI binding shapes)
- one CI workflow contract (`.github/workflows/`)
- one closeout-honesty continuation (applying WP-119 to Phase 6 corrections)

Out of scope:
- new kernel-side code (VRE stays read-only against kernel)
- new execution task kinds (Phase 7 territory)
- new review task kinds except the single bounded `session-digest-review`
  entry frozen by WP-152 to close G-02/F-04
- any extension of CLI dispatcher beyond current 3 commands
- new schemas beyond what the three contracts above require and the WP-152
  review input schema

---

## WP-149 — Phase 6 Scope And Non-Feature-Creep Statement

Record one implementation stance:
- Phase 6 is a foundation-honesty pass, not a capability release.
- Every change traces to gaps G-01..G-04 or G-15 from the master spec.
- No WP adds execution tasks, connectors, or automations beyond those
  contracts frozen in this Wave. WP-152 is the only allowed task/schema
  exception, and it is review-only because F-04 cannot be regraded without
  an execution-backed review target.

Acceptance:
- no WP lands code touching files outside the gap-derived set without a
  one-line justification linked to a master-spec gap ID
- no WP adds an `environment/` top-level folder
- no WP mutates kernel-side code under `../vibe-science/`

---

## WP-150 — Kernel Bridge Integration Contract

Freeze the runtime and test contract for actually exercising the kernel
sibling, not just accepting a typed-duck reader.

New helper module: `environment/lib/kernel-bridge.js` (NEW in Wave 1)

Contract:
- **Entry point**: `resolveKernelReader({kernelRoot, timeoutMs})` returns a
  reader matching the existing typed-duck shape
  (`{dbAvailable, listClaimHeads, listUnresolvedClaims, listCitationChecks,
    getProjectOverview, listLiteratureSearches, listObserverAlerts,
    listGateChecks, getStateSnapshot, close()}`)
- **Spawn model**: for each projection call, `child_process.spawn` the
  `plugin/scripts/core-reader-cli.js` with the projection name as first arg,
  optional JSON args on stdin, parse JSON envelope from stdout
- **Envelope shape**: `{ok: true, projection: '<name>', projectPath: '<abs>',
  data: <projection-specific>}` on success; `{ok: false, projection, error}`
  on failure
- **Timeout**: default 10 s per projection call; exceeding → `dbAvailable: true`
  with per-projection fallback to stored last-known value if any, else throw
- **Degraded-mode interop**: if `VRE_KERNEL_PATH` env var is absent OR the
  sibling's `plugin/scripts/core-reader-cli.js` does not exist, return the
  existing degraded sentinel — the SAME one Phase 5.7 `resolveDefaultReader`
  produces in `bin/vre`
- **No caching across calls**: each projection call re-spawns for safety
  (single-pass reader, cache lives at caller layer if needed)
- **Credential hygiene**: inherits sanitized env same as local-subprocess
  executor (`DEFAULT_ENV_WHITELIST`); no API keys auto-forwarded

Acceptance:
- contract fully documented at signature + envelope level before Wave 1
  implementation begins
- skip-when-absent policy matches the existing `bin/vre` `resolveDefaultReader`
  semantics (consistency)

State ownership:
- written by: `environment/lib/kernel-bridge.js` (implemented in Wave 1)
- read by: `environment/tests/integration/kernel-bridge.test.js` (Wave 3), eval
  harnesses that opt-in via `VRE_KERNEL_PATH`
- degradation: kernel absent → sentinel; spawn fail → typed error matching
  local-subprocess error taxonomy (`dependency-unavailable`, `tool-failure`,
  `contract-mismatch`)

---

## WP-151 — Real Provider Binding Contract

Freeze the contract for actually invoking Codex CLI or Claude CLI as a
review-lane provider — not `node -e` echo.

New integration kind addition: **`provider-cli`** (distinct from
`local-subprocess` which is generic)

Contract:
- **Binding declaration** in `lane-policies.json`: `providerRef:
  "openai/codex"` OR `"anthropic/claude"`, `integrationKind: "provider-cli"`,
  `authMode: "subscription"`
- **Executor lookup**: `providerExecutors["openai/codex:provider-cli"]`
  resolves to a `buildCodexCliExecutor({command, args, timeoutMs})` factory
- **Executor lookup fallback**: `providerExecutors["anthropic/claude:provider-cli"]`
  resolves to a `buildClaudeCliExecutor(...)` factory
- **Env var for command path**: `VRE_CODEX_CLI` / `VRE_CLAUDE_CLI` point to
  the CLI binary location; absent → fail closed (throw), matching Phase 5.6
  WP-131 hybrid decision
- **Envelope shape** (stdin to CLI): a JSON object
  `{schemaVersion: "vibe-orch.provider-cli.input.v1", task:{taskKind,
    targetRef, comparedArtifactRefs, continuity}, payload:{<provider-specific>}}`
- **Output shape** (stdout from CLI): JSON
  `{schemaVersion: "vibe-orch.provider-cli.output.v1", verdict:
    "affirmed"|"disputed"|"inconclusive", materialMismatch:boolean,
    summary:string, followUpAction:string, evidenceRefs:string[]}`
- **Timeout**: default 180 s (longer than local-subprocess because CLI calls
  network models); SIGTERM + 5 s grace + SIGKILL
- **Cancellation**: parent-side abort signals cascade to child
- **Credential hygiene**: CLI inherits only its own envPassthrough — never
  the parent's generic `process.env`

Acceptance:
- contract covers both providers without hardcoding either inside the
  orchestrator runtime (polymorphism via executor lookup)
- every provider-cli invocation writes a lane-run-record with:
  `integrationKind: "provider-cli"`, `providerRef`, `evidenceMode` field
  distinguishing `real-cli-binding` from `smoke-real-subprocess` from
  `mocked-review`

State ownership:
- written by: `environment/orchestrator/executors/codex-cli.js` (new, Wave 2)
  and `environment/orchestrator/executors/claude-cli.js` (new, Wave 2)
- read by: `review-lane.js` via existing `invokeLaneBinding`
- degradation: CLI absent → typed error `dependency-unavailable`,
  review-lane escalates honestly (no silent mock fallback)

---

## WP-152 — Review-Lineage Task-Kind Contract

Freeze the contract for the review-lineage task that Phase 5 Gate 3 needs
to exit FALSE-POSITIVE.

New registry entry (to be shipped in Wave 2):
- **taskKind**: `session-digest-review`
- **lane**: `review`
- **requiredCapability**: `output-only`
- **helperModule**: `environment/flows/session-digest-review.js` (thin new
  helper that consumes the real executor and compiles a lane-run-record)
- **inputSchema**: `environment/schemas/session-digest-review-input.schema.json`
  (new, contains `executionLaneRunId` required + optional
  `comparedArtifactRefs` override)
- **routerKeywords**: `["review digest", "contrarian digest", "review exported
  digest"]`
- **outputContract**: documentation of `{summary, artifactRefs, warningCount,
  payload:{verdict, materialMismatch, followUpAction}}`
- **degradesTo**: `escalate`

Acceptance:
- review-lane now has at least one registered kind (closes the current
  `listReviewTaskKinds() === []` gap via side effect)
- the session-digest-review task chains off a completed session-digest-export
  lane-run record — lineage is data-backed, not assumed

State ownership:
- task-registry entry at `environment/orchestrator/task-registry/session-digest-review.json`
- input schema at `environment/schemas/session-digest-review-input.schema.json`
- helper at `environment/flows/session-digest-review.js`
- all three land in Wave 2

---

## WP-153 — Closeout Honesty Continuation For Phase 6

Freeze how Phase 6 corrections apply the WP-119 honesty standard.

Rules:
- Every closeout edit in Wave 4 cites the exact prior phrasing AND the new
  phrasing
- Every PASS upgrade cites a real automated test or a real evidence file
  with non-null content
- Every PARTIAL carries a named follow-up ticket (format `FU-NN-NNN`)
- Every FALSE-POSITIVE regrade explicitly quotes the disproving evidence
  before restating the grade
- No gate is retained at PASS because "we fixed the code" without also
  citing a test that encodes the invariant

Acceptance:
- Wave 4 closeout edits pass `validate-closeout-honesty` AND an additional
  human rereading against the Wave 0 contracts here
- no closeout invents new gate text not in the original closeout — only
  regrades or footnotes existing gates

---

## WP-154 — CI Workflow Contract And Audit

Freeze whether `.github/workflows/` runs `npm run check` on PRs targeting
`main`, and if not, what Wave 3 must add.

Audit steps (in this Wave 0 spec):
- inventory every file under `.github/workflows/`
- confirm (by reading) that at least one workflow:
  - runs on `pull_request` targeting `main`
  - runs `npm install && npm run check` on Ubuntu (and optionally windows-latest)
  - fails the PR status if any step exits non-zero
- if absent, the contract is: Wave 3 adds a minimal workflow
  `.github/workflows/check.yml` with the shape above

Acceptance:
- audit is recorded in this doc as FOUND or ABSENT
- if ABSENT, Wave 3 ships a workflow that matches the contract
- if FOUND and working, Wave 3 cites the existing workflow in the Phase 6
  closeout without change

State ownership:
- written by: whoever maintains `.github/workflows/`
- read by: GitHub Actions on every PR/push
- degradation: if the runner is offline, GitHub's own status reflects it —
  VRE does not paper over CI outages

---

## Parallelism

- WP-149 runs first; nothing else in Phase 6 is accepted until scope is
  frozen.
- WP-150, WP-151, WP-152 can run in parallel after WP-149 (three independent
  contracts).
- WP-153 is independent and can progress alongside WP-150..152.
- WP-154 audit can run fully in parallel; the result feeds Wave 3.

---

## Exit Condition

Wave 0 is complete when:
- all five WP contracts are frozen and checked into
  `blueprints/definitive-spec/implementation-plan/phase6-01-wave-0-contracts-and-scope.md`
- no Wave 1-4 WP depends on an unfrozen contract
- the CI workflow audit result is recorded in this doc
