# Phase 5.5 Wave 0 — Contracts And Honesty Rules

**Goal:** Freeze the schema diffs, runtime contracts, and closeout honesty
standard that every subsequent Phase 5.5 wave must conform to.

---

## Scope Rule

Wave 0 freezes only what Phase 5.5 actually touches:
- extensions to two existing schemas (`session-snapshot`, `export-snapshot`)
- one new schema for `task-registry`
- one contract freeze for task-kind registration
- one contract freeze for provider binding `local-subprocess`
- one contract freeze for the minimal CLI dispatcher
- one closeout honesty standard applied retroactively to Phase 1/3/4/5

It does NOT freeze:
- new kernel-side projections
- new memory-layer surfaces
- new connector kinds
- any domain-pack rule engine

---

## WP-113 — Phase 5.5 Scope And Non-Feature-Creep Statement

Record one implementation stance and use it everywhere:
- Phase 5.5 is an audit-hardening pass, not a feature release.
- Every change traces to a finding ID in `phase55-00-index.md` §Findings Addressed.
- No work package introduces scope beyond the 13 findings. New needs discovered
  during Phase 5.5 implementation open Phase 6 tickets; they do not extend
  Phase 5.5.

Acceptance:
- no work package lands code touching files outside the finding-derived set
  without a one-line justification linked to a finding
- no work package adds a new schema beyond `task-registry-entry.schema.json`
  and **per-task input schemas referenced from registry entries** (e.g.
  `literature-register-input.schema.json`). Per-task input schemas are
  ancillary to WP-116's registry contract and are explicitly permitted by
  this acceptance clause; they do NOT count as independent new contract
  surfaces. Every such schema MUST be cited from a registry entry's
  `inputSchema` field, or it is out of scope.
- no work package adds a new `environment/` top-level folder

---

## WP-114 — Session Snapshot Schema Extension (`signals.sourceMode`)

Extend `environment/schemas/session-snapshot.schema.json` to distinguish
kernel-backed signals from degraded-mode signals.

Contract:
- add required object `signals.provenance`:
  - `sourceMode`: enum `["kernel-backed", "degraded", "mixed"]`
  - `degradedReason`: string or null
  - `lastKernelContactAt`: ISO timestamp or null
- `kernel-backed`: every kernel-dependent signal field was derived from a live
  kernel-reader call, and workspace-derived signal fields were read without
  fallback
- `degraded`: one or more kernel-dependent signal fields fell back because the
  kernel reader was absent or unavailable; workspace-derived fields may still
  be valid
- `mixed`: the kernel reader existed but at least one kernel-dependent field
  threw while another kernel-dependent or workspace-derived field succeeded

Important semantic boundary:
- `sourceMode` does **not** claim every signal field comes from the kernel.
  `staleMemory`, `blockedExperiments`, and `exportAlerts` are workspace-derived
  by design. The field records whether kernel-dependent signal claims are
  actually kernel-backed, not whether the whole signal object is kernel-origin.
- the implementation should include per-field provenance metadata if needed for
  debugging, but the exit gate only requires the top-level `sourceMode` and
  reason fields above.

Backward compatibility:
- existing `session.json` files without `signals.provenance` must still
  validate — use schema `allOf` with a degraded-compatibility branch that
  tolerates the missing field for a single transitional release
- mandatory enforcement in the **next** snapshot publish after the helper
  lands; readers must tolerate the transitional shape

Acceptance:
- schema accepts both legacy and v2-compliant payloads during the transition
- schema rejects any payload where `signals.unresolvedClaims > 0` while
  `signals.provenance.sourceMode === 'degraded'` (logical consistency)
- fixture suite under `environment/tests/schemas/` covers both legacy and v2

State ownership:
- written by: `environment/control/middleware.js` (via
  `rebuildSessionSnapshot` in `environment/control/session-snapshot.js`)
- read by: `environment/control/query.js`, `commands/flow-status.md` helpers,
  orchestrator `query.js`
- no flow helper writes `signals.*` directly

---

## WP-115 — Export Snapshot Immutability Contract

Freeze the runtime invariant for frozen export snapshots:
- `.vibe-science-environment/writing/exports/snapshots/<snapshotId>.json` is
  write-once
- once written, the file is not rewritten, even with identical bytes
- seeds under `.vibe-science-environment/writing/exports/seeds/<snapshotId>/`
  are likewise write-once per snapshotId
- reruns with the same `snapshotId` MUST throw a typed error
  `ExportSnapshotAlreadyExistsError` whose message includes the existing
  snapshot's `createdAt` and the current attempt's `attemptId`

