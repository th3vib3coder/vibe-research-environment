# Phase 6 Wave 2 — Real Provider Binding

**Goal:** Ship two CLI-backed provider executors (Codex, Claude) behind a new
`provider-cli` integration kind, register the `session-digest-review`
task-kind per WP-152, wire `review-lane.js` to route it via registry adapter,
and freeze the plan that regrades Phase 5 Gate 3 on real CLI output.

**Prerequisites:** Wave 0 WP-151 (provider-cli contract) + WP-152
(review-lineage task kind). Wave 1 does not block Wave 2.

---

## WP-160 — Codex CLI Executor

Ship `environment/orchestrator/executors/codex-cli.js`, the first concrete
realization of WP-151 for `providerRef:"openai/codex"`.

Factory signature:
```
buildCodexCliExecutor({ timeoutMs = 180_000, envPassthrough = [] } = {})
  -> async (payload, binding) -> providerCliOutputEnvelope
```

Spawn model (mirrors `local-subprocess.js`; does **not** extend it):
command from `VRE_CODEX_CLI` resolved at invocation time; args
`["exec","--json","-"]` (Codex single-prompt subcommand, envelope on stdin);
`shell:false`; stdin is WP-151 input envelope; stdout must parse as JSON
with `schemaVersion==="vibe-orch.provider-cli.output.v1"`; timeout default
**180 s**, SIGTERM → 5 s grace → SIGKILL.

**Timeout justification.** Codex `exec` is a network LLM call; vendor p95
~30-90 s; 180 s is ~3× p95 — generous enough to avoid false timeouts on slow
hosts, tight enough to bound worst case. WP-151 specifies 180 s; we match.

Sanitized env passthrough (default list, union with factory arg):
`ANTHROPIC_API_KEY` (Codex sometimes routes Anthropic requests),
`OPENAI_API_KEY` (primary API-key mode), `CODEX_API_KEY` (vendor-reserved
fallback), `CODEX_HOME` / `CODEX_CONFIG` / `XDG_CONFIG_HOME` (subscription-
mode config discovery), `VRE_CODEX_CLI` (nested invocations).

**VRE does not auto-discover credentials.** Operator exports one of the
above in the launching shell. Unset → Codex errors with its own auth
failure → executor classifies as `tool-failure` → review lane escalates.
Silent credential inheritance leaks secrets; we avoid it.

Errors rewrap `LocalSubprocessError` as `ProviderCliError` tagged
`integrationKind:"provider-cli"`, `providerRef:"openai/codex"`:
`dependency-unavailable` (ENOENT or env unset), `tool-failure` (non-zero
exit / signal / stderr-only), `contract-mismatch` (stdout not JSON or
schemaVersion mismatch).

**Six impl questions.** *Enters how:* `invokeLaneBinding` in `review-lane.js`
with the provider-cli binding. *State where:* none persistent;
`lane-run-record` records `evidenceMode:"real-cli-binding-codex"`.
*Read by:* `runReviewLane` (line 163) → `normalizeReviewOutcome`.
*Written by:* factory exported here; wired via `providerExecutors` by
callers. *Tested how:* shim binary emulating `codex exec --json -` echoing
a canned envelope; asserts payload passthrough, timeout, env isolation,
all three error codes. *Degrades how:* missing binary / unset env →
`dependency-unavailable` → review-lane escalates. No silent fallback.

---

## WP-161 — Claude CLI Executor

Ship `environment/orchestrator/executors/claude-cli.js` for
`providerRef:"anthropic/claude"`. Factory signature mirrors WP-160.

**Critical behavioral delta vs Codex.** Claude's non-interactive mode is
`claude -p <prompt> --output-format json` — prompt-first, NOT a subcommand
with envelope-on-stdin. Wrapper consequences: (1) JSON-serialize the
WP-151 input envelope and pass as the `-p` positional arg (stdin
`stream-json` session mode is heavier than single-turn review needs);
(2) Claude returns `{type:"result", result:"<string>", ...}` — wrapper
parses `result` as JSON and asserts
`schemaVersion==="vibe-orch.provider-cli.output.v1"`. Prose `result` →
`contract-mismatch`. Review lane prompt MUST instruct Claude to return a
JSON envelope; non-compliance is drift, not silent success.

Args arrays side by side:

| Provider | Env var | Args |
|---|---|---|
| Codex | `VRE_CODEX_CLI` | `["exec","--json","-"]` (envelope on stdin) |
| Claude | `VRE_CLAUDE_CLI` | `["-p",<envelopeJson>,"--output-format","json"]` |

