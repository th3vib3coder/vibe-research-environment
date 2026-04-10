import path from 'node:path';

import {
  assertValid,
  loadValidator,
  now,
} from '../control/_io.js';
import { listAttempts } from '../control/attempts.js';
import { getCapabilitiesSnapshot } from '../control/capabilities.js';
import { listDecisions } from '../control/decisions.js';
import { getSessionSnapshot } from '../control/session-snapshot.js';
import { getAutomationOverview } from '../automation/artifacts.js';
import { getConnectorHealthOverview } from '../connectors/health.js';
import { getDomainPackOverview } from '../domain-packs/resolver.js';
import { getResultsOverview } from '../flows/results-discovery.js';
import { getWritingOverview } from '../flows/writing-overview.js';
import { countTokens } from '../lib/token-counter.js';
import { getMemorySyncState } from '../memory/sync.js';
import { buildDefaultContinuityProfile, readContinuityProfile } from './state.js';
import { getOrchestratorStatus } from './query.js';
import { collectRecallHits } from './recall-adapters.js';

const ASSEMBLED_SCHEMA = 'assembled-continuity-payload.schema.json';
const ASSEMBLY_CACHE = new Map();
const MAX_CACHE_ENTRIES = 100;
const MODES = new Set(['profile', 'query', 'full']);
const STALE_SYNC_AFTER_MS = 24 * 60 * 60 * 1000;
const DEDUP_WHITESPACE = /\s+/gu;