Policy:
- callers that genuinely need to re-export with fresh content generate a new
  `snapshotId`; there is no force-overwrite flag
- snapshot JSON writes use an exclusive create primitive
  (`writeFile(..., { flag: 'wx' })`), not a pre-check
- rendered seed text is write-once under the seed directory for that snapshotId
- no `existsSync`-then-write guard is permitted for snapshot immutability; that
  pattern is TOCTOU-racy and was explicitly rejected by the audit

Acceptance:
- `environment/lib/export-snapshot.js` uses `{ flag: 'wx' }` on all snapshot
  JSON writes; no pre-existence guard is sufficient
- `environment/flows/writing.js` removes the `rm(seedRoot, {recursive:true,
  force:true})` call before seed regeneration (the rm is what today allows
  silent overwrites of the seed tree)
- any reruns produce a visible escalation record, not silent replacement

---

## WP-116 — Task Registry Schema And Registration Contract

Freeze the contract for declarative task-kind registration so the orchestrator
stops hardcoding one task kind in `execution-lane.js`.

New schema: `environment/schemas/task-registry-entry.schema.json`

Required fields:
- `schemaVersion`: `"vibe-env.task-registry-entry.v1"`
- `taskKind`: string (canonical identifier, lowercase kebab)
- `lane`: enum `["execution", "review"]`
- `requiredCapability`: enum matching `provider-gateway.js`
  (`"programmatic"`, `"output-only"`, etc.)
- `helperModule`: string (relative path from repo root)
- `helperExport`: string (named export invoked by the lane)
- `inputSchema`: string or null (relative path to the input schema)
- `outputContract`: object describing `{ summary, artifactRefs, warningCount,
  payload }` shape
- `routerKeywords`: array of strings (case-insensitive keyword classifier)
- `degradesTo`: `"escalate"` | `"noop"` | string (task kind)

Contract rules:
- each Phase 5.5 new task kind lands as one JSON entry under
  `environment/orchestrator/task-registry/` with its schema-validated record
- `execution-lane.js` and `review-lane.js` consume the registry; neither
  hardcodes `if (kind === '...')`
- the router uses `routerKeywords` + exact-match on `taskKind`; no task-kind
  inference regex remains in router or lane code
- adding a new task kind is a JSON change plus a tested helper, not a code
  change to lane runners

Acceptance:
- schema fixture tests valid/invalid/degraded
- validator `validate-task-registry.js` ensures each entry references a real
  module+export
- registry consumers read synchronously at startup (or on first use, cached)

---

## WP-117 — Provider Binding Contract: `local-subprocess`

Freeze the contract for one real provider binding so Phase 5.5 has at least
one non-mock executor shipped.

New integration kind: `local-subprocess`
- supported in `environment/orchestrator/provider-gateway.js`
- admitted by `environment/schemas/lane-policy.schema.json` and
  `environment/schemas/lane-run-record.schema.json` under `integrationKind`
- invoked via `child_process.spawn` with the declared command, args, and env
- stdin carries a JSON-serialized payload matching the input contract
- stdout returns a JSON-serialized lane outcome matching the output contract
- stderr is captured and appended to the lane-run record on failure
- a 30-second default timeout, configurable per binding
- exit code != 0 maps to `tool-failure`
- missing binary (`ENOENT`) maps to `dependency-unavailable`
- schema-invalid stdout maps to `contract-mismatch`

Scope choice:
- Phase 5.5 ships exactly one executor: `local-subprocess`
- it is wired to exactly one binding in the default lane-policies:
  `providerRef: "openai/codex:local-cli"` or
  `providerRef: "anthropic/claude:local-cli"` with
  `integrationKind: "local-subprocess"`, operator-chosen
- if the chosen CLI binary is not present on PATH, the provider gateway fails
  closed and the review gate in `phase5-closeout.md` is downgraded to PARTIAL
  (see WP-146)

Acceptance:
- `provider-gateway.js` gains a `localSubprocess` executor function registered
  via the existing `providerExecutors` injection surface
- both lane-policy and lane-run schemas accept `integrationKind:
  "local-subprocess"` and have valid/invalid schema tests for it
- `SUPPORTED_CAPABILITIES` admits `local-subprocess` for at least
  `output-only` and `programmatic`
- spawned subprocess never inherits stdin/stdout of the parent (pipe-only)
- test suite covers success, timeout, ENOENT, nonzero exit, malformed stdout

State ownership:
- configuration in `environment/orchestrator/task-registry/` per-task or in
  `lane-policies.json`