Timeout 180 s (same justification). Sanitized env: `ANTHROPIC_API_KEY`,
`CLAUDE_API_KEY`, `CLAUDE_CONFIG_DIR`, `XDG_CONFIG_HOME`, `VRE_CLAUDE_CLI`.
Same fail-closed semantics.

**Six impl questions** — identical to WP-160 except `providerRef`,
`evidenceMode:"real-cli-binding-claude"`, and tested-how also covers the
prose-not-JSON `contract-mismatch` path.

---

## WP-162 — Provider Gateway + Schema Extensions (Additive Only)

### `provider-gateway.js` SUPPORTED_CAPABILITIES

**Before (lines 1-8):**
```js
const SUPPORTED_CAPABILITIES = Object.freeze({
  'local-logic': new Set(['output-only','programmatic']),
  'local-cli': new Set(['fire-and-forget','output-only','streaming']),
  'local-subprocess': new Set(['output-only','programmatic']),
  sdk: new Set(['output-only','streaming','programmatic']),
  api: new Set(['output-only','streaming','programmatic']),
  'cloud-task': new Set(['fire-and-forget','output-only']),
});
```

**After:** identical, plus `'provider-cli': new Set(['output-only','programmatic'])`.
`provider-cli` supports only `output-only` + `programmatic` — no `streaming`
(envelope is single-response JSON, not SSE), no `fire-and-forget` (review
needs a verdict).

**`selectLaneBinding` fallback review.** Existing `local-cli → api` fallback
(lines 74-89) stays untouched. Do **not** add `provider-cli → api` fallback:
that would be silent substitution, the same anti-pattern Phase 5.5 Wave 3
rejected. If `provider-cli` fails, escalate.

### `lane-policy.schema.json` integrationKind enum

**Before (lines 76-83):**
```json
"enum": ["local-cli","local-subprocess","sdk","api","cloud-task","local-logic"]
```
**After:**
```json
"enum": ["local-cli","local-subprocess","provider-cli","sdk","api","cloud-task","local-logic"]
```

### `lane-run-record.schema.json` two changes

1. Widen `integrationKind` enum identically (lines 54-64).
2. Add optional `evidenceMode` property:
```json
"evidenceMode": {
  "type": ["string","null"],
  "enum": [null,"real-cli-binding-codex","real-cli-binding-claude",
           "smoke-real-subprocess","mocked-review"]
}
```
Optional so existing records persisted without the field remain valid.

**Strict-widening invariant.** Enum additions are pure widening. Every
pre-existing `lane-runs.jsonl` record in the wild remains schema-valid — no
migration, no backfill. Phase 5 benchmark JSONL from 2026-04-10 continues
to validate; Phase 6 re-runs emit the new `evidenceMode` alongside.

**Six impl questions** — schemas & const loaded at boot / module import;
state = module-local constants + JSON on disk; read by Ajv on every
lane-run append + `selectLaneBinding` on every invocation; written only
by this WP; tested via `environment/tests/schemas/provider-cli-widening.test.js`
with old+new fixtures; additive-enum means legacy consumers still read
legacy data, new `evidenceMode` is optional so strict consumers ignore-by-
default.

---

## WP-163 — `session-digest-review` Task Kind (WP-152 Realization)

Three files land together.

### `environment/orchestrator/task-registry/session-digest-review.json`

```json
{
  "schemaVersion": "vibe-env.task-registry-entry.v1",
  "taskKind": "session-digest-review",
  "lane": "review",
  "requiredCapability": "output-only",
  "helperModule": "environment/flows/session-digest-review.js",
  "helperExport": "runSessionDigestReview",
  "inputSchema": "environment/schemas/session-digest-review-input.schema.json",
  "outputContract": {
    "summary": "string",
    "artifactRefs": ["comparedArtifactRef"],
    "warningCount": "integer",
    "payload": {
      "verdict": "string",
      "materialMismatch": "boolean",
      "followUpAction": "string",
      "evidenceMode": "string"
    }
  },
  "routerKeywords": ["review digest","contrarian digest","review exported digest"],
  "degradesTo": "escalate"
}
```