function cloneValue(value) {
  return globalThis.structuredClone
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function normalizeText(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value
    .trim()
    .replace(DEDUP_WHITESPACE, ' ')
    .toLowerCase();
}

function normalizeMode(mode) {
  if (!MODES.has(mode)) {
    throw new Error(`Unsupported continuity assembly mode: ${mode}`);
  }

  return mode;
}

function normalizeNonNegativeInteger(value, label) {
  if (value == null) {
    return null;
  }
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative integer when provided.`);
  }
  return value;
}

function buildCacheKey(projectPath, options) {
  return [
    path.resolve(projectPath),
    options.mode,
    options.laneId ?? '',
    options.threadId ?? '',
    options.queueTaskId ?? '',
    normalizeText(options.queryText ?? ''),
    options.maxTokens ?? '',
    options.limit ?? '',
  ].join('::');
}

function getCachedPayload(cacheKey) {
  const cached = ASSEMBLY_CACHE.get(cacheKey);
  if (!cached) {
    return null;
  }

  ASSEMBLY_CACHE.delete(cacheKey);
  ASSEMBLY_CACHE.set(cacheKey, cached);
  return cloneValue(cached);
}

function setCachedPayload(cacheKey, payload) {
  if (ASSEMBLY_CACHE.has(cacheKey)) {
    ASSEMBLY_CACHE.delete(cacheKey);
  }
  ASSEMBLY_CACHE.set(cacheKey, cloneValue(payload));

  while (ASSEMBLY_CACHE.size > MAX_CACHE_ENTRIES) {
    const oldestKey = ASSEMBLY_CACHE.keys().next().value;
    ASSEMBLY_CACHE.delete(oldestKey);
  }
}

function uniqueStrings(values = []) {
  const filtered = values.filter((value) => typeof value === 'string' && value.trim() !== '');
  return [...new Set(filtered)];
}

function parseTimestamp(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function summarizeCapabilities(snapshot) {
  return {
    kernelDbAvailable: Boolean(snapshot?.kernel?.dbAvailable),
    projections: Object.entries(snapshot?.kernel?.projections ?? {})
      .filter(([, enabled]) => enabled === true)
      .map(([name]) => name)
      .sort(),
    advanced: Object.entries(snapshot?.kernel?.advanced ?? {})
      .filter(([, enabled]) => enabled === true)
      .map(([name]) => name)
      .sort(),
    installedBundles: cloneValue(snapshot?.install?.bundles ?? []),
  };
}

function summarizeAttempts(records) {
  return records.slice(0, 3).map((record) => ({
    attemptId: record.attemptId,
    scope: record.scope,
    status: record.status,
    targetId: record.targetId,
    summary: record.summary,
    errorCode: record.errorCode,
    lastHeartbeatAt: record.lastHeartbeatAt ?? record.startedAt ?? null,
  }));
}

function summarizeDecisions(records) {
  return records.slice(0, 3).map((record) => ({
    decisionId: record.decisionId,
    flow: record.flow,
    targetId: record.targetId,
    kind: record.kind,
    reason: record.reason,
    recordedAt: record.recordedAt ?? null,
  }));
}

function buildBlockers({
  sessionSnapshot,
  orchestratorStatus,
}) {
  const blockers = [];

  for (const blocker of sessionSnapshot?.blockers ?? []) {
    if (typeof blocker === 'string' && blocker.trim() !== '') {
      blockers.push(blocker);
    }
  }

  for (const task of orchestratorStatus?.queue?.blockedTasks ?? []) {
    for (const reason of task.blockingReasons ?? []) {
      blockers.push(reason);
    }
    if (typeof task.statusReason === 'string' && task.statusReason.trim() !== '') {
      blockers.push(task.statusReason);
    }
  }

  if (orchestratorStatus?.latestEscalation?.status === 'pending') {
    blockers.push(orchestratorStatus.latestEscalation.decisionNeeded);
  }

  return uniqueStrings(blockers);
}

function summarizeMemory(syncState) {
  const lastSyncAt = syncState?.lastSyncAt ?? null;
  const lastSyncTimestamp = parseTimestamp(lastSyncAt);
  return {
    status: syncState?.status ?? 'missing',
    kernelDbAvailable: syncState?.kernelDbAvailable ?? false,
    lastSyncAt,
    lastSuccessfulSyncAt: syncState?.lastSuccessfulSyncAt ?? null,
    degradedReason: syncState?.degradedReason ?? null,
    mirrorCount: Array.isArray(syncState?.mirrors) ? syncState.mirrors.length : 0,
    isStale:
      lastSyncTimestamp != null && Date.now() - lastSyncTimestamp > STALE_SYNC_AFTER_MS,
  };
}

function summarizeConnectors(overview) {
  const connectors = overview?.connectors ?? [];
  return {
    total: overview?.totalConnectors ?? connectors.length,
    degraded: connectors.filter((entry) => entry.healthStatus === 'degraded').length,
    unavailable: connectors.filter((entry) => entry.healthStatus === 'unavailable').length,
    latestFailures: connectors
      .filter((entry) => typeof entry.failureMessage === 'string' && entry.failureMessage.trim() !== '')
      .slice(0, 3)
      .map((entry) => ({
        connectorId: entry.connectorId,
        healthStatus: entry.healthStatus,
        failureMessage: entry.failureMessage,
      })),
  };
}

function summarizeAutomations(overview) {
  const automations = overview?.automations ?? [];
  return {
    total: overview?.totalAutomations ?? automations.length,
    blocked: automations.filter((entry) => entry.status === 'blocked').length,
    degraded: automations.filter((entry) => entry.status === 'degraded').length,
    latestRuns: automations.slice(0, 3).map((entry) => ({
      automationId: entry.automationId,
      status: entry.status,
      lastRunAt: entry.lastRunAt,
      nextDueAt: entry.nextDueAt,
    })),
  };
}

function summarizeDomain(overview) {
  return {
    runtimeInstalled: Boolean(overview?.runtimeInstalled),
    activePackId: overview?.activePackId ?? null,
    displayName: overview?.displayName ?? null,
    configState: overview?.configState ?? null,
    advisoryHints: cloneValue((overview?.advisoryHints ?? []).slice(0, 3)),
  };
}

function summarizeWritingSignals(overview) {
  return {
    totalAlerts: overview?.totalAlerts ?? 0,
    totalAdvisorPacks: overview?.totalAdvisorPacks ?? 0,
    totalRebuttalPacks: overview?.totalRebuttalPacks ?? 0,
    latestPackIds: [
      ...(overview?.advisorPacks ?? []).slice(0, 1).map((entry) => entry.packId),
      ...(overview?.rebuttalPacks ?? []).slice(0, 1).map((entry) => entry.packId),
    ],
  };
}

function summarizeResultsSignals(overview) {
  return {
    totalBundles: overview?.totalBundles ?? 0,
    totalSessionDigests: overview?.totalSessionDigests ?? 0,
    latestExperimentIds: (overview?.bundles ?? []).slice(0, 3).map((entry) => entry.experimentId),
  };
}

function summarizeQueue(orchestratorStatus) {
  const queue = orchestratorStatus?.queue ?? {};
  return {
    total: queue.total ?? 0,
    ready: queue.byDerivedStatus?.ready ?? 0,
    blocked: queue.byDerivedStatus?.blocked ?? 0,
    active: queue.byDerivedStatus?.active ?? 0,
    terminal: ['completed', 'failed', 'cancelled', 'escalated']
      .reduce((sum, status) => sum + (queue.byDerivedStatus?.[status] ?? 0), 0),
    topReadyTaskId: queue.readyTasks?.[0]?.taskId ?? null,
    topBlockedTaskId: queue.blockedTasks?.[0]?.taskId ?? null,
  };
}

function summarizeEscalation(orchestratorStatus) {
  const latest = orchestratorStatus?.latestEscalation;
  return {
    status: latest?.status ?? orchestratorStatus?.routerSession?.escalationState?.status ?? 'none',
    pendingEscalationId:
      latest?.status === 'pending'
        ? latest.escalationId
        : orchestratorStatus?.routerSession?.escalationState?.pendingEscalationId ?? null,
    latest: latest == null
      ? null
      : {
          escalationId: latest.escalationId,
          taskId: latest.taskId,
          triggerKind: latest.triggerKind,
          decisionNeeded: latest.decisionNeeded,
          recordedAt: latest.recordedAt,
        },
  };
}

function summarizeRecovery(orchestratorStatus) {
  const latest = orchestratorStatus?.latestRecovery;
  return latest == null
    ? null
    : {
        recoveryId: latest.recoveryId,
        taskId: latest.taskId,
        failureClass: latest.failureClass,
        recoveryAction: latest.recoveryAction,
        result: latest.result,
        cooldownUntil: latest.cooldownUntil,
        recordedAt: latest.recordedAt,
      };
}

function buildDynamicContextPayload({
  orchestratorStatus,
  sessionSnapshot,
  capabilitiesSnapshot,
  attempts,
  decisions,
  memorySyncState,
  connectorOverview,
  automationOverview,
  domainOverview,
  writingOverview,
  resultsOverview,
  queueTaskId,
  laneId,
  threadId,
}) {
  const routerSession = orchestratorStatus?.routerSession;
  return {
    objective: routerSession?.objective ?? sessionSnapshot?.nextActions?.[0] ?? null,
    currentMode: routerSession?.currentMode ?? null,
    activeThreadId: threadId ?? routerSession?.activeThreadId ?? null,
    laneId: laneId ?? null,
    queueFocusTaskId: queueTaskId ?? routerSession?.queueFocusTaskId ?? null,
    currentTarget: cloneValue(routerSession?.currentTarget ?? null),
    session: {
      activeFlow: sessionSnapshot?.activeFlow ?? null,
      currentStage: sessionSnapshot?.currentStage ?? null,
      lastCommand: sessionSnapshot?.lastCommand ?? null,
      lastAttemptId: sessionSnapshot?.lastAttemptId ?? null,
      nextActions: cloneValue((sessionSnapshot?.nextActions ?? []).slice(0, 3)),
    },
    blockers: buildBlockers({
      sessionSnapshot,
      orchestratorStatus,
    }),
    queue: summarizeQueue(orchestratorStatus),
    escalations: summarizeEscalation(orchestratorStatus),
    recovery: summarizeRecovery(orchestratorStatus),
    memory: summarizeMemory(memorySyncState),
    domain: summarizeDomain(domainOverview),
    capabilities: summarizeCapabilities(capabilitiesSnapshot),
    connectors: summarizeConnectors(connectorOverview),
    automations: summarizeAutomations(automationOverview),
    writingSignals: summarizeWritingSignals(writingOverview),
    resultsSignals: summarizeResultsSignals(resultsOverview),
    recentAttempts: summarizeAttempts(attempts),
    recentDecisions: summarizeDecisions(decisions),
  };
}

function buildCompactDynamicContext(dynamicContext) {
  return {
    objective: dynamicContext.objective,
    currentMode: dynamicContext.currentMode,
    activeThreadId: dynamicContext.activeThreadId,
    laneId: dynamicContext.laneId,
    queueFocusTaskId: dynamicContext.queueFocusTaskId,
    currentTarget: cloneValue(dynamicContext.currentTarget ?? null),
    session: cloneValue(dynamicContext.session ?? null),
    blockers: cloneValue(dynamicContext.blockers ?? []),
    queue: cloneValue(dynamicContext.queue ?? null),
    escalations: cloneValue(dynamicContext.escalations ?? null),
    recovery: cloneValue(dynamicContext.recovery ?? null),
    memory: cloneValue(dynamicContext.memory ?? null),
    domain: cloneValue(dynamicContext.domain ?? null),
    connectors: {
      total: dynamicContext.connectors?.total ?? 0,
      degraded: dynamicContext.connectors?.degraded ?? 0,
      unavailable: dynamicContext.connectors?.unavailable ?? 0,
    },
    automations: {
      total: dynamicContext.automations?.total ?? 0,
      blocked: dynamicContext.automations?.blocked ?? 0,
      degraded: dynamicContext.automations?.degraded ?? 0,
    },
    writingSignals: cloneValue(dynamicContext.writingSignals ?? null),
    resultsSignals: cloneValue(dynamicContext.resultsSignals ?? null),
  };
}

function buildMinimalDynamicContext(dynamicContext) {
  return {
    objective: dynamicContext.objective,
    currentMode: dynamicContext.currentMode,
    queueFocusTaskId: dynamicContext.queueFocusTaskId,
    blockers: cloneValue(dynamicContext.blockers ?? []),
    queue: cloneValue(dynamicContext.queue ?? null),
    escalations: cloneValue(dynamicContext.escalations ?? null),
    recovery: cloneValue(dynamicContext.recovery ?? null),
    memory: cloneValue(dynamicContext.memory ?? null),
  };
}

function formatStableProfileLines(stableProfile) {
  const lines = [];
  if (!stableProfile || Object.keys(stableProfile).length === 0) {
    return lines;
  }

  lines.push(`- Default autonomy: ${stableProfile.operator?.defaultAutonomyPreference ?? 'unknown'}`);
  lines.push(`- Report verbosity: ${stableProfile.operator?.reportVerbosity ?? 'unknown'}`);
  lines.push(`- Review strictness: ${stableProfile.operator?.reviewStrictness ?? 'unknown'}`);

  if ((stableProfile.operator?.quietHoursLocal ?? []).length > 0) {
    lines.push(`- Quiet hours: ${stableProfile.operator.quietHoursLocal.join(', ')}`);
  }
  if (stableProfile.project?.primaryAudience) {
    lines.push(`- Primary audience: ${stableProfile.project.primaryAudience}`);
  }
  if ((stableProfile.project?.defaultReportKinds ?? []).length > 0) {
    lines.push(`- Default report kinds: ${stableProfile.project.defaultReportKinds.join(', ')}`);
  }
  if ((stableProfile.runtime?.preferredLaneRoles ?? []).length > 0) {
    lines.push(`- Preferred lane roles: ${stableProfile.runtime.preferredLaneRoles.join(', ')}`);
  }
  lines.push(`- Default API fallback: ${stableProfile.runtime?.defaultAllowApiFallback === true ? 'allowed' : 'disabled'}`);

  return lines;
}

function formatDynamicContextLines(dynamicContext) {
  const lines = [];
  if (!dynamicContext || Object.keys(dynamicContext).length === 0) {
    return lines;
  }

  if (dynamicContext.objective) {
    lines.push(`- Objective: ${dynamicContext.objective}`);
  }
  if (dynamicContext.currentMode) {
    lines.push(`- Current mode: ${dynamicContext.currentMode}`);
  }
  if (dynamicContext.session?.activeFlow || dynamicContext.session?.currentStage) {
    lines.push(
      `- Flow/stage: ${dynamicContext.session?.activeFlow ?? 'none'} / ${dynamicContext.session?.currentStage ?? 'none'}`,
    );
  }
  if ((dynamicContext.blockers ?? []).length > 0) {
    for (const blocker of dynamicContext.blockers.slice(0, 4)) {
      lines.push(`- Blocker: ${blocker}`);
    }
  }
  if (dynamicContext.queue) {
    lines.push(
      `- Queue: total=${dynamicContext.queue.total ?? 0}, ready=${dynamicContext.queue.ready ?? 0}, blocked=${dynamicContext.queue.blocked ?? 0}, active=${dynamicContext.queue.active ?? 0}`,
    );
  }
  if (dynamicContext.escalations?.latest?.decisionNeeded) {
    lines.push(`- Pending escalation: ${dynamicContext.escalations.latest.decisionNeeded}`);
  }
  if (dynamicContext.recovery?.failureClass || dynamicContext.recovery?.recoveryAction) {
    lines.push(
      `- Latest recovery: ${dynamicContext.recovery?.failureClass ?? 'unknown'} -> ${dynamicContext.recovery?.recoveryAction ?? 'unknown'}`,
    );
  }
  if (dynamicContext.memory?.status) {
    lines.push(
      `- Memory sync: ${dynamicContext.memory.status}${dynamicContext.memory.isStale ? ' (stale)' : ''}`,
    );
  }
  if (dynamicContext.domain?.activePackId || dynamicContext.domain?.configState) {
    lines.push(
      `- Domain pack: ${dynamicContext.domain?.activePackId ?? 'none'} (${dynamicContext.domain?.configState ?? 'unknown'})`,
    );
  }
  if ((dynamicContext.recentAttempts ?? []).length > 0) {
    for (const attempt of dynamicContext.recentAttempts.slice(0, 2)) {
      lines.push(`- Recent attempt: ${attempt.status} ${attempt.scope ?? ''}`.trim());
    }
  }
  if ((dynamicContext.recentDecisions ?? []).length > 0) {
    for (const decision of dynamicContext.recentDecisions.slice(0, 2)) {
      lines.push(`- Recent decision: ${decision.kind} (${decision.flow})`);
    }
  }

  return lines;
}

function formatRecallHitLine(hit, options = {}) {
  const sourceLabel = options.includeSourceRefs === false
    ? `[${hit.sourceType}]`
    : `[${hit.sourceType}] ${hit.sourceRef}`;
  const title = hit.title ? `${hit.title}: ` : '';
  const staleSuffix = hit.isStale ? ' [stale]' : '';
  return `- ${sourceLabel} ${title}${hit.summary}${staleSuffix}`;
}

function extractDedupTexts(stableProfile, dynamicContext) {
  const keys = new Set();

  for (const line of formatStableProfileLines(stableProfile)) {
    keys.add(normalizeText(line));
  }
  for (const line of formatDynamicContextLines(dynamicContext)) {
    keys.add(normalizeText(line));
  }

  return keys;
}

function deduplicateRecallHits(stableProfile, dynamicContext, retrievalHits) {
  const seen = extractDedupTexts(stableProfile, dynamicContext);
  const deduped = [];
  let dedupCount = 0;

  for (const hit of retrievalHits) {
    const key = normalizeText(`${hit.title ?? ''} ${hit.summary}`);
    if (key === '' || !seen.has(key)) {
      deduped.push(hit);
      if (key !== '') {
        seen.add(key);
      }
      continue;
    }

    dedupCount += 1;
  }

  return {
    hits: deduped,
    dedupCount,
  };
}

function createSourceRefs(retrievalHits) {
  const seen = new Set();
  const refs = [];

  for (const hit of retrievalHits) {
    const key = `${hit.sourceType}::${hit.sourceRef}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    refs.push({
      sourceType: hit.sourceType,
      label: hit.title ?? hit.sourceType,
      ref: hit.sourceRef,
      recordedAt: hit.recordedAt ?? null,
    });
  }

  return refs;
}

