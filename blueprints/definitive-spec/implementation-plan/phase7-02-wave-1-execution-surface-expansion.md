# Phase 7 Wave 1 — Execution Surface Expansion

**Goal:** Land the five new task kinds frozen in WP-177 — three
execution-lane kinds (`experiment-flow-register`,
`writing-export-finalize`, `results-bundle-discover`) and two review-lane
kinds (`contrarian-claim-review`, `citation-verification-review`). No
change to the registry loader, lane dispatchers, or router (all frozen by
Phase 5.5 Wave 2 + Phase 6 Wave 1). Wave 1 only adds registry entries,
input schemas, helpers, and adapters.

Addresses **G-05** (task registry narrow beyond Phase 6's
`session-digest-review`).

---

## Scope Correction 2026-04-18 — Review Kinds Deferred to Wave 1.5

During Wave 1 implementation, a scope mismatch surfaced between the
spec's WP-186/187 pseudocode and the existing `review-lane.js`
contract:

- `review-lane.js:165-173` requires the review adapter to return
  `{comparedArtifactRefs, executionLaneRunId: string}` — `executionLaneRunId`
  MUST be a non-empty string pointing at a completed execution lane-run
  (session-digest-review pattern).
- Claim-based and citation-based review kinds (WP-186 / WP-187) don't
  naturally produce an `executionLaneRunId` because they reference kernel
  truth (a claim head, a citation verification status) rather than a
  prior lane-run artifact chain.
- Shipping WP-186/WP-187 as specified would either require extending
  `review-lane.js` to accept a non-execution-lineage branch (~50 lines +
  tests), or would produce half-working registry entries that throw at
  runtime.

**Decision (Phase 6.2 discipline — no silent half-ships):** ship WP-183,
WP-184, WP-185, WP-188 in Wave 1. Defer WP-186 and WP-187 to **Phase 7
Wave 1.5** (new sub-wave) which first generalizes `review-lane.js` to
support claim/citation-based review lineage (pseudo-lineage id or null
executionLaneRunId with alternate `comparedArtifactRefs` source), then
lands the two deferred review kinds.

This is the same closeout-honesty pattern used for Phase 6.2: don't
overclaim that a wave is complete when part of the spec needs
architectural work that exceeds the declared scope. Open follow-up
**FU-7-001** tracks the review-lane generalization prerequisite.

Wave 1 shipped scope:
- 3 execution-lane task kinds (WP-183, WP-184, WP-185)
- `task-adapters.js` extension from 4 → 7 kinds (WP-188 partial)
- 3 input schema files + 3 schema fixture tests
- 1 integration test covering registry load, input validation, helper
  contract, and fail-closed idempotency for `finalizeExportDeliverable`

Wave 1.5 (new, opens after Wave 1 commits):
- **FU-7-001**: generalize `review-lane.js` to accept review task kinds
  whose `comparedArtifactRefs` source is kernel-truth (claim head,
  citation record) rather than a prior execution lane-run
- **WP-186**: `contrarian-claim-review` registry + helper + adapter
- **WP-187**: `citation-verification-review` registry + helper + adapter

---

## Scope Rule

Wave 1 changes only:
- `environment/orchestrator/task-registry/*.json` (five new entries)
- `environment/orchestrator/task-adapters.js` (append-only: five new adapters)
- `environment/flows/writing.js` (new `finalizeExportDeliverable` export)
- `environment/flows/contrarian-claim-review.js` (new module)
- `environment/flows/citation-verification-review.js` (new module)
- five new `environment/schemas/*-input.schema.json` files

Out of scope: CLI dispatcher (Wave 2), three-tier writing (Wave 3), any
kernel-side code, any change to `task-registry-entry.schema.json`
(reused as-is).

---

## WP-183 — Execution Kind `experiment-flow-register`

Ship JSON registry entry, new bounded input schema, adapter wrapping
`registerExperiment(projectPath, manifestInput)` from
`flows/experiment.js:169`.

### Registry entry (freeze shape)

```json
{
  "schemaVersion": "vibe-env.task-registry-entry.v1",
  "taskKind": "experiment-flow-register",
  "lane": "execution",
  "requiredCapability": "programmatic",
  "helperModule": "environment/flows/experiment.js",
  "helperExport": "registerExperiment",
  "inputSchema": "environment/schemas/experiment-register-input.schema.json",
  "outputContract": {
    "summary": "string",
    "artifactRefs": ["experimentManifestJsonPath"],
    "warningCount": "integer",
    "payload": {
      "manifest": "vibe.experiment.manifest.v1",
      "domain": "experiment-domain-preset.v1",
      "index": "flow-index.v1"
    }
  },
  "routerKeywords": ["register experiment", "new experiment", "create experiment manifest"],
  "degradesTo": "escalate"
}
```