### `environment/schemas/session-digest-review-input.schema.json`

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "vibe-env/session-digest-review-input.schema.json",
  "title": "Session Digest Review Input",
  "type": "object",
  "additionalProperties": false,
  "required": ["executionLaneRunId"],
  "properties": {
    "executionLaneRunId": { "type": "string", "pattern": "^ORCH-RUN-.+$" },
    "comparedArtifactRefs": {
      "type": "array",
      "items": { "type": "string", "minLength": 1 }
    }
  }
}
```

### `environment/flows/session-digest-review.js`

Single export `runSessionDigestReview(projectPath, input)`: (1) read
completed `session-digest-export` lane-run via `input.executionLaneRunId`
(`getLatestLaneRun` / `listLaneRuns`); (2) collect its `artifactRefs`; if
`input.comparedArtifactRefs` supplied, use **intersection** — never expand
beyond what execution actually produced; (3) return
`{comparedArtifactRefs, executionLaneRunId}` for review-lane to invoke the
binding. Helper does **not** itself call the executor — separating adapter
(shape) from evidence producer (provider gateway) matches Phase 5.5 WP-128.

**Six impl questions** — enters via router-keyword match OR explicit
`taskKind:"session-digest-review"`; state = new registry JSON + runtime
cache in `task-registry.js`; read by `getTaskEntry` + `runReviewLane`;
written only here; tested via registry-load integration test asserting
`listReviewTaskKinds()` includes the new kind, plus valid/invalid input
fixtures; `degradesTo:"escalate"` routes executor errors through review-
lane catch block.

---

## WP-164 — Review-Lane Adapter Routing

Edit `environment/orchestrator/review-lane.js` to route registered review
task kinds through the registry adapter, preserving manual artifact-review
as default.

Current `runReviewLane` entry (quoted, lines 116-135):
```js
export async function runReviewLane(projectPath, options = {}) {
  const task = await getQueueTask(projectPath, options.taskId);
  if (!task) throw new Error(`Queue task not found: ${options.taskId}`);
  assertReviewableTask(task);
  const [lanePolicies, continuityProfile] = await Promise.all([
    readLanePolicies(projectPath), readContinuityProfile(projectPath),
  ]);
  const binding = selectLaneBinding({
    laneId:'review', lanePolicies, continuityProfile,
    requiredCapability:'output-only',
    providerExecutors: options.providerExecutors ?? {},
    systemDefaultAllowApiFallback: false,
  });
```

Insertion point: **after** `assertReviewableTask(task)`, **before**
`selectLaneBinding`. If `task.taskKind` is set AND resolves via
`getTaskEntry` to a `lane:"review"` entry: call
`validateTaskInput(taskKind, task.taskInput)`, invoke helper →
`{comparedArtifactRefs, executionLaneRunId}`, replace the
`resolveReviewTask(projectPath, task)` branch for this kind only. All
subsequent code (binding resolve, `invokeLaneBinding`,
`normalizeReviewOutcome`, `appendLaneRun`, `appendExternalReviewRecord`)
runs **unchanged**. Unset or unregistered `taskKind` → fall through to
existing `resolveReviewTask` manual path. **Do not mutate** that path.
Mirrors WP-128 execution-lane pattern. `requiredCapability` stays
`output-only`; operator picks `integrationKind:"provider-cli"` in
`lane-policies.json` if they want real CLI evidence.

**Six impl questions** — enters via `runReviewLane` with a task whose
`taskKind` matches a review registry entry; no new persisted state; read
by `runReviewLane` callers; written only here; tested via
`environment/tests/integration/review-lane-registry.test.js` covering both
registered and unregistered paths; registry miss → manual-review path
preserved (no regression).

---

## WP-165 — Benchmark Rerun Plan for Phase 5 Review-Lineage

**PLAN, not the rerun.** Execution is Wave 4. Most critical artifact in
Wave 2 — the contract that turns F-04 from FALSE-POSITIVE into PASS or
honestly-disclosed PARTIAL.

### Target benchmark
File: `environment/evals/tasks/orchestrator-execution-review-lineage.json`
Current grade basis: `evidenceMode:"mocked-review"` via
`buildMockReviewExecutor` in `save-phase5-artifacts.js:213` — the F-04
mock that blocks Phase 6 exit gate.

### Executor mode selection (deterministic, logged into summary.json)

| Env at rerun | Mode | Action |
|---|---|---|
| `VRE_CODEX_CLI` set + executable | `real-cli-binding-codex` | spawn via WP-160 |
| `VRE_CLAUDE_CLI` set + executable | `real-cli-binding-claude` | spawn via WP-161 |
| Both set | `real-cli-binding-codex` (deterministic preference) | spawn Codex |
| Neither set | DECLARED SKIP | emit `gradeDecision:"cannot-regrade-on-this-host"` with follow-up; do **not** downgrade to smoke |

Declared-skip is mandatory. Silently falling back to
`smoke-real-subprocess` (the `node -e` echo) would repeat the original
F-04 sin.

### Required summary.json extensions

Beyond today's shape (see
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

### Real evidence vs evidence-shaped mock

Real evidence requires **all**: `evidenceMode` starts with
`real-cli-binding-`; `providerCliBinding.binaryPath` resolves to a file on
host at grading time; `exitCode===0`; `sourceOfVerdict==="cli-stdout-json"`;
lane-run-record persisted with `integrationKind:"provider-cli"` and matching
`evidenceMode`.

Evidence-shaped mock (any of): non-zero exit but summary claims affirmed
(AUTO-FAIL); stdout did not parse (AUTO-FAIL); `evidenceMode===
"smoke-real-subprocess"` (does NOT clear F-04 — already what 5.6 had).

### Decision table: rerun outcome → F-04 regrade

| Outcome | Regrade |
|---|---|
| `gradeDecision=PASS` | **PASS.** Cite regenerated summary.json by path+sha256 in phase6 closeout. F-04 closed. |
| `gradeDecision=PARTIAL` (real run, verdict inconclusive OR materialMismatch true) | **PARTIAL.** Gate 3 stays PARTIAL with new `FU-60-00N` naming verdict + PASS prerequisites. F-04 closed with disclosure. |
| `gradeDecision=cannot-regrade-on-this-host` | **PARTIAL with explicit deferral.** F-04 remains FALSE-POSITIVE until a host with at least one CLI reruns. **Phase 6 exit gate does NOT pass** — host must have at least one CLI. |
| CLI spawned but `contract-mismatch` | **FAIL the regrade.** Do NOT mark PASS. Blocker for Wave 3 re-run with tuned prompt. |

**Six impl questions** — Wave 4 regrade script invokes eval harness with env
set; state = regenerated summary.json + mirrored lane-runs.jsonl at
`.vibe-science-environment/operator-validation/benchmarks/orchestrator-execution-review-lineage/<DATE>/`;
read by `validate-closeout-honesty` + phase6 closeout author; written by
`save-phase5-artifacts.js` (evidenceMode-aware summary emitter, Wave 4
edit); Wave 3 ships schema test for extended summary.json shape, Wave 4
rerun checks gradeDecision vs closeout text; neither CLI present →
deterministic declared-skip, no silent downgrade.

---

## Provider Binding Decisions Frozen For Wave 4

1. **`VRE_*_CLI` accepts bare binary names or absolute paths.** Resolve via
   native PATH lookup (`spawn` with `shell:false` handles bare names).
   Reject shell command strings (`"codex --profile foo"`), spaces, pipes,
   redirects, or bundled args as `contract-mismatch` at factory-build time;
   arguments belong in the factory config, not the binary field.
2. **Review targets are same-session only in Phase 6.** Input
   `executionLaneRunId` must resolve in the current project's
   `lane-runs.jsonl`. Cross-session review is deferred to Phase 7+ and must
   not be simulated by looking through old operator-validation artifacts.
3. **Provider CLI timeout retry policy is fail-once-escalate.** Set
   `retryPolicy.maxAttempts:1` for provider-cli bindings. Retrying a 180 s
   LLM timeout burns tokens without diagnostic value; escalate to the
   operator for rerun with an adjusted timeout.

---

## Parallelism

- WP-160 + WP-161 run fully in parallel.
- WP-162 must merge before WP-164 (selectLaneBinding reads widened enum).
- WP-163 depends only on WP-152; parallel with WP-160/161.
- WP-164 depends on WP-162 + WP-163.
- WP-165 is a plan doc; produced alongside, no code dep.

---

## Exit Condition for Wave 2

Wave 2 is complete when:
- `executors/codex-cli.js` + `executors/claude-cli.js` export factories
  matching WP-151.
- `provider-gateway.js` accepts `provider-cli` with `output-only` +
  `programmatic` only.
- Both schemas validate new enum values; pre-existing lane-run records
  continue to validate unchanged.
- `task-registry/session-digest-review.json` + input schema + flow helper
  land; `listReviewTaskKinds()` includes `"session-digest-review"`.
- `review-lane.js` routes the new kind via adapter; manual-review path
  untouched.
- WP-165 is cited by Wave 4 as the regrade contract for F-04.
- `npm run check` passes; 420 baseline preserved (Wave 3 adds the new
  regression tests).