async function countPayloadTokens(payload, options = {}) {
  const formatted = formatContinuityForPrompt(payload, options.formatOptions);
  const tokenResult = await countTokens(formatted, options.tokenOptions);
  return {
    totalTokens: tokenResult.count,
    formatted,
  };
}

async function applyBudget(projectPath, payload, options = {}) {
  const maxTokens = normalizeNonNegativeInteger(options.maxTokens, 'maxTokens');
  let working = cloneValue(payload);
  let compacted = false;
  let minimized = false;
  let recallTruncated = false;
  let dynamicCompacted = false;
  let tokenInfo = await countPayloadTokens(working, options);

  if (maxTokens == null) {
    working.totalTokens = tokenInfo.totalTokens;
    const validate = await loadValidator(projectPath, ASSEMBLED_SCHEMA);
    assertValid(validate, working, 'assembled continuity payload');
    return working;
  }

  while (
    tokenInfo.totalTokens > maxTokens &&
    Array.isArray(working.retrievalHits) &&
    working.retrievalHits.length > 0
  ) {
    working.retrievalHits = working.retrievalHits.slice(0, -1);
    working.sourceRefs = createSourceRefs(working.retrievalHits);
    working.truncated = true;
    recallTruncated = true;
    tokenInfo = await countPayloadTokens(working, options);
  }

  if (tokenInfo.totalTokens > maxTokens && !compacted) {
    working.dynamicContext = buildCompactDynamicContext(working.dynamicContext);
    compacted = true;
    working.truncated = true;
    dynamicCompacted = true;
    tokenInfo = await countPayloadTokens(working, options);
  }

  if (tokenInfo.totalTokens > maxTokens && !minimized) {
    working.dynamicContext = buildMinimalDynamicContext(working.dynamicContext);
    minimized = true;
    working.truncated = true;
    dynamicCompacted = true;
    tokenInfo = await countPayloadTokens(working, options);
  }

  if (working.truncated) {
    const truncationWarnings = [];
    if (recallTruncated) {
      truncationWarnings.push('Budget enforcement started by truncating recall hits first.');
    }
    if (dynamicCompacted) {
      truncationWarnings.push('Dynamic continuity detail was compacted after recall truncation.');
    }
    truncationWarnings.push('Continuity context was truncated to stay within the continuity sub-budget.');
    working.warnings = uniqueStrings([
      ...working.warnings,
      ...truncationWarnings,
    ]);
  }

  working.totalTokens = tokenInfo.totalTokens;
  const validate = await loadValidator(projectPath, ASSEMBLED_SCHEMA);
  assertValid(validate, working, 'assembled continuity payload');
  return working;
}