- no executor code imports kernel or flow helpers directly

---

## WP-118 — CLI Dispatcher Contract (`bin/vre`)

Freeze the contract for a minimum Node CLI dispatcher so Phase 5.5 has a
single coercive entry point instead of relying on agent discipline alone.

Binary path: `bin/vre` (executable JS with shebang)
Package.json: add `"bin": { "vre": "bin/vre" }`

Responsibilities:
- parse positional subcommand matching `commands/*.md` filename
  (e.g., `vre flow-status`, `vre flow-experiment --register`)
- load frontmatter from the corresponding `.md`
- invoke the documented JS import through `runWithMiddleware` unambiguously
- refuse any subcommand whose `.md` does not exist
- emit a one-line machine-readable summary on success; full output on failure

Scope:
- Phase 5.5 wires **three** commands through the dispatcher:
  `flow-status`, `sync-memory`, `orchestrator-status`
- remaining commands keep working as markdown contracts; the dispatcher is a
  capability, not a blanket replacement
- the dispatcher is additive; nothing existing breaks if it is not used

Acceptance:
- invoking `node bin/vre flow-status` from a VRE repo root writes a valid
  session-snapshot and returns exit code 0
- invoking `node bin/vre nonexistent-command` returns exit code 2 and prints
  the available subcommand list
- dispatcher writes the same `attempts.jsonl` entries an agent-invoked
  markdown contract would

---

## WP-119 — Closeout Honesty Standard

Freeze the exact grading vocabulary and evidence requirements to be applied to
every Phase 5.5 closeout correction (Wave 5).

Grading:
- **PASS**: automated test or validator encodes the invariant; the test
  actually exercises the claimed behavior end-to-end; saved evidence exists
  and is reproducible from `npm run check` or a clearly-named npm script.
- **PARTIAL**: the invariant holds in code paths tested, but a disclosed gap
  remains (e.g., only one provider binding, only one task kind wired). The
  closeout MUST link to a follow-up ticket or declare the deferral explicitly.
- **FALSE-POSITIVE**: a prior PASS is retracted. The closeout MUST show the
  original PASS line, quote the evidence that disproves it, and mark the gate
  with its new severity (PARTIAL, DEFERRED, or rejected).
- **DEFERRED**: the gate is no longer considered in scope for the phase; the
  closeout MUST state why the deferral is safe (no runtime dependency blocked
  by its absence).

Evidence requirements:
- every PASS line cites a test file path AND a specific test name
- every PARTIAL line cites the same PLUS the disclosure gap
- every FALSE-POSITIVE line cites the evidence file that disproves the prior
  claim
- every DEFERRED line cites the follow-up ticket id or the kernel-side
  milestone that gates it

Banned patterns:
- "verified against documentation" without an executable test
- "implementation-complete" without an exit-gate table
- "implementation-complete with saved evidence" when the evidence is a single
  one-shot run with `null` metrics
- decorative metric objects where every numeric field is `null` but a binary
  `flag: 1` sits beside it

Acceptance:
- `environment/tests/ci/validate-closeout-honesty.js` (new) parses every
  unique `phase*-closeout.md` path, checks each gate line according to its
  grade, and deduplicates explicitly supplied closeout paths before parsing
- every PASS gate must cite at least one existing test file path and one
  concrete test name, or an explicitly named validator plus the command that
  runs it
- every PARTIAL gate must cite executable evidence for the portion that passes
  and a declared follow-up or deferral note for the uncovered portion
- every FALSE-POSITIVE gate must quote or link the prior PASS claim and cite
  the evidence that disproves it
- every DEFERRED gate must cite the follow-up ticket, kernel-side milestone, or
  named future phase that owns it
- no `null`-only metric blocks or banned phrases are allowed
- Phase 5.5's own closeout (`phase55-closeout.md`) is the first document
  graded against this standard before any prior closeout correction lands

---

## Parallelism

- WP-113 runs first; nothing else is accepted until scope is frozen.
- WP-114, WP-115, WP-116 can run in parallel after WP-113.
- WP-117 and WP-118 can start once WP-116 lands (both depend on the registry
  contract).
- WP-119 is independent and can progress in parallel from WP-113.

---

## Exit Condition

Wave 0 is complete when:
- the three schema updates/additions are frozen with fixtures
- the immutability contract for export snapshots is written and referenced by
  Wave 1
- the task-registry, provider-binding, and CLI-dispatcher contracts are
  written and referenced by Waves 2 and 3
- the closeout honesty standard is written and referenced by Wave 5
- no Wave 1-5 work package depends on an unfrozen contract