### Input schema body (full)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "vibe-env/experiment-register-input.schema.json",
  "title": "VRE Experiment Register Input",
  "type": "object",
  "additionalProperties": false,
  "required": ["title", "objective"],
  "properties": {
    "experimentId": { "type": ["string", "null"], "pattern": "^EXP-[0-9]{3}$" },
    "title": { "type": "string", "minLength": 1 },
    "objective": { "type": "string", "minLength": 1 },
    "status": { "type": "string", "enum": ["planned"] },
    "parameters": { "type": "object" },
    "codeRef": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "entrypoint": { "type": ["string", "null"] },
        "gitCommit": { "type": ["string", "null"] }
      }
    },
    "inputArtifacts": { "type": "array", "items": { "type": "string" } },
    "relatedClaims": { "type": "array", "items": { "type": "string", "pattern": "^C-[0-9]{3}$" } },
    "notes": { "type": "string" }
  }
}
```

### Schema-drift flag

This input schema does **not** replace `experiment-manifest.schema.json`.
It intentionally excludes terminal, kernel-assigned, or
transition-controlled fields (`completedAt`, `latestAttemptId`,
`outputArtifacts`, `blockers`, `executionPolicy`) whose invariants
`createManifest` enforces at runtime. `status` is pinned to `planned`
because `normalizeManifest({mode: 'create'})` rejects any other starting
state at `environment/lib/manifest.js:220`. A future
`experiment-flow-update` task kind (out of Wave 1 scope) will cover
transitions.

### Adapter pseudocode

```js
async function runExperimentFlowRegister(projectPath, input = {}) {
  // input pre-validated by task-registry.validateTaskInput before queue append
  const result = await registerExperiment(projectPath, input);
  const experimentId = result.manifest?.experimentId ?? 'UNKNOWN';
  const artifactRef =
    `.vibe-science-environment/experiments/manifests/${experimentId}.json`;
  return {
    summary: `Registered experiment ${experimentId} (${result.manifest.title}).`,
    artifactRefs: [artifactRef],
    warningCount: 0,
    payload: { manifest: result.manifest, domain: result.domain, index: result.index },
  };
}
```

### Six questions

1. **Enter:** router keyword or explicit `options.taskKind`.
   `routeOrchestratorObjective` calls `validateTaskInput` before queueing,
   so malformed input escalates pre-write.
2. **State:** manifest JSON under
   `.vibe-science-environment/experiments/manifests/<EXP-ID>.json` plus
   flow-index update, both via `createManifest`.
3. **Read:** execution-lane adapter; future lane-run consumers.
4. **Write:** via `flows/experiment.js` chain. Adapter performs no writes.
5. **Tested:** registry load-resolve; one end-to-end `runExecutionLane`
   on a fixture; schema rejection on `status:'active'` (bounded enum);
   schema rejection on legacy `completedAt` (additionalProperties:false).
6. **Degrades:** `ManifestAlreadyExistsError` /
   `ManifestValidationError` → `tool-failure` or `contract-mismatch` →
   `degradesTo: escalate`. Atomic write prevents partial state.

**Dependencies:** Phase 5.5 Wave 2 registry/adapter substrate only.

---

## WP-184 — Execution Kind `writing-export-finalize`

Registry entry, input schema, and **new** helper
`finalizeExportDeliverable(projectPath, input)` exported from
`flows/writing.js`.

Registry entry identical shape to WP-183 with
`taskKind: "writing-export-finalize"`,
`helperExport: "finalizeExportDeliverable"`,
`routerKeywords: ["finalize writing export", "finalize export", "finalize draft"]`,
`outputContract.artifactRefs: ["deliverableMarkdownPath"]`,
`payload: {deliverableType, deliverablePath, snapshotId}`,
`degradesTo: "escalate"`.

### Input schema body (full)

```json
{
  "$id": "vibe-env/writing-export-finalize-input.schema.json",
  "type": "object",
  "additionalProperties": false,
  "required": ["exportSnapshotId", "deliverableType"],
  "properties": {
    "exportSnapshotId": { "type": "string", "pattern": "^WEXP-.+$" },
    "deliverableType": { "type": "string", "enum": ["draft", "advisor-pack", "rebuttal-pack"] }
  }
}
```

### Immutability contract vs Phase 5.6 snapshots

`finalizeExportDeliverable` **reads** the persisted snapshot at
`.vibe-science-environment/writing/exports/snapshots/<snapshotId>.json`;
it does **not** call `buildExportSnapshot` or `writeExportSnapshot`.
Phase 5.6's append-once guarantee (`ExportSnapshotAlreadyExistsError` at
`environment/lib/export-snapshot.js:41`) is preserved: the helper never
touches the snapshot file. If the snapshot is missing, it throws
`WritingFlowValidationError` → `dependency-unavailable`.

### What the finalized deliverable actually is (explicit)

A **single markdown file**, not a zip bundle, written to:

```
.vibe-science-environment/writing/deliverables/<snapshotId>/<deliverableType>/deliverable.md
```

It embeds the snapshot's claim-backed seed content plus YAML frontmatter
(`snapshotId`, `deliverableType`, `generatedAt`, `claimRefs`). Plain
markdown keeps the deliverable diff-visible and review-friendly (same
tooling as seed files). No binary artifacts land in Wave 1.

### Idempotency decision (fail-closed, flagged)

Wave 1 default: **fail-closed on re-invocation**. If
`deliverable.md` already exists under the `snapshotId` × `deliverableType`
path, throw `WritingFlowValidationError`. Rationale: matches the
append-once posture of snapshots; avoids silently overwriting reviewed
drafts. See Open Questions.

### Adapter pseudocode

```js
async function runWritingExportFinalize(projectPath, input = {}) {
  const result = await finalizeExportDeliverable(projectPath, input);
  return {
    summary: `Finalized ${input.deliverableType} deliverable from ${input.exportSnapshotId}.`,
    artifactRefs: [result.deliverablePath],
    warningCount: (result.warnings ?? []).length,
    payload: {
      deliverableType: input.deliverableType,
      deliverablePath: result.deliverablePath,
      snapshotId: input.exportSnapshotId,
    },
  };
}
```

### Six questions

1. **Enter:** registry + router keyword; schema-reject on missing fields
   → pre-queue escalation.
2. **State:** read-only on the snapshot file; write-once on a new
   deliverable file namespaced by `snapshotId` × `deliverableType`.
3. **Read:** adapter + future writing-status shims.
4. **Write:** helper writes exactly one markdown file; no JSONL / state
   mutation.
5. **Tested:** golden path; missing-snapshot degrade; pre-existing
   deliverable rejection; invalid `deliverableType` enum rejection.
6. **Degrades:** any throw routes through `classifyExecutionFailure`;
   `degradesTo: escalate`.

**Dependencies:** Phase 5.6 export-snapshot immutability. No kernel-bridge
or provider-cli dependency.

---

## WP-185 — Execution Kind `results-bundle-discover`

Registry entry, input schema, and adapter wrapping
`discoverBundlesByExperiment(projectPath, experimentIds)` from
`flows/results-discovery.js:22`.

Registry entry: `taskKind: "results-bundle-discover"`,
`helperModule: "environment/flows/results-discovery.js"`,
`helperExport: "discoverBundlesByExperiment"`,
`routerKeywords: ["discover bundles", "find results", "list bundles"]`,
`outputContract.artifactRefs: []`,
`payload: {bundles, experimentIds}`,
`degradesTo: "noop"`.

### Input schema body (full)

```json
{
  "$id": "vibe-env/results-bundle-discover-input.schema.json",
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "experimentId": { "type": "string", "pattern": "^EXP-[0-9]{3}$" },
    "claimId": { "type": "string", "pattern": "^C-[0-9]{3}$" },
    "sinceDate": { "type": "string", "format": "date-time" }
  }
}
```

All properties optional. Empty input → adapter returns all bundles.
`additionalProperties: false` rejects unknown fields.

### Why a lane task, not just a helper query

`discoverBundlesByExperiment` is a read-only query. WP-185 wraps it as
an execution-lane task because:
1. **Routable:** router keywords surface it through the same intake
   pipeline operators use for other tasks; lands in the queue with a
   visible `taskId`.
2. **Lane-run record for traceability:** every call produces a
   `lane-run-record` under `.vibe-science-environment/orchestrator/lane-runs.jsonl`
   — durable "who asked, when" audit trail that a bare helper call
   would not produce.
3. **Uniform failure handling:** filesystem read failures route through
   the same `classifyExecutionFailure` + recovery policy as write tasks.

`artifactRefs: []` is expected — discovery produces no new artifacts;
the lane-run contract tolerates empty arrays.

### Adapter pseudocode

```js
async function runResultsBundleDiscover(projectPath, input = {}) {
  const experimentIds = input.experimentId ? [input.experimentId] : [];
  const overview = await discoverBundlesByExperiment(projectPath, experimentIds);
  const bundles = [...overview.bundlesByExperiment.values()].filter(Boolean);
  const filtered = bundles.filter((b) => {
    if (input.claimId && !(b.relatedClaims ?? []).includes(input.claimId)) return false;
    if (input.sinceDate && new Date(b.createdAt) < new Date(input.sinceDate)) return false;
    return true;
  });
  return {
    summary: `Discovered ${filtered.length} bundle(s).`,
    artifactRefs: [],
    warningCount: (overview.warnings ?? []).length,
    payload: { bundles: filtered, experimentIds: filtered.map((b) => b.experimentId) },
  };
}
```

### Six questions

1. **Enter:** router keyword or explicit taskKind.
2. **State:** none written by adapter; reads `bundle-manifest.json` files
   and session digests on disk.
3. **Read:** adapter → discovery helper → filesystem. Consumer: operator.
4. **Write:** `appendLaneRun` via existing execution-lane pipeline.
   Adapter itself writes nothing.
5. **Tested:** empty input returns-all; experimentId filter; sinceDate
   filter; claimId filter; non-existent experimentId returns empty
   without error (`degradesTo: noop`).
6. **Degrades:** missing bundle root yields empty result + warnings;
   non-blocking.

**Dependencies:** Phase 5.5 Wave 2 substrate only.

---

## WP-186 — Review Kind `contrarian-claim-review`

Registry entry + new helper module
`environment/flows/contrarian-claim-review.js` exporting `reviewClaim`.
First review-lane registry entry beyond Phase 6's `session-digest-review`.

Registry entry: `lane: "review"`, `requiredCapability: "output-only"`,
`helperModule: "environment/flows/contrarian-claim-review.js"`,
`helperExport: "reviewClaim"`,
`routerKeywords: ["contrarian claim", "challenge claim", "review claim adversarially"]`,
`outputContract.payload: {verdict, materialMismatch, followUpAction}`,
`degradesTo: "escalate"`.

### Input schema body (full)

```json
{
  "$id": "vibe-env/contrarian-claim-review-input.schema.json",
  "type": "object",
  "additionalProperties": false,
  "required": ["claimId"],
  "properties": {
    "claimId": { "type": "string", "pattern": "^C-[0-9]{3}$" },
    "comparedArtifactRefs": { "type": "array", "items": { "type": "string" } }
  }
}
```

### Helper construction

`reviewClaim(projectPath, input)`:
1. Read claim head + citations + gate checks via the Phase 6
   kernel-bridge (`environment/kernel-bridge/read-claim.js`, shipped
   WP-155). On unavailable bridge → fail closed with typed error;
   review-lane runner escalates.
2. Render prompt from an **embedded** template (see below).
3. Invoke Phase 6 `provider-cli` executor (WP-160..WP-165) via
   `invokeLaneBinding(binding, providerExecutors, {...})`. The review
   lane already resolves a binding before calling the helper.
4. Parse the subprocess JSON envelope
   `{verdict, materialMismatch, summary, followUpAction, evidenceRefs}`
   per Phase 5.5 WP-130 output schema
   (`vibe-orch.local-subprocess.output.v1`).
5. Return typed object to the adapter.

### Prompt construction (where templates live)

Template lives **inside** `flows/contrarian-claim-review.js` as a frozen
constant `CONTRARIAN_CLAIM_REVIEW_PROMPT_TEMPLATE`. Sections: claim-head
summary, citation summaries, gate-check table, explicit instruction to
search for confounders and challenge supporting evidence, structured
response envelope (schema-tagged JSON). Rendered via an internal
`renderPrompt(head, citations, gates)` helper. No template lives in
markdown / outside code — keeps schema validation of the response
envelope in-code.

### Response parsing

Subprocess stdout MUST match `vibe-orch.local-subprocess.output.v1`.
`reviewClaim` validates it with a local Ajv compile and throws
`ReviewContractMismatchError` → `contract-mismatch` → escalation on
mismatch.

### Adapter pseudocode

```js
async function runContrarianClaimReview(projectPath, input = {}) {
  const result = await reviewClaim(projectPath, input);
  return {
    summary: result.summary,
    artifactRefs: [`claim/${input.claimId}`, ...(result.evidenceRefs ?? [])],
    warningCount: (result.warnings ?? []).length,
    payload: {
      verdict: result.verdict,
      materialMismatch: result.materialMismatch,
      followUpAction: result.followUpAction,
    },
  };
}
```

### Six questions

1. **Enter:** router keyword; queue task owner-lane forced to `review`.
2. **State:** no persisted state beyond the lane-run-record and the
   external-review-record appended by the review lane.
3. **Read:** claim-head/citations via kernel-bridge; lane-policy +
   continuity via existing state helpers.
4. **Write:** `appendLaneRun` + `appendExternalReviewRecord` via existing
   review-lane pipeline. Adapter itself writes nothing.
5. **Tested:** golden path with mock provider-cli executor; kernel-bridge
   `dependency-unavailable` degrade; contract-mismatch on malformed
   stdout; schema-reject on missing `claimId`.
6. **Degrades:** kernel-bridge unavailable → `dependency-unavailable`;
   provider-cli timeout → `tool-failure`; bad envelope →
   `contract-mismatch`. All → escalate.

**Dependencies:** **Phase 6 kernel-bridge (WP-155..WP-159)** for claim
reads. **Phase 6 provider-cli (WP-160..WP-165)** for adversarial
analysis. If Phase 6 shipped Outcome B (Gate 17 PARTIAL), this helper
inherits the PARTIAL disclosure in evidence metadata.

---

## WP-187 — Review Kind `citation-verification-review`

Parallel structure to WP-186. Helper:
`environment/flows/citation-verification-review.js` exporting
`reviewCitation`. Registry entry mirrors WP-186 with
`taskKind: "citation-verification-review"`,
`helperExport: "reviewCitation"`,
`routerKeywords: ["verify citation", "check citation", "citation review"]`,
`outputContract.artifactRefs: ["claimRef", "citationRef"]`.

### Input schema body (full)

```json
{
  "$id": "vibe-env/citation-verification-review-input.schema.json",
  "type": "object",
  "additionalProperties": false,
  "required": ["citationId", "claimId"],
  "properties": {
    "citationId": { "type": "string", "minLength": 3 },
    "claimId": { "type": "string", "pattern": "^C-[0-9]{3}$" }
  }
}
```

### Helper construction

`reviewCitation(projectPath, input)`:
1. Read citation verification status + backing claim head via Phase 6
   kernel-bridge (`read-citation.js`, `read-claim.js`).
2. Render prompt from embedded template
   `CITATION_VERIFICATION_PROMPT_TEMPLATE` inside the helper module —
   mirror of WP-186.
3. Invoke provider-cli; parse envelope; return typed object.

### Adapter pseudocode

```js
async function runCitationVerificationReview(projectPath, input = {}) {
  const result = await reviewCitation(projectPath, input);
  return {
    summary: result.summary,
    artifactRefs: [`claim/${input.claimId}`, `citation/${input.citationId}`],
    warningCount: (result.warnings ?? []).length,
    payload: {
      verdict: result.verdict,
      materialMismatch: result.materialMismatch,
      followUpAction: result.followUpAction,
    },
  };
}
```

### Six questions

Same structure as WP-186. Substitute "citation" for "claim".

**Dependencies:** **Phase 6 kernel-bridge** (citation read) and
**Phase 6 provider-cli**. Same Outcome-B inheritance rule as WP-186.

---

## WP-188 — `task-adapters.js` Append-Only Extension

Extend `ADAPTERS` in `environment/orchestrator/task-adapters.js` from
three entries to eight. The three existing adapters
(`runSessionDigestExport`, `runLiteratureFlowRegister`,
`runMemorySyncRefresh`) are **byte-identical** and untouched. This is an
append-only change; Wave 1 MUST NOT modify the existing three.

### New ADAPTERS map

```js
const ADAPTERS = Object.freeze({
  // existing (unchanged) — Phase 5.5 Wave 2
  'session-digest-export': runSessionDigestExport,
  'literature-flow-register': runLiteratureFlowRegister,
  'memory-sync-refresh': runMemorySyncRefresh,
  // new execution adapters (WP-183, WP-184, WP-185)
  'experiment-flow-register': runExperimentFlowRegister,
  'writing-export-finalize': runWritingExportFinalize,
  'results-bundle-discover': runResultsBundleDiscover,
  // new review adapters (WP-186, WP-187)
  'contrarian-claim-review': runContrarianClaimReview,
  'citation-verification-review': runCitationVerificationReview,
});
```

### Lane dispatch binding (clarification)

`execution-lane.js:executeTaskClass` already routes execution tasks
through `getTaskAdapter` and respects `entry.lane === 'execution'`.
**`review-lane.js` does not currently invoke `getTaskAdapter`** — it
calls `invokeLaneBinding` directly. WP-186 + WP-187 adapters run as
*post-invocation shapers*: `reviewClaim` / `reviewCitation` drives the
provider-cli subprocess internally, and the adapter shapes the return
for the lane-run record. The review lane itself is untouched; only its
downstream contract (helper + adapter) grows. **This is a deliberate
asymmetry** between the execution and review lanes and deserves
adversarial scrutiny — see Open Questions.

### Six questions

1. **Enter:** `getTaskAdapter(taskKind)` call in `executeTaskClass`
   (execution lane) or in-helper invocation (review lane).
2. **State:** none; adapters are pure functions.
3. **Read:** adapter reads input + invokes helper; helper-specific
   state ownership documented per WP.
4. **Write:** adapters themselves do not write.
5. **Tested:** `task-adapters.test.js` asserts eight keys;
   `listAdapterTaskKinds()` returns a sorted 8-element array; one
   golden-path test per new adapter; all three existing tests pass
   unchanged.
6. **Degrades:** helper throw propagates; lane runner classifies +
   routes to recovery. No new error taxonomy.

**Dependencies:** WP-183..WP-187 helpers landed.

---

## Parallelism

- WP-183, WP-184, WP-185 parallelize (independent helpers, schemas).
- WP-186, WP-187 parallelize after Phase 6 Wave 2 closes (kernel-bridge +
  provider-cli ready).
- WP-188 lands last, in a single diff extending `ADAPTERS`.

---

## Exit Condition

Wave 1 is complete when all hold:

- [ ] Five new JSON files in `environment/orchestrator/task-registry/`;
      `getTaskRegistry()` returns eight entries total.
- [ ] `listExecutionTaskKinds()` includes three new execution kinds
      (total six).
- [ ] `listReviewTaskKinds()` returns at least two kinds
      (`session-digest-review` from Phase 6 + the two new Phase 7 kinds).
- [ ] Five new input schemas validated by `compileInputSchema` without
      error.
- [ ] `runExecutionLane` passes end-to-end for each new execution kind
      on a fixture project; shape matches each entry's `outputContract`.
- [ ] `runReviewLane` passes end-to-end for each new review kind with a
      mock provider-cli executor returning a valid envelope;
      contract-mismatch envelope triggers the `contract-mismatch`
      classifier.
- [ ] `npm run check` green; no regression in the three existing
      adapters; no change to `task-registry.js`, `execution-lane.js`,
      `review-lane.js`, or `router.js`.

---

## Open Questions (non-blocker, recorded for Wave 5)

1. **Shared vs per-kind review prompt templates.** WP-186 and WP-187
   each embed their own template. A unified helper module
   `environment/flows/_review-templates.js` would DRY the rendering code
   when a third review kind appears; Wave 1 defers the factoring.
2. **`experiment-flow-register` legacy-field rejection.**
   `additionalProperties: false` will reject any legacy manifest field
   (e.g., `completedAt`) passed by accident. Alternative
   (`additionalProperties: true` + silent drop in `normalizeManifest`)
   has friendlier UX but hides operator confusion. Wave 1 keeps
   fail-closed; revisit after Wave 3 adoption data.
3. **`writing-export-finalize` idempotency.** Wave 1 ships fail-closed
   on pre-existing deliverable. Alternative — idempotent re-invocation
   returning the existing path — is better UX but hides state drift if
   the deliverable was manually edited between calls. Revisit if Wave 5
   operator-validation data flags confusion.
4. **Review-lane adapter dispatch asymmetry.** Execution lane invokes
   adapters directly; review lane invokes them via the helper that
   itself drives provider-cli. Future waves may want to hoist
   `invokeLaneBinding` into the adapter layer for symmetry; out of scope
   for Wave 1.