async function buildDynamicContext(projectPath, options, warnings) {
  async function safeLoad(label, fn, fallback) {
    try {
      return await fn();
    } catch (error) {
      warnings.push(`${label}: ${error.message}`);
      return fallback;
    }
  }

  const [
    orchestratorStatus,
    sessionSnapshot,
    capabilitiesSnapshot,
    attempts,
    decisions,
    memorySyncState,
    connectorOverview,
    automationOverview,
    domainOverview,
    writingOverview,
    resultsOverview,
  ] = await Promise.all([
    safeLoad('orchestrator status', () => getOrchestratorStatus(projectPath), null),
    safeLoad('session snapshot', () => getSessionSnapshot(projectPath), null),
    safeLoad('capabilities snapshot', () => getCapabilitiesSnapshot(projectPath), null),
    safeLoad('recent attempts', () => listAttempts(projectPath, { limit: 3 }), []),
    safeLoad('recent decisions', () => listDecisions(projectPath, { limit: 3 }), []),
    safeLoad('memory sync state', () => getMemorySyncState(projectPath), null),
    safeLoad('connector health', () => getConnectorHealthOverview(projectPath), { connectors: [], warnings: [] }),
    safeLoad('automation overview', () => getAutomationOverview(projectPath), { automations: [], warnings: [] }),
    safeLoad('domain pack overview', () => getDomainPackOverview(projectPath), null),
    safeLoad('writing overview', () => getWritingOverview(projectPath, {
      alertLimit: 2,
      packLimit: 1,
      exportLimit: 0,
      snapshotLimit: 0,
    }), { warnings: [] }),
    safeLoad('results overview', () => getResultsOverview(projectPath, {
      bundleLimit: 2,
      digestLimit: 1,
    }), { warnings: [] }),
  ]);

  warnings.push(...cloneValue(orchestratorStatus?.warnings ?? []));
  warnings.push(...cloneValue(memorySyncState?.warnings ?? []));
  warnings.push(...cloneValue(connectorOverview?.warnings ?? []));
  warnings.push(...cloneValue(automationOverview?.warnings ?? []));
  warnings.push(...cloneValue(domainOverview?.warnings ?? []));
  warnings.push(...cloneValue(writingOverview?.warnings ?? []));
  warnings.push(...cloneValue(resultsOverview?.warnings ?? []));

  return buildDynamicContextPayload({
    orchestratorStatus,
    sessionSnapshot,
    capabilitiesSnapshot,
    attempts,
    decisions,
    memorySyncState,
    connectorOverview,
    automationOverview,
    domainOverview,
    writingOverview,
    resultsOverview,
    queueTaskId: options.queueTaskId ?? null,
    laneId: options.laneId ?? null,
    threadId: options.threadId ?? null,
  });
}

