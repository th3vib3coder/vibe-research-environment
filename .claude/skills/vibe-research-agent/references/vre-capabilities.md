# VRE Capability Reference

Complete inventory of every public helper, task kind, command, schema, and
kernel projection an agent can call when working in the Vibe Research
Environment.

**Organized by intent**, not by file. When the agent thinks "I need to
X", look under the matching section. For file-by-file cross-reference,
see the bottom of this doc.

> This doc is loaded on demand — the 7 core rules in `SKILL.md` cover
> the research loop. Come here when the loop doesn't cover what you need
> (automation, connectors, budget, continuity profile, domain-pack,
> low-level ledger, kernel introspection).

---

## Index

1. [Literature](#1-literature)
2. [Experiments](#2-experiments)
3. [Results packaging](#3-results-packaging)
4. [Writing export](#4-writing-export)
5. [Claim + citation + export eligibility](#5-claim--citation--export-eligibility)
6. [Orchestrator queue + lanes](#6-orchestrator-queue--lanes)
7. [Task registry](#7-task-registry)
8. [Provider executors](#8-provider-executors)
9. [Continuity profile + context assembly](#9-continuity-profile--context-assembly)
10. [Memory sync + marks + freshness](#10-memory-sync--marks--freshness)
11. [Control plane (attempts, decisions, events, snapshot)](#11-control-plane)
12. [Capability snapshot](#12-capability-snapshot)
13. [Connectors (filesystem + Obsidian)](#13-connectors)
14. [Automations](#14-automations)
15. [Domain packs](#15-domain-packs)
16. [Kernel bridge projections](#16-kernel-bridge-projections)
17. [Schemas catalog](#17-schemas-catalog)
18. [Command contracts](#18-command-contracts)
19. [CLI dispatcher + env vars](#19-cli-dispatcher--env-vars)
20. [Appendix — file-by-file map](#20-appendix--file-by-file-map)

---

## 1. Literature

**Module:** `environment/flows/literature.js`

- `registerPaper(projectPath, paperData)` — Register a new paper. Fields: `title`, `doi`, `authors`, `year`, `relatedClaims?`. Returns `{paper, state, warnings}`. **Call this whenever you read or find a relevant paper.**
- `listPapers(projectPath, filters = {})` — Fetch papers. Filters: `doi`, `claimId`, `sinceDate`.
- `surfaceGaps(projectPath, options = {})` — Surface claims that lack supporting citations.
- `linkPaperToClaim(projectPath, paperId, claimId, options = {})` — Bind an existing paper to a claim.
- Errors: `LiteratureFlowError`, `DuplicatePaperError` (thrown on DOI collision — catch and treat as "already registered"), `PaperNotFoundError`, `InvalidClaimLinkError`.

**Task kind:** `literature-flow-register` (execution lane) → runs `registerPaper` via adapter.

**Input schema:** `environment/schemas/literature-register-input.schema.json`.

**State file:** `.vibe-science-environment/flows/literature.json`.

---

## 2. Experiments

**Module:** `environment/flows/experiment.js`

- `registerExperiment(projectPath, data, options = {})` — Create manifest. Fields: `title`, `objective`, `parameters`, `codeRef {entrypoint, gitCommit}`, `relatedClaims?`. Returns `{manifest, domain, index}`. **Call before ANY data analysis.**
- `updateExperiment(projectPath, experimentId, patch, options = {})` — Patch existing manifest (e.g. add `outputArtifacts` after a run). Protected fields: `experimentId`, `status` terminal transitions.
- `listExperiments(projectPath, filters = {}, options = {})` — Filter by `status`, `claimId`, `sinceDate`.
- `surfaceBlockers(projectPath, options = {})` — List registration blockers (missing domain pack, missing claim refs, etc).

**Task kind:** `experiment-flow-register` (execution) → adapter wraps `registerExperiment`.

**Input schema:** `environment/schemas/experiment-register-input.schema.json`.

**Manifest file:** `.vibe-science-environment/experiments/manifests/<EXP-id>.json`.

**Errors (from `environment/lib/manifest.js`):** `ManifestError`, `ManifestValidationError`, `ManifestNotFoundError`, `ManifestAlreadyExistsError`, `ManifestTransitionError`, `ImmutableManifestError`.

**Low-level helpers (`environment/lib/manifest.js`):** `createManifest`, `readManifest`, `updateManifest`, `listManifests`. Usually you go through `flows/experiment.js` — drop to `lib/manifest.js` only if you need raw access.

---

## 3. Results packaging

**Module:** `environment/flows/results.js`

- `packageExperimentResults(projectPath, experimentId, options = {})` — Package output artifacts into a bundle. Verifies manifest references match outputs. Returns `{bundle, manifest, warnings}`.
- Errors: `ResultsFlowError`, `ResultsPackagingError`.

**Module:** `environment/flows/results-discovery.js`

- `discoverBundlesByExperiment(projectPath, experimentIds)` — Returns `{bundlesByExperiment: Map, warnings}`. Empty input → all bundles.
- `getResultsOverview(projectPath, options = {})` — Summary {bundleCount, totalSize, byExperiment}.

**Task kind:** `results-bundle-discover` (execution) → adapter wraps `discoverBundlesByExperiment`.

**Rendering helpers (`environment/flows/results-render.js`):** `buildBundleFiles`, `buildBundleArtifacts`, `buildWarnings`, `buildWarningActions` — internal use by `packageExperimentResults`.

**Bundle manifest helpers (`environment/lib/bundle-manifest.js`):** `buildBundleManifest`, `normalizeBundleArtifact`, `validateBundleManifest`, `writeBundleManifest`. Constant: `BUNDLE_SCHEMA_VERSION`.

**Bundle location:** `.vibe-science-environment/results/bundles/<EXP-id>/`.

---

## 4. Writing export

**Module:** `environment/flows/writing.js`

- `buildWritingHandoff(projectPath, options = {})` — Full handoff assembly. Options: `snapshotId?`, `claimIds?`, `now?`, `reader?`. Builds export snapshot, renders claim-backed seeds, creates advisor-ready directory. Returns `{snapshot, seeds, alerts, manifest}`.
- `finalizeExportDeliverable(projectPath, input = {})` — Convert a persisted snapshot into a single markdown deliverable. Input: `{exportSnapshotId, deliverableType}` where deliverableType ∈ `{draft, advisor-pack, rebuttal-pack}`. Fail-closed on re-invocation (no overwrites). **Task kind:** `writing-export-finalize` (execution).
- Errors: `WritingFlowError`, `WritingFlowValidationError`.

**Module:** `environment/flows/writing-overview.js`
- `getWritingOverview(projectPath, options = {})` — Inventory of exports, snapshots, pending handoffs.
- `getWritingSignalSummary(projectPath)` — Unresolved reviewer comments count.

**Module:** `environment/flows/writing-packs.js`
- `buildAdvisorPack(projectPath, options = {})` — Advisor-oriented pack.
- `buildRebuttalPack(projectPath, submissionId, options = {})` — Rebuttal-oriented pack.

**Rendering (`environment/flows/writing-render.js`):** `renderClaimBackedSeed` (format claim as writing prompt).

**Pack rendering (`environment/flows/writing-pack-render.js`):** `renderAdvisorStatusSummary`, `renderExperimentProgress`, `renderOpenQuestions`, `renderNextSteps`, `renderReviewerComments`, `renderClaimStatus`, `renderExperimentPlan`, `renderResponseDraft`.

**Locations:**
- Snapshots: `.vibe-science-environment/writing/exports/snapshots/<snapshotId>.json`
- Seeds: `.vibe-science-environment/writing/exports/seeds/<snapshotId>/<C-id>.md`
- Deliverables: `.vibe-science-environment/writing/deliverables/<snapshotId>/<type>/deliverable.md`

---

## 5. Claim + citation + export eligibility

**Module:** `environment/lib/export-eligibility.js`

- `exportEligibility(claimId, reader, options = {})` — Check if a claim is eligible for claim-backed export. Returns `{eligible, reasons}`.
- `readSchemaValidationRecord(projectPath, claimId, options = {})` — Fetch validation history for a claim.
- Constants: `EXPORT_ELIGIBILITY_REASON_CODES` (enum of reasons like `PROMOTED`, `R2_REVIEWED`, `CITATIONS_VERIFIED`, etc), `PROFILE_SAFETY_MODES`.
- Errors: `ExportEligibilityError`, `ExportEligibilityValidationError`.

**Module:** `environment/lib/export-snapshot.js`
- `buildExportSnapshot(data, options = {})` — Build snapshot (claims + citations + capabilities + warnings).
- `validateExportSnapshot(snapshot, options = {})` — Schema validation.
- `writeExportSnapshot(projectPath, data, options = {})` — Persist with fail-closed `wx` (no overwrite → `ExportSnapshotAlreadyExistsError`).
- `resolveExportSnapshotPath(projectPath, snapshotId)` — Path helper.
- Errors: `ExportSnapshotError`, `ExportSnapshotValidationError`, `ExportSnapshotAlreadyExistsError`.

**Module:** `environment/lib/export-records.js`
- `buildExportRecord(data, options)`, `appendExportRecord(projectPath, data, options)` — Log an export event.
- `buildExportAlertRecord(data, options)`, `appendExportAlert(projectPath, data, options)` — Log an export alert (e.g. promoted claim later demoted).
- `buildExportAlertReplayKey(alertRecord)` — Dedup key for replays.
- `validateExportRecord`, `validateExportAlertRecord` — Schema validation.

---

## 6. Orchestrator queue + lanes

**Module:** `environment/orchestrator/queue.js`

- `createQueueTask(projectPath, input = {})` — Enqueue with input schema validation.
- `getQueueTask(projectPath, taskId)` — Fetch task.
- `listQueueRecords(projectPath, filters = {})` — All queue records.
- `appendQueueStatusTransition(projectPath, taskId, patch)` — Update status (`queued` → `running` → `completed`/`failed`/`escalated`).
- `appendQueueDependencyUpdate(projectPath, taskId, dependencyTaskIds, options)` — Declare deps.
- `appendQueueLaneReassignment(projectPath, taskId, ownerLane, options)` — Reassign to execution/review.
- `getLatestQueueState(projectPath)` — Current snapshot.
- `listReadyTasks`, `listBlockedTasks`, `listActiveTasks`, `listTerminalTasks`, `getQueueStatusCounts` — Queue introspection.

**Module:** `environment/orchestrator/execution-lane.js`
- `runExecutionLane(projectPath, options = {})` — Run ready execution-lane tasks. Emits `lane-run-record`.

**Module:** `environment/orchestrator/review-lane.js`
- `runReviewLane(projectPath, options = {})` — Run review-lane tasks. Binds provider-cli executor. Emits `external-review-record`.

**Module:** `environment/orchestrator/runtime.js`
- `buildOrchestratorShellStatus(projectPath)` — Full shell status (queue + lanes + continuity + escalation).
- `runOrchestratorObjective(args)` — Classify + dispatch one objective.
- `runOrchestratorStatus(args)` — Output status snapshot (wraps `buildOrchestratorShellStatus`).

**Module:** `environment/orchestrator/router.js`
- `classifyObjectiveMode(objective, requestedMode = null)` — Map text to `execution` or `review`.
- `continueRoutedTask(projectPath, options = {})` — Resume task from queue/escalation.
- `routeOrchestratorObjective(projectPath, options = {})` — New objective → classify → enqueue.
- Constant: `MODE_TO_PRIMARY_LANE`.

**Module:** `environment/orchestrator/ledgers.js`
- `appendLaneRun`, `listLaneRuns`, `getLatestLaneRun` — Lane invocation log (`lane-runs.jsonl`).
- `appendRecoveryRecord`, `listRecoveryRecords`, `getLatestRecoveryRecord` — Recovery log (`recovery-log.jsonl`).
- `appendEscalationRecord`, `listEscalationRecords`, `getLatestEscalation` — Escalation log (`escalations.jsonl`).
- `appendExternalReviewRecord`, `listExternalReviewRecords`, `getLatestExternalReviewRecord` — External review log (`external-review-log.jsonl`).
- `listActiveLaneRuns` — Non-terminal lane invocations.

**Module:** `environment/orchestrator/recovery.js`
- `getDefaultRecoveryPolicy(failureClass)` — Policy lookup for `tool-failure`, `contract-mismatch`, `dependency-unavailable`, `timeout`, etc.

**Module:** `environment/orchestrator/state.js`
- State factories: `buildDefaultRouterSession`, `buildDefaultContinuityProfile`, `buildDefaultLanePolicies`.
- State readers/writers: `readRouterSession` / `writeRouterSession`, `readContinuityProfile` / `writeContinuityProfile`, `readLanePolicies` / `writeLanePolicies`.
- Bootstrap: `bootstrapRouterSession`, `bootstrapContinuityProfile`, `bootstrapLanePolicies`, `bootstrapOrchestratorLedgers`, `bootstrapOrchestratorState`.

**Module:** `environment/orchestrator/query.js`
- `getOrchestratorStatus(projectPath)` — Snapshot for inspector consumers.

**Locations:** `.vibe-science-environment/orchestrator/` contains `run-queue.json`, `router-session.json`, `continuity-profile.json`, `lane-policies.json`, `lane-runs.jsonl`, `external-review-log.jsonl`, `escalations.jsonl`, `recovery-log.jsonl`, `continuity-profile-history.jsonl`.

---

## 7. Task registry

**Module:** `environment/orchestrator/task-registry.js`

- `getTaskRegistry()` — Load all `task-registry/*.json` entries, cached.
- `getTaskEntry(taskKind)` — Fetch one entry.
- `validateTaskInput(taskKind, taskInput)` — Validate input against `inputSchema`. Throws `TaskRegistryLoadError` on mismatch.
- `findByRouterKeyword(text)` — Natural-language match to task kind.
- `listExecutionTaskKinds()` — All execution-lane kinds.
- `listReviewTaskKinds()` — All review-lane kinds.
- `resetTaskRegistryCache()` — Force reload (tests).

**Module:** `environment/orchestrator/task-adapters.js`
- `getTaskAdapter(taskKind)` — Fetch adapter function.
- `listAdapterTaskKinds()` — Adapters currently registered.

**All 7 task kinds on disk** (`environment/orchestrator/task-registry/*.json`):

| Task Kind | Lane | Helper Export | Purpose |
|-----------|------|----------------|---------|
| `literature-flow-register` | execution | `registerPaper` | Register a paper |
| `experiment-flow-register` | execution | `registerExperiment` | Register experiment manifest |
| `results-bundle-discover` | execution | `discoverBundlesByExperiment` | Query results bundles |
| `writing-export-finalize` | execution | `finalizeExportDeliverable` | Finalize deliverable from snapshot |
| `session-digest-export` | execution | `exportSessionDigest` | Export session summary |
| `memory-sync-refresh` | execution | `syncMemory` | Refresh markdown mirrors |
| `session-digest-review` | review | `reviewSessionDigest` | Adversarial review of a digest (R2 via provider-cli) |

**Adapter contract:**
- Execution-lane adapters return `{summary, artifactRefs, warningCount, payload}`.
- Review-lane adapters return `{comparedArtifactRefs, executionLaneRunId}` (review-lane.js drives the provider binding).

---

## 8. Provider executors

**Module:** `environment/orchestrator/provider-gateway.js`
- `selectLaneBinding({laneId, lanePolicies, continuityProfile, requiredCapability, providerExecutors, systemDefaultAllowApiFallback})` — Pick the right executor for a lane run based on lane policy.
- `invokeLaneBinding(binding, providerExecutors = {}, payload = {})` — Actually spawn the selected executor.

**Module:** `environment/orchestrator/executors/claude-cli.js`
- `invokeClaudeCli(args)`, `buildClaudeCliExecutor(args)` — Spawn `claude` CLI with v1 envelope. Provider ref: `anthropic/claude`. Evidence mode: `real-cli-binding-claude`.
- Error: `ClaudeCliExecutorError`.

**Module:** `environment/orchestrator/executors/codex-cli.js`
- `invokeCodexCli(args)`, `buildCodexCliExecutor(args)` — Fake-CLI envelope path (tests / Wave 2 legacy).
- `invokeRealCodexCli(args)`, `buildRealCodexCliExecutor(args)` — Real Codex CLI spawn with `--output-last-message` tmpfile. Requires `stdinPayload.projectPath`. Provider ref: `openai/codex`. Evidence mode: `real-cli-binding-codex`.
- Error: `CodexCliExecutorError`.

**Module:** `environment/orchestrator/executors/local-subprocess.js`
- `invokeLocalSubprocess(args)`, `buildLocalSubprocessExecutor(args)` — Generic local subprocess with v1 envelope. Evidence mode: `smoke-real-subprocess`.
- Error: `LocalSubprocessError`.

**Constants** (every executor): `DEFAULT_TIMEOUT_MS`, `SIGKILL_GRACE_MS`, `MAX_STDERR_BYTES`, `INPUT_SCHEMA_VERSION`, `OUTPUT_SCHEMA_VERSION`.

---

## 9. Continuity profile + context assembly

**Module:** `environment/orchestrator/continuity-profile.js`
- `loadContinuityProfile(projectPath)` — Load operator context (mental model of the user).
- `listContinuityProfileHistory(projectPath, filters = {})` — Change log.
- `applyContinuityProfileUpdate(projectPath, input = {})` — Accept a change directly.
- `applyContinuityProfileForget(projectPath, input = {})` — Accept a forget directive.
- `createContinuityUpdateProposal(projectPath, input = {})` — Draft change for review.
- `createContinuityForgetProposal(projectPath, input = {})` — Draft forget for review.
- `confirmContinuityProposal(projectPath, proposal, options = {})` — Approve.
- `rejectContinuityProposal(proposal, options = {})` — Decline.

**Module:** `environment/orchestrator/context-assembly.js`
- `assembleContinuityContext(projectPath, options = {})` — Build full operator context (profile + kernel + memory). Modes: `profile`, `query`, `full`. Supports `queryText`, `limit`, `maxTokens`.
- `formatContinuityForPrompt(assembled, options = {})` — Render as system prompt text.
- `clearContinuityAssemblyCache()` — Tests.

**Module:** `environment/orchestrator/recall-adapters.js`
- `buildSourceRefsFromHits(hits = [])` — Convert kernel search results to citation refs.
- `collectRecallHits(projectPath, options = {})` — Reader projections (claims, citations, gates) filtered by query.
- `listRecallHits(projectPath, options = {})` — Cached recall hits.

---

## 10. Memory sync + marks + freshness

**Module:** `environment/memory/sync.js`
- `syncMemory(projectPath, options = {})` — Refresh `.vibe-science-environment/memory/mirrors/` from kernel. Options: `reader`, `syncedAt`, `decisionLimit`, `recentGateLimit`, `claimLimit`, `unresolvedLimit`.
- `renderProjectOverviewMirror({...})` — Format `project-overview.md`.
- `renderDecisionLogMirror({...})` — Format `decision-log.md`.
- `getMemorySyncState(projectPath)` — Last sync status.

**Module:** `environment/memory/marks.js`
- `buildMarkIndex(records = [])` — Index memory-mark-records by target.
- `getTargetMarks(markIndex, targetType, targetId)` — Retrieve marks for a target.
- `prioritizeByMarks(...)` — Sort by mark relevance.
- `getMemoryMarks(projectPath)` — All mark records.

**Module:** `environment/memory/status.js`
- `getMemoryFreshness(projectPath, options = {})` — Check sync age vs. now.
- Constants: `STALE_MEMORY_WARNING`, `MEMORY_STATUS_UNAVAILABLE_WARNING`.

**Task kind:** `memory-sync-refresh` (execution) → adapter wraps `syncMemory`.

---

## 11. Control plane

**Module:** `environment/control/middleware.js`
- `runWithMiddleware({projectPath, commandName, scope, reader, budget, commandFn})` — Wraps a command with attempt lifecycle, session snapshot publication, budget advisory. Returns `{result, attempt}`.

**Module:** `environment/control/query.js`
- `getOperatorStatus(projectPath)` — Snapshot of operator-facing state (flows + results + writing + kernel availability).
- `getAttemptHistory(projectPath, filters = {})` — Attempt records.

**Module:** `environment/control/capabilities.js`
- `getCapabilitiesSnapshot(projectPath)` — Current capability state (flows, domain packs, connectors available).
- `publishCapabilitiesSnapshot(projectPath, snapshot)` — Persist.
- `refreshCapabilitiesSnapshot(projectPath, reader)` — Recompute from kernel.

**Module:** `environment/control/session-snapshot.js`
- `getSessionSnapshot(projectPath)` — Current session state: operator, flows, exports, memory.
- `publishSessionSnapshot(projectPath, snapshot)` — Persist to `.vibe-science-environment/control/session.json`.
- `rebuildSessionSnapshot(projectPath, inputs = {})` — Rebuild from authoritative sources.

**Module:** `environment/control/attempts.js`
- `openAttempt(projectPath, input)`, `updateAttempt(projectPath, attemptId, patch)`, `listAttempts(projectPath, filters)` — Attempt ledger.

**Module:** `environment/control/decisions.js`
- `appendDecision(projectPath, decision)`, `listDecisions(projectPath, filters)` — Decision log.

**Module:** `environment/control/events.js`
- `appendEvent(projectPath, event)`, `listEvents(projectPath, filters)` — Event log.

**Module:** `environment/control/_io.js` (low-level; use directly only if a flow helper doesn't cover you)
- `resolveProjectRoot`, `resolveInside` — Path safety.
- `readJson`, `atomicWriteJson` — JSON I/O.
- `withLock` — Named file lock.
- `appendJsonl`, `readJsonl` — JSONL ledger I/O.
- `loadValidator(projectPath, schemaFile)` — Ajv validator loader. Validators are cached.
- `assertValid(validate, data, label)` — Throw or pass.
- `now()` — ISO timestamp.

**Locations:** `.vibe-science-environment/control/session.json`, `attempts.jsonl`, `decisions.jsonl`, `events.jsonl`.

---

## 12. Capability snapshot

The capability snapshot tracks which features are actually available in a
given project — e.g. is the kernel bridge available, is Obsidian
connector installed, is the omics domain pack present. Used by flows to
degrade honestly.

- `getCapabilitiesSnapshot(projectPath)` — Read.
- `publishCapabilitiesSnapshot(projectPath, snapshot)` — Write.
- `refreshCapabilitiesSnapshot(projectPath, reader)` — Rebuild using kernel reader.

Schema: `environment/schemas/capabilities-snapshot.schema.json`.

---

## 13. Connectors

**Module:** `environment/connectors/filesystem-export.js`
- `exportResultsBundle(projectPath, experimentId, options = {})` — Write results bundle to external filesystem target.
- `exportWritingPack(projectPath, options = {})` — Write writing pack to external filesystem target.
- Error: `ConnectorExportError`.

**Module:** `environment/connectors/obsidian-export.js`
- `exportMemoryMirror(projectPath, options = {})` — Write memory mirrors to Obsidian vault.
- Error: `ObsidianExportError`.
- (Phase 7 Wave 4 scheduled honest rename to `vault-target-export`.)

**Module:** `environment/connectors/manifest.js`
- Path helpers: `connectorManifestsDir`, `connectorsStateDir`, `connectorStateDir`, `connectorStatusPath`, `connectorRunLogPath`, `ensureConnectorStateDir`.
- Bundle check: `readInstalledBundles`, `isConnectorsCoreInstalled`.
- Manifest I/O: `listConnectorManifestFiles`, `readConnectorManifest`, `validateConnectorManifest`, `validateConnectorRunRecord`, `validateConnectorStatusRecord`.
- Logging: `appendConnectorRunRecord`, `listConnectorRunRecords`, `publishConnectorStatus`, `readConnectorStatus`.
- Path: `toProjectRelativePath(...segments)`.

**Module:** `environment/connectors/registry.js`
- `getConnectorRegistry(projectPath)` — All connectors from manifests.
- `getConnectorById(projectPath, connectorId)` — One connector definition.

**Module:** `environment/connectors/health.js`
- `recordConnectorRun(projectPath, connectorId, record)` — Log run.
- `getConnectorHealthOverview(projectPath, options)` — Aggregate status.
- `getConnectorHealth(projectPath, connectorId)` — One connector's health.

**Module:** `environment/connectors/target-root.js`
- `resolveExternalTargetRoot(projectPath, value, label)` — Validate + normalize external export path.

**Installed connectors** (`environment/connectors/manifests/*.json`):
- `filesystem-export.connector.json` — Exports results and writing packs. Forbids claim/citation/gate mutations.
- `obsidian-export.connector.json` — Exports memory mirrors to Obsidian. Forbids claim/citation/gate mutations.

---

## 14. Automations

**Module:** `environment/automation/runtime.js`
- `runAutomation(projectPath, automationId, options = {})` — Generic runner.
- `runWeeklyResearchDigest(projectPath, options = {})` — Weekly summary automation.
- `runStaleMemoryReminder(projectPath, options = {})` — Memory freshness check.
- `runExportWarningDigest(projectPath, options = {})` — Export alert summary.
- Error: `AutomationRuntimeError`.

**Module:** `environment/automation/definitions.js`
- `automationDefinitionsDir`, `automationRunsDir`, `automationArtifactsDir`, `automationRunLogPath` — Paths.
- `readInstalledBundles`, `isAutomationCoreInstalled` — Install check.
- `listAutomationDefinitionFiles`, `readAutomationDefinition`, `validateAutomationDefinition` — Definition I/O.
- `getAutomationRegistry(projectPath)` — All automations.
- `getAutomationById(projectPath, automationId)` — One automation.

**Module:** `environment/automation/artifacts.js`
- `resolveAutomationArtifactPath`, `writeAutomationArtifact` — Artifact I/O.
- `getAutomationOverview(projectPath, options)` — Inventory of runs + status.

**Module:** `environment/automation/builtin-plans.js`
- `buildAutomationPlan(projectPath, definition, context)` — Plan builder.

**Module:** `environment/automation/plan-render.js`
- `renderMarkdownArtifact({...})` — Format artifact as markdown.
- `buildMemoryIdempotencyKey(memory, timestamp)` — Dedup key.
- `memoryWarnings(memory)` — Extract warnings.
- Utilities: `formatIsoWeek`, `sanitizeFileSegment`, `cloneValue`.

**Module:** `environment/automation/run-log.js`
- `validateAutomationRunRecord`, `appendAutomationRunRecord`, `listAutomationRunRecords`, `buildAutomationRunId`, `findLatestRunForIdempotency`.

**Installed automations** (`environment/automation/definitions/*.json`):
- `weekly-research-digest.automation.json` — ISO-week idempotent weekly summary.
- `stale-memory-reminder.automation.json` — Memory freshness check.
- `export-warning-digest.automation.json` — Export alert summary.

---

## 15. Domain packs

**Module:** `environment/domain-packs/loader.js`
- `loadDomainPack(projectPath, packId)` — Load config + presets.
- `validateDomainConfig(projectPath, config, options)` — Schema validation.

**Module:** `environment/domain-packs/resolver.js`
- `resolveDomainAssumptions(projectPath, packId)` — Fetch assumptions.
- `resolveExperimentPresets(projectPath, packId)` — Fetch experiment field defaults.
- `resolveLiteratureSources(projectPath, packId)` — Fetch recommended databases.

**Module:** `environment/domain-packs/index.js`
- `listInstalledDomainPacks(projectPath)` — Enumerate.

**Installed packs:**
- `omics/pack.domain-pack.json` — Omics Research Pack. Declares: sequencing assumptions, assay-sensitive preprocessing defaults, batch-effect awareness, cell-count metadata. `forbiddenMutations` and `doesNotModify` rules are declared but **not yet enforced at runtime** (Phase 7 Wave 4 work: generic rule engine).

---

## 16. Kernel bridge projections

**Module:** `environment/lib/kernel-bridge.js`
- `resolveKernelReader({kernelRoot, timeoutMs, envPassthrough, projectPath} = {})` — Returns a reader with 8 projection methods, or a degraded stub if the kernel CLI is absent.
- `getKernelBridgeMeta(value)` — Extract `{dbAvailable, sourceMode, degradedReason}` metadata from reader.

**Reader projections** (each returns structured data; treat as unreliable if `sourceMode !== 'kernel-backed'`):

| Method | Input | Returns |
|--------|-------|---------|
| `listClaimHeads({projectPath, limit?})` | projectPath | Array of `{claimId, title, status, confidence, governanceProfile}` |
| `listUnresolvedClaims({projectPath})` | projectPath | Array of claims in DRAFT / DISPUTED / CHALLENGED state |
| `listCitationChecks({projectPath})` | projectPath | Array of `{citationId, claimId, verificationStatus, level, createdAt}` |
| `getProjectOverview({projectPath})` | projectPath | `{governanceProfile, totalClaims, totalCitations, ...}` |
| `listLiteratureSearches({projectPath})` | projectPath | Array of `{searchId, query, resultsCount, searchLayer, createdAt}` |
| `listObserverAlerts({projectPath})` | projectPath | Array of `{alertId, level, message, createdAt}` |
| `listGateChecks({projectPath})` | projectPath | Array of hook status records; `synthetic: false` from Phase 6.2+ |
| `getStateSnapshot({projectPath})` | projectPath | `{sequences, meta, ...}` — full kernel state for probes |

**Errors:** `KernelBridgeError`, `KernelBridgeUnavailableError`, `KernelBridgeContractMismatchError`, `KernelBridgeTimeoutError`.

**Reader metadata defaults:** `dbAvailable: false, sourceMode: 'degraded', degradedReason: <string>` when unavailable.

---

## 17. Schemas catalog

43 schemas live in `environment/schemas/*.schema.json`. Every write to
persistent state validates against one. Flow helpers call the relevant
validator internally; you only need to touch these directly when adding
new task kinds or building new adapters.

| Schema | Governs |
|--------|---------|
| `assembled-continuity-payload` | Output of context-assembly |
| `attempt-record` | One attempt in the control plane |
| `automation-definition` | One automation spec |
| `automation-run-record` | One automation run |
| `capabilities-snapshot` | Available flows/connectors/domain-packs |
| `connector-manifest` | One connector's definition |
| `connector-run-record` | One connector run |
| `connector-status` | One connector's health |
| `continuity-profile` | Operator mental model |
| `continuity-profile-history` | Profile change log entry |
| `costs-record` | Per-attempt cost tracking |
| `decision-record` | Operator decision entry |
| `domain-config` | Domain pack config |
| `domain-pack` | Domain pack definition |
| `escalation-record` | Escalation event |
| `event-record` | System event |
| `experiment-bundle-manifest` | Results bundle manifest |
| `experiment-flow-state` | Experiment flow state |
| `experiment-manifest` | Experiment definition |
| `experiment-register-input` | Input for `registerExperiment` |
| `export-alert-record` | Export alert entry |
| `export-record` | Export completion entry |
| `export-snapshot` | Export deliverable metadata |
| `external-review-record` | External R2 reviewer feedback |
| `flow-index` | Index of all flow states |
| `install-state` | Install + bundle state |
| `lane-policy` | Lane execution policy |
| `lane-run-record` | One lane invocation |
| `literature-flow-state` | Literature flow state |
| `literature-register-input` | Input for `registerPaper` |
| `memory-mark-record` | Memory annotation |
| `memory-sync-state` | Sync freshness |
| `operator-validation-artifact` | Saved validation artifact |
| `recovery-record` | Failure recovery action |
| `results-bundle-discover-input` | Input for `discoverBundlesByExperiment` |
| `router-session` | Router classifier state |
| `run-queue-record` | Queue entry |
| `schema-validation-record` | Schema validation history entry |
| `session-digest` | Exported session digest |
| `session-digest-review-input` | Input for `reviewSessionDigest` |
| `session-snapshot` | Current session state |
| `task-registry-entry` | Task kind definition |
| `writing-export-finalize-input` | Input for `finalizeExportDeliverable` |

---

## 18. Command contracts

12 markdown files in `commands/`. Each defines the agent-facing contract
for a `/slash-command`. Agents don't need these at runtime — they're the
spec, and the agent calls the underlying helper directly.

| Command | Argument hints | Agent action |
|---------|----------------|--------------|
| `/flow-status` | (none) | Call `getOperatorStatus(projectPath)` |
| `/sync-memory` | `--overview` | Call `syncMemory(projectPath, options)` |
| `/orchestrator-status` | (none) | Call `runOrchestratorStatus(args)` |
| `/flow-experiment` | `--register`, `--update <EXP-id>`, `--blockers`, `--list` | Call `registerExperiment` / `updateExperiment` / `surfaceBlockers` / `listExperiments` |
| `/flow-literature` | `--register`, `--list`, `--link-claim`, `--gaps` | Call `registerPaper` / `listPapers` / `linkPaperToClaim` / `surfaceGaps` |
| `/flow-results` | `--package <EXP-id>`, `--list`, `--discover`, `--export` | Call `packageExperimentResults` / `discoverBundlesByExperiment` / connector export |
| `/flow-writing` | `--handoff <C-id>`, `--advisor-pack`, `--rebuttal-pack`, `--finalize` | Call `buildWritingHandoff` / `buildAdvisorPack` / `buildRebuttalPack` / `finalizeExportDeliverable` |
| `/orchestrator-run` | `<objective>`, `--mode` | Call `routeOrchestratorObjective(projectPath, {objective, mode})` |
| `/automation-status` | (none) | Call `getAutomationOverview(projectPath)` |
| `/export-warning-digest` | (none) | Call `runExportWarningDigest(projectPath)` |
| `/stale-memory-reminder` | (none) | Call `runStaleMemoryReminder(projectPath)` |
| `/weekly-digest` | (none) | Call `runWeeklyResearchDigest(projectPath)` |

---

## 19. CLI dispatcher + env vars

**`bin/vre` subcommands (4 direct entries):**
- `init` — Bootstrap state tree, verify kernel wiring, print next-steps.
- `flow-status` → `environment/control/query.js:getOperatorStatus`.
- `sync-memory` → `environment/memory/sync.js:syncMemory`.
- `orchestrator-status` → `environment/orchestrator/runtime.js:runOrchestratorStatus`.

**Exported from `bin/vre`:** `DISPATCH_TABLE` (frozen), `resolveRepoRoot`, `resolveKernelRoot`, `resolveDefaultReader`, `parseCommandFrontmatter`, `main`.

**Environment variables:**

| Variable | Purpose |
|----------|---------|
| `VRE_KERNEL_PATH` | Explicit path to sibling `vibe-science` (overrides auto-discovery) |
| `VRE_VERBOSE` | `1` → per-command `kernel-bridge active\|degraded` on stderr |
| `VRE_BUDGET_MAX_USD` | Session hard-stop spend limit (middleware enforces) |
| `VRE_BUDGET_ESTIMATED_COST_USD` | Advisory threshold (warning, not block) |
| `VRE_CLAUDE_CLI` | Override path to `claude` CLI (Windows: use `claude.cmd`) |
| `VRE_CODEX_CLI` | Override path to `codex` CLI (Windows: use `codex.cmd`) |
| `VRE_REVIEW_EVIDENCE_MODE` | Test override for review-lane evidence mode |
| `VRE_FOREIGN_SECRET` | Reserved external credential |
| `VRE_PRIVATE_TOKEN` | Reserved private token |
| `ANTHROPIC_API_KEY` | Passed through to claude-cli executor |
| `OPENAI_API_KEY` | Passed through to codex-cli executor |
| `CLAUDE_CONFIG_DIR` | Passed through to claude-cli |
| `PATH` | System (for CLI discovery) |

---

## 20. Appendix — file-by-file map

If you've been given a file path and need to know what's in it, this
table goes in the reverse direction.

| File | What it exports / declares |
|------|---------------------------|
| `bin/vre` | CLI dispatcher with init + 3 subcommands; helpers exported |
| `CLAUDE.md` | Project-level Claude Code context (loads the skill) |
| `environment/flows/experiment.js` | `registerExperiment`, `updateExperiment`, `listExperiments`, `surfaceBlockers` |
| `environment/flows/literature.js` | `registerPaper`, `listPapers`, `surfaceGaps`, `linkPaperToClaim` + errors |
| `environment/flows/results.js` | `packageExperimentResults` + errors |
| `environment/flows/results-discovery.js` | `discoverBundlesByExperiment`, `getResultsOverview` |
| `environment/flows/results-render.js` | bundle + warning rendering helpers |
| `environment/flows/session-digest.js` | `exportSessionDigest` + `SessionDigestError` |
| `environment/flows/session-digest-review.js` | `reviewSessionDigest` + `SessionDigestReviewError` |
| `environment/flows/writing.js` | `buildWritingHandoff`, `finalizeExportDeliverable` + errors |
| `environment/flows/writing-overview.js` | `getWritingOverview`, `getWritingSignalSummary` |
| `environment/flows/writing-packs.js` | `buildAdvisorPack`, `buildRebuttalPack` |
| `environment/flows/writing-render.js` | `renderClaimBackedSeed` |
| `environment/flows/writing-pack-render.js` | advisor/rebuttal pack rendering helpers |
| `environment/orchestrator/runtime.js` | `buildOrchestratorShellStatus`, `runOrchestratorObjective`, `runOrchestratorStatus` |
| `environment/orchestrator/execution-lane.js` | `runExecutionLane` |
| `environment/orchestrator/review-lane.js` | `runReviewLane` |
| `environment/orchestrator/queue.js` | Queue CRUD + introspection helpers |
| `environment/orchestrator/task-registry.js` | Registry load + validation |
| `environment/orchestrator/task-adapters.js` | Adapter map (7 task kinds) |
| `environment/orchestrator/router.js` | Objective classification + routing |
| `environment/orchestrator/state.js` | State factories + read/write + bootstrap |
| `environment/orchestrator/ledgers.js` | Lane run / recovery / escalation / external review ledgers |
| `environment/orchestrator/recovery.js` | `getDefaultRecoveryPolicy` |
| `environment/orchestrator/continuity-profile.js` | Profile load + proposal + apply/forget |
| `environment/orchestrator/context-assembly.js` | `assembleContinuityContext`, `formatContinuityForPrompt` |
| `environment/orchestrator/recall-adapters.js` | Kernel recall hit collection |
| `environment/orchestrator/provider-gateway.js` | `selectLaneBinding`, `invokeLaneBinding` |
| `environment/orchestrator/executors/claude-cli.js` | Claude CLI executor |
| `environment/orchestrator/executors/codex-cli.js` | Codex CLI executors (fake + real) |
| `environment/orchestrator/executors/local-subprocess.js` | Local subprocess executor |
| `environment/memory/sync.js` | `syncMemory` + mirror renderers |
| `environment/memory/marks.js` | Memory marks index + retrieval |
| `environment/memory/status.js` | Memory freshness check |
| `environment/control/middleware.js` | `runWithMiddleware` |
| `environment/control/query.js` | `getOperatorStatus`, `getAttemptHistory` |
| `environment/control/capabilities.js` | Capability snapshot CRUD |
| `environment/control/session-snapshot.js` | Session snapshot CRUD |
| `environment/control/attempts.js` | Attempt CRUD |
| `environment/control/decisions.js` | Decision log |
| `environment/control/events.js` | Event log |
| `environment/control/_io.js` | Low-level JSON/JSONL I/O, locks, validator cache |
| `environment/connectors/filesystem-export.js` | Filesystem export helpers |
| `environment/connectors/obsidian-export.js` | Obsidian mirror export |
| `environment/connectors/manifest.js` | Connector manifest + state I/O |
| `environment/connectors/registry.js` | Connector registry loader |
| `environment/connectors/health.js` | Connector health aggregation |
| `environment/connectors/target-root.js` | External target root resolver |
| `environment/automation/runtime.js` | Automation runners |
| `environment/automation/definitions.js` | Automation registry + definitions I/O |
| `environment/automation/artifacts.js` | Automation artifact writer + overview |
| `environment/automation/builtin-plans.js` | `buildAutomationPlan` |
| `environment/automation/plan-render.js` | Automation artifact rendering |
| `environment/automation/run-log.js` | Automation run log CRUD |
| `environment/domain-packs/loader.js` | Domain pack loader |
| `environment/domain-packs/resolver.js` | Domain pack resolution helpers |
| `environment/domain-packs/index.js` | `listInstalledDomainPacks` |
| `environment/lib/export-snapshot.js` | Export snapshot builder + validator + writer |
| `environment/lib/export-records.js` | Export record + alert builders + appenders |
| `environment/lib/export-eligibility.js` | `exportEligibility` + reason codes |
| `environment/lib/flow-state.js` | Flow index + flow state CRUD |
| `environment/lib/manifest.js` | Manifest CRUD (experiment) + errors |
| `environment/lib/bundle-manifest.js` | Bundle manifest builder + validator + writer |
| `environment/lib/kernel-bridge.js` | `resolveKernelReader` + 8 projections + errors |
| `environment/lib/session-metrics.js` | Metrics accumulator factory |
| `environment/lib/token-counter.js` | `countTokens` |

---

## Troubleshooting quick table

| Symptom | Where to look |
|---------|---------------|
| Claim promotion blocked | Plugin PreToolUse hook — fill `confounder_status`, invoke R2 via review-lane |
| Experiment won't register | `environment/lib/manifest.js` error taxonomy (already-exists, validation, transition) |
| Export snapshot fails | `ExportSnapshotAlreadyExistsError` = snapshot already persisted; use new `snapshotId` |
| `finalizeExportDeliverable` fails "already exists" | Deliverable already on disk; fail-closed policy, use a different `deliverableType` or clean the deliverable manually |
| `kernel: degraded` | `VRE_KERNEL_PATH` unset or points at a missing kernel; auto-discovery didn't find a sibling checkout |
| Task not routing | Check `findByRouterKeyword` in `task-registry.js`; unknown keywords → no match → escalate |
| Lane run stuck `waiting-review` | Check `review-lane.js` — probably binding missing or provider-cli unavailable |
| Budget blocked | `VRE_BUDGET_MAX_USD` set too low; middleware enforces hard stop |
| Memory markdown stale | Run `syncMemory` or `node bin/vre sync-memory` |

---

## When in doubt

Default to calling the documented helper, not the low-level `lib/` path.
The flow helpers wrap validation, atomic writes, error taxonomy, and
observability — using them is cheaper than reinventing.
