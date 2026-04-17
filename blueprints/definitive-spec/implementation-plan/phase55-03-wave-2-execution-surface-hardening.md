# Phase 5.5 Wave 2 — Execution Surface Hardening

**Goal:** Widen the execution lane from a single hardcoded task kind to a
registry-driven dispatcher, ship the first non-mock provider executor
(`local-subprocess`), and force a public honesty decision on the Phase 5
review gate (which today passes through an in-memory mock that always returns
`affirmed`).

Addresses **F-04** (P0, review gate is mock), **F-08** (P1, 1-task-kind
execution lane), **F-09** (P1, provider gateway is DI-only, no real binding).

---

## Scope Rule

Wave 2 changes only:
- `environment/orchestrator/execution-lane.js` (replace hardcoded dispatch)
- `environment/orchestrator/router.js` (replace hardcoded regex)
- new `environment/orchestrator/task-registry.js` (loader+validator+lookup)
- new `environment/orchestrator/task-registry/*.json` (three seed entries)
- new `environment/orchestrator/executors/local-subprocess.js` wired via the
  existing `providerExecutors` injection surface; no change to
  `selectLaneBinding`
- `environment/evals/save-phase5-artifacts.js` (rename + mode disclosure for
  the review scenario; real binding behind a smoke-test flag)

Out of scope: the CLI dispatcher (WP-118, Wave 3), the closeout correction
(WP-146, Wave 5), any kernel-side read.

---

## WP-126 — Task Registry Module

Implement `environment/orchestrator/task-registry.js` per WP-116. Loader +
validator + lookup, **not** a code generator. It scans
`environment/orchestrator/task-registry/*.json` at cold boot, validates each
JSON against `task-registry-entry.schema.json`, verifies `helperModule`
resolves and exports `helperExport` (missing module or missing named export
is a cold-boot failure), and exposes `getTaskRegistry()`,
`getTaskEntry(taskKind)`, `findByRouterKeyword(text)`,
`listExecutionTaskKinds()`.

**Cold boot vs cache.** Module-scope `let loaded = null; let loading = null`.
First call triggers disk read; subsequent calls return the resolved
`Map<taskKind, entry>` with **no disk I/O**. No hot reload — registry
changes require orchestrator restart (mirrors the `state.js` lane-policy
pattern). Concurrent async callers can race the first load, so the module
assigns `loading = doLoad()` before any await; parallel callers await the
same promise. No filesystem write, no lock needed. Any schema-invalid entry
or unresolved helper fails the entire load (`TaskRegistryLoadError`);
partial registries are not permitted — a typo in one JSON must not silently
shrink the surface.

**Six questions.** Enters through imports in `execution-lane.js`,
`router.js`, and the WP-140 validator. State: JSON on disk + in-process
Map cache. Read by execution lane, router, validator, `orchestrator-status`
shim. Written only by humans in PRs. Tested by `task-registry.test.js`:
3-entry load-success, schema-invalid reject-all, missing-module reject-all,
duplicate-taskKind reject-all, case-insensitive keyword match, cache reuse
(100 calls = 1 disk read). Degrades: missing directory throws
`TaskRegistryLoadError` surfaced as `dependency-unavailable`; empty
registry lets the router still create queue tasks but every execute
objective short-circuits through existing `buildImmediateEscalation`.

---

## WP-127 — Seed Task-Registry Entries (three)

Ship **three** JSON files under `environment/orchestrator/task-registry/`.
Each conforms to `vibe-env.task-registry-entry.v1`. No two entries share a
`taskKind` or any `routerKeywords` token (enforced by WP-140 validator).

All three target the **execution** lane with
`requiredCapability: "programmatic"` and `degradesTo: "escalate"`. Each
`outputContract` conforms to the `lane-run-record` surface (`summary`,
`artifactRefs`, `warningCount`) plus a `payload` for chained flows.
Review-lane entries land in Phase 6; Wave 2 does not seed them.