export function clearContinuityAssemblyCache() {
  ASSEMBLY_CACHE.clear();
}

export async function assembleContinuityContext(projectPath, options = {}) {
  const mode = normalizeMode(options.mode ?? 'profile');
  const cacheKey = buildCacheKey(projectPath, {
    ...options,
    mode,
  });
  const useCache = options.disableCache === true ? false : options.useCache !== false;

  if (useCache) {
    const cached = getCachedPayload(cacheKey);
    if (cached) {
      return cached;
    }
  }

  const assembledAt = options.assembledAt ?? now();
  const warnings = [];
  const stableProfile = mode === 'query'
    ? {}
    : (await readContinuityProfile(projectPath)) ?? buildDefaultContinuityProfile();

  const dynamicContext = mode === 'query'
    ? {}
    : await buildDynamicContext(projectPath, options, warnings);

  let retrievalHits = [];
  if (mode === 'query' || mode === 'full') {
    const recall = await collectRecallHits(projectPath, {
      queryText: options.queryText ?? '',
      limit: options.limit ?? 10,
    });
    warnings.push(...recall.warnings);
    retrievalHits = recall.hits;
  }

  const dedup = deduplicateRecallHits(stableProfile, dynamicContext, retrievalHits);
  retrievalHits = dedup.hits;
  if (dedup.dedupCount > 0) {
    warnings.push(`Deduplicated ${dedup.dedupCount} overlapping continuity recall hit(s).`);
  }

  const payload = {
    schemaVersion: 'vibe-orch.assembled-continuity-payload.v1',
    stableProfile: cloneValue(stableProfile),
    dynamicContext: cloneValue(dynamicContext),
    retrievalHits: cloneValue(retrievalHits),
    sourceRefs: createSourceRefs(retrievalHits),
    warnings: uniqueStrings(warnings),
    totalTokens: 0,
    truncated: false,
    assembledAt,
  };

  const budgeted = await applyBudget(projectPath, payload, {
    maxTokens: options.maxTokens,
    tokenOptions: options.tokenOptions,
    formatOptions: options.formatOptions,
  });

  if (useCache) {
    setCachedPayload(cacheKey, budgeted);
  }

  return cloneValue(budgeted);
}