**Entry 1 — `session-digest-export.json`** (port of today's hardcode).
`helperModule`: `environment/flows/session-digest.js`; `helperExport`:
`exportSessionDigest`; `inputSchema`: null; `outputContract`:
`{summary, artifactRefs: [jsonPath, markdownPath], warningCount, payload:
{digest: "session-digest.v1", jsonPath, markdownPath}}`; `routerKeywords`:
`["session digest", "digest export", "export digest", "digest summary"]`.

**Entry 2 — `literature-flow-register.json`**. `helperModule`:
`environment/flows/literature.js`; `helperExport`: `registerPaper`;
`inputSchema`: `environment/schemas/literature-register-input.schema.json`
(new; mirrors existing `normalizePaperInput` shape — `{id?, title,
authors[], year?, doi?, abstract?, linkedClaims?, relevance?,
methodologyConflicts?, registeredAt?}`); `outputContract`:
`{summary, artifactRefs: ["lit-paper/<PAPER_ID>.json"], warningCount: 0,
payload: {paper: "lit-paper.v1", state: "literature-flow-state.v1"}}`;
`routerKeywords`: `["register paper", "add paper", "literature register",
"new citation"]`.

**Entry 3 — `memory-sync-refresh.json`**. `helperModule`:
`environment/memory/sync.js`; `helperExport`: `syncMemory`; `inputSchema`:
null; `outputContract`: `{summary, artifactRefs:
[".vibe-science-environment/memory/mirrors/project-overview.md",
".vibe-science-environment/memory/mirrors/decision-log.md"],
warningCount, payload: {syncState: "memory-sync-state.v1",
kernelAvailable: boolean}}`; `routerKeywords`: `["sync memory",
"refresh memory", "memory refresh", "memory sync"]`.

### Rejected candidates (recorded so Codex cannot reintroduce silently)
- **`experiment-flow-register`** (`flows/experiment.js`): output shaped
  around `lib/manifest.js`; re-enters the F-06 Phase 3 boundary. Phase 6.
- **`writing-export-finalize`** (`flows/writing.js`): WP-115 immutability
  still landing in Wave 1; registry bind would race that adoption.
- **`results-bundle-discover`** (`flows/results-discovery.js`): reads
  `lib/export-eligibility.js` (the file in F-06); must settle first.

**Six questions.** Enters via router keyword match or explicit `taskKind`.
State: JSON on disk only. Read by execution lane, router, CI validator.
Written by humans in PRs. Tested: each entry gets a helper-resolves test
and an end-to-end `runExecutionLane` against a fixture project. Degrades
via `degradesTo: "escalate"` — any helper throw routes through
`classifyExecutionFailure` and appends an escalation record.

---

## WP-128 — Execution-Lane Refactor

Replace the hardcoded dispatch at `execution-lane.js:53-60`.

Input contract:
- `run-queue-record.schema.json` gains optional `taskInput` (object,
  `additionalProperties: true`, bounded by the registry entry's `inputSchema`
  before execution).
- `routeOrchestratorObjective(..., { taskInput })` stores the sanitized
  `taskInput` on the queue record. `continueRoutedTask` preserves it.
- `runOrchestratorObjective(..., { taskInput })` forwards the same option to
  the router. CLI support for file-backed input (`--input-json`) is deferred
  unless the command is promoted through the dispatcher in Wave 3.
- For entries with `inputSchema: null`, any supplied `taskInput` is rejected
  before queue append. For entries with an input schema, missing required input
  produces a visible escalation, not a helper call with `{}`.

**Current:**
```js
async function executeTaskClass(projectPath, task, input = {}) {
  const taskKind = task.targetRef?.kind ?? null;
  if (taskKind === 'session-digest-export') {
    return runSessionDigestExport(projectPath, input);
  }
  throw new Error(`Unsupported execution task kind: ${taskKind ?? 'null'}`);
}
```

**Replacement sketch:**
```js
import { getTaskEntry } from './task-registry.js';

async function executeTaskClass(projectPath, task, input = {}) {
  const taskKind = task.targetRef?.kind ?? null;
  const entry = await getTaskEntry(taskKind);
  if (!entry || entry.lane !== 'execution') {
    throw new Error(`Unsupported execution task kind: ${taskKind ?? 'null'}`);
  }
  const helper = await loadHelper(entry.helperModule, entry.helperExport);
  const raw = await helper(projectPath, input);
  return shapeLaneOutcome(entry, projectPath, raw);
}
```

`shapeLaneOutcome` validates the helper's return against the entry's
`outputContract` and produces `{ summary, artifactRefs, warningCount,
payload }` matching what `appendLaneRun` already expects. For
`session-digest-export` the tuple is **byte-identical** to today's
`runSessionDigestExport` output (no regression).
`classifyExecutionFailure` is **not** touched; recovery, escalation,
attempt-number threading, and the try/catch envelope stay intact. The
per-task adapter `runSessionDigestExport` is removed; its
`path.relative`/`replace` formatting moves into the entry's contract
shaper.

The `input` argument comes from `task.taskInput` after registry-schema
validation. This is mandatory for `literature-flow-register`; without persisted
input the task would not be resumable after queue replay.

**Six questions.** Enters via `runExecutionLane → executeTaskClass` →
registry lookup. State reuses the read-only registry cache. Read by the
execution lane only. Written by nobody at runtime. Tested by three
end-to-end runs (one per seed kind) plus one unsupported-kind escalation
test; the `orchestrator-bounded-failure-recovery` benchmark passes
unchanged; saved evidence under
`.vibe-science-environment/evals/phase5/execution-backed-review-lineage/`
keeps identical `artifactRefs` and `summary`. Degrades: unknown kind
throws; existing classifier routes to `tool-failure`; attempt-limit
escalation fires.

---

## WP-129 — Router Extension

Replace the hardcoded regex at `router.js:34-40`.

**Current:**
```js
function inferTaskKindFromObjective(objective) {
  if (/\b(session digest|digest export|export digest|export a digest|digest summary)\b/iu.test(objective)) {
    return 'session-digest-export';
  }
  return null;
}
```

**Replacement sketch:**
```js
import { findByRouterKeyword } from './task-registry.js';

async function inferTaskKindFromObjective(objective) {
  const entry = await findByRouterKeyword(objective);
  return entry?.taskKind ?? null;
}
```

Matching: case-insensitive substring against word-boundary-trimmed tokens
(same semantics as today's regex). Entries match in deterministic order
(`taskKind` ASCII sort); first hit wins. A WP-140 CI validator fails the
build if two entries share any keyword token, so first-match ambiguity
cannot arise in practice. Explicit `options.taskKind` still wins over
keyword inference — the current precedence is preserved, but the implementation
must become async:
- `routeOrchestratorObjective` computes
  `const inferredTaskKind = options.taskKind ?? await inferTaskKindFromObjective(objective);`
  before calling mode classification.
- `classifyObjectiveMode` either becomes async or receives the already-inferred
  task kind as an argument; it must not call the async inference helper
  synchronously.
- all existing callers of `classifyObjectiveMode` and `routeOrchestratorObjective`
  are updated in the same diff.

`buildTargetRef`, `buildRouteTitle`,
`buildImmediateEscalation` stop hardcoding `'session-digest-export'`;
they read the registry entry for `{ kind, id }` targets and titles.

**Six questions.** Enters via `routeOrchestratorObjective`. State reads
from the registry; router adds none. Read by route creation only. Written
by nobody. Tested: 3 positive + 1 negative keyword test per seed entry
plus the duplicate-keyword CI validator. Degrades: `null` return triggers
the existing `buildImmediateEscalation` branch for `mode==='execute'`
with no taskKind.

---

## WP-130 — `local-subprocess` Provider Executor

Implement the first non-DI provider per WP-117 at
`environment/orchestrator/executors/local-subprocess.js`. Wired into
`provider-gateway.js` via the existing `providerExecutors` surface.

**Capability and schema patch (addresses audit P0-B).**
`lane-policy.schema.json` and `lane-run-record.schema.json` both add
`"local-subprocess"` to their `integrationKind` enum before any default policy
or lane-run record can use it.

`provider-gateway.js:1-7`
declares a frozen `SUPPORTED_CAPABILITIES` keyed by `integrationKind`. The
executor alone is not enough: `selectLaneBinding` calls
`supportsCapability(binding.integrationKind, capability)`, which returns
`false` for any unknown `integrationKind` and throws
`Lane <id> cannot satisfy <cap> with <integrationKind>.`. WP-130 therefore
MUST patch the map in the same diff that wires the executor:

```js
// environment/orchestrator/provider-gateway.js
const SUPPORTED_CAPABILITIES = Object.freeze({
  'local-logic': new Set(['output-only', 'programmatic']),
  'local-subprocess': new Set(['output-only', 'programmatic']),  // NEW
  // ...existing keys preserved
});
```

Wave 2 exit condition (below) is not met unless the three seed registry
entries in WP-127 actually bind at boot; validate by asserting
`selectLaneBinding` does not throw for any combination of
`lanePolicy.lanes[*].integrationKind === 'local-subprocess'` and
`requiredCapability === 'programmatic'`.

**Spawn** (Node stdlib only, no new dep): `child_process.spawn(command,
args, { stdio: ['pipe','pipe','pipe'], env: sanitizedEnv, detached: false,
shell: false })`. `shell: false` is **mandatory** — no shell
interpolation; command + args come from the lane-policy binding, never
user input.

**JSON envelope.** `stdin`: one JSON line ending in `\n`:
`{schemaVersion: "vibe-orch.local-subprocess.input.v1", task,
comparedArtifactRefs, continuity, projectPath}`. Parent closes stdin
after write so the child sees EOF. `stdout`: one JSON line
`{schemaVersion: "vibe-orch.local-subprocess.output.v1", verdict,
materialMismatch, summary, followUpAction, evidenceRefs}`. Schema-invalid
stdout → `contract-mismatch`. `stderr`: fully captured, truncated to
**4 KiB** before being attached to `laneRun.summary` on failure (bounds
JSONL rows, limits incidental secret exposure).

**Timeout and signals.** Default **45000 ms** (superset of the 30 s WP-117
floor; extra 15 s absorbs Codex CLI cold-start), overridable per binding
via `lanePolicy.lanes.<lane>.timeoutMs`. On expiry: `SIGTERM`; if alive
after a **2000 ms grace**, `SIGKILL`. Records `errorCode: "tool-failure"`
with `timeoutPhase: "sigterm" | "sigkill"`. `ENOENT` on spawn →
`dependency-unavailable`. Non-zero exit → `tool-failure` with `exitCode`.

**Env-var policy (security-sensitive, do not loosen).** `sanitizedEnv` is
**not** `process.env`. Whitelist: `PATH`, `HOME`, `USERPROFILE`, `APPDATA`,
`LOCALAPPDATA`, `SystemRoot`, `TEMP`, `TMP`, `LANG`, `LC_ALL` plus the
binding-declared `envPassthrough: string[]`. Credentials
(`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `AWS_*`, `GITHUB_*`) are
**excluded by default**; if a binding needs one, it lists the exact
variable name in `envPassthrough`, and the executor logs the passthrough
**key names** (never values) into `laneRun.summary` for audit.

**Six questions.** Enters via `selectLaneBinding` + `invokeLaneBinding`
when `providerExecutors` includes `local-subprocess`. State is the
per-invocation child-process handle; no persisted state beyond the
lane-run record. Read by the review lane (Wave 2) and, in Phase 6,
execution-lane subprocess tasks. Written by `appendLaneRun` (existing).
Tested by `environment/tests/orchestrator/local-subprocess.test.js` with
five cases: (1) success via `node -e` echo envelope, (2) ENOENT bogus
binary, (3) non-zero exit, (4) 45 s timeout SIGTERM→SIGKILL grace,
(5) malformed stdout → `contract-mismatch`. Degrades with observable,
reproducible evidence (exit codes, stderr, timeout phase) — unlike the
DI mock it replaces.

---

## WP-131 — Review Gate Honesty Decision (HYBRID)

`environment/evals/save-phase5-artifacts.js:213-221` today defines
`buildReviewExecutor()` returning `{verdict:'affirmed',
materialMismatch:false,…}` unconditionally. That is F-04: the Phase 5 gate
passes on a mock stamped into evidence.

**Choice: hybrid.** All three paths land; the benchmark selects one at
runtime and labels evidence accordingly.

1. **Smoke-test path (default in CI).** Rename `buildReviewExecutor()` →
   `buildMockReviewExecutor()`; add `buildSmokeReviewExecutor()` that binds
   `local-subprocess` to `spawn('node', ['-e', '<read stdin, echo affirmed
   envelope>'])`. A real subprocess round-trip exercises spawn, stdio,
   timeout arming, stderr capture, envelope schema. Evidence stamped
   `evidenceMode: "smoke-real-subprocess"`; verdict hardcoded in the child.
2. **Full path (opt-in when `VRE_CODEX_CLI` or `VRE_CLAUDE_CLI` names a
   real binary on PATH).** Binds `openai/codex:local-cli` or
   `anthropic/claude:local-cli` through `local-subprocess`; runs the
   review end-to-end. Stamped `evidenceMode: "real-cli-binding"` with the
   resolved binary path and truncated stderr.
   These `VRE_*_CLI` variables are read by the parent to choose a binary; they
   are not automatically passed through to the child environment.
3. **Explicit mock path (opt-in via `VRE_REVIEW_EVIDENCE_MODE=mock`).**
   Keeps `buildMockReviewExecutor`; stamps
   `evidenceMode: "mocked-review"` with a prominent warning; per WP-119,
   WP-146 downgrades the Phase 5 review gate to **PARTIAL** whenever
   evidence bears this mode. The gate never silently downgrades.

**Justification — what the operator learns.** A `node -e` subprocess
proves the **framework** (spawn, stdio, timeouts, stderr, envelope
schema); teaches nothing about review quality. A Codex/Claude CLI
invocation proves the **content** (whether a real second opinion affirms
or challenges); slow, requires a logged-in CLI on PATH, run-to-run
variance. The hybrid ships mechanical guarantees in CI on every commit
(smoke) and content guarantees only when the operator opts in (full).
`evidenceMode` is always explicit so WP-146 grades each saved run on its
merits: smoke = PARTIAL for review-content, full = PASS, mock =
PARTIAL-with-warning.

**Security / credential leakage.** Smoke passes `node -e` inline; no
credentials traverse the spawn. Full inherits only `envPassthrough`-listed
keys (WP-130), so only the exact CLI-auth vars declared by the binding
leave the parent. Stderr is truncated to 4 KiB before landing in JSONL,
limiting incidental secret exposure (e.g., a stack trace echoing a header).

**Six questions.** Enters via `executeExecutionReviewLineageScenario`
picking an executor from `VRE_REVIEW_EVIDENCE_MODE` and available env
vars. State: saved evidence JSON carries `evidenceMode` + (when set) the
resolved binary path. Read by WP-146 and the WP-140 validator (rejects
PASS claims on `mocked-review`). Written by `save-phase5-artifacts.js`
only. Tested by three benchmark variants with golden-shape assertions on
`evidenceMode`. Degrades: missing binary → `dependency-unavailable` and
fallback to `smoke-real-subprocess`; WP-146 grades PARTIAL.

---

## Parallelism

- **WP-126** runs first; nothing else in Wave 2 starts without the registry.
- **WP-127** and **WP-130** parallelize after WP-126 (entries vs. executor
  are independent code paths).
- **WP-128** and **WP-129** serialize after WP-126 + WP-127 (both consume
  registry entries; WP-129 also needs `findByRouterKeyword` stable).
- **WP-131** depends on WP-130 (uses `local-subprocess` for the smoke path).

---

## Exit Condition

Wave 2 is complete when all of the following hold (each measurable):

- [ ] `task-registry.js` loads three seed entries, rejects a schema-invalid
      fixture, and reuses its cache across 100 calls (1 disk read).
- [ ] `runExecutionLane` succeeds end-to-end for each seed kind against a
      fixture project with lane-run records of identical shape to today's.
- [ ] `routeOrchestratorObjective` resolves a `taskKind` for every seed
      entry's `routerKeywords`, returns `null` for unrelated prose; **no
      task-kind inference regex literal** remains in `router.js`. Other
      unrelated regexes (for titles, validation, or tests) are not part of this
      exit gate.
- [ ] `local-subprocess` passes the five-case test; `env` inspection
      confirms credential vars are absent unless listed in `envPassthrough`.
- [ ] `save-phase5-artifacts.js` distinguishes `mocked-review`,
      `smoke-real-subprocess`, `real-cli-binding`; CI default emits
      `smoke-real-subprocess`.
- [ ] `npm run check` green; `orchestrator-bounded-failure-recovery`
      unchanged; no kernel truth write added anywhere in Wave 2.