export function formatContinuityForPrompt(assembled, options = {}) {
  const sections = [];
  const stableLines = formatStableProfileLines(assembled?.stableProfile ?? {});
  const dynamicLines = formatDynamicContextLines(assembled?.dynamicContext ?? {});
  const recallLines = (assembled?.retrievalHits ?? []).map((hit) => formatRecallHitLine(hit, options));
  const warningLines = (assembled?.warnings ?? []).map((warning) => `- ${warning}`);

  if (stableLines.length > 0 || options.includeEmptySections === true) {
    sections.push(['## Stable Continuity Profile', ...(stableLines.length > 0 ? stableLines : ['- None'])].join('\n'));
  }

  if (dynamicLines.length > 0 || options.includeEmptySections === true) {
    sections.push(['## Dynamic Context', ...(dynamicLines.length > 0 ? dynamicLines : ['- None'])].join('\n'));
  }

  if (recallLines.length > 0 || options.includeEmptySections === true) {
    sections.push(['## Recall Hits', ...(recallLines.length > 0 ? recallLines : ['- None'])].join('\n'));
  }

  if (warningLines.length > 0 && options.includeWarnings !== false) {
    sections.push(['## Warnings', ...warningLines].join('\n'));
  }

  return sections.join('\n\n').trim();
}

export const INTERNALS = {
  buildCacheKey,
  buildCompactDynamicContext,
  buildDynamicContextPayload,
  buildMinimalDynamicContext,
  createSourceRefs,
  deduplicateRecallHits,
  extractDedupTexts,
  formatDynamicContextLines,
  formatStableProfileLines,
  getCacheSize() {
    return ASSEMBLY_CACHE.size;
  },
  normalizeMode,
  normalizeText,
  summarizeAttempts,
  summarizeDecisions,
  uniqueStrings,
};
