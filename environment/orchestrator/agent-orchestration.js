import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { access, mkdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import {
  atomicWriteJson,
  assertValid,
  loadValidator,
  now as ioNow,
  readJsonl,
  resolveInside,
  resolveProjectRoot,
} from '../control/_io.js';
import { generateCapabilityHandshake } from '../control/capability-handshake.js';
import { writeObjectiveDigest } from '../objectives/digest-writer.js';
import {
  appendObjectiveHandoff,
  objectiveEventsPath,
  objectiveHandoffsPath,
  readObjectiveHandoffs,
  readObjectiveRecord,
} from '../objectives/store.js';
import {
  appendObjectiveEvent,
  readResumeSnapshot,
  writeObjectiveResumeSnapshot,
} from '../objectives/resume-snapshot.js';
import { logGovernanceEventViaPlugin } from './governance-logger.js';
import { invokeLaneBinding, selectLaneBinding } from './provider-gateway.js';
import { readContinuityProfile, readLanePolicies } from './state.js';
import { getTaskEntry } from './task-registry.js';

const execFileAsync = promisify(execFile);
const R2_BRIDGE_TIMEOUT_MS = 15_000;

/**
 * Absolute filesystem path of the reviewed-role-runner.js child binary.
 * Phase 9 v1 default child command for reviewed subprocess dispatch:
 * agent-orchestration spawns `process.execPath` (current node) with this
 * runner script as argv[0] and `--envelope <path>` as the envelope arg.
 * Tests may override `request.spawn.command` and `request.spawn.argv`.
 */
export const REVIEWED_ROLE_RUNNER_PATH = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    'reviewed-role-runner.js',
);
const R2_BRIDGE_ENV_WHITELIST = Object.freeze([
  'PATH',
  'Path',
  'PATHEXT',
  'SystemRoot',
  'SYSTEMROOT',
  'TEMP',
  'TMP',
  'USERPROFILE',
  'VIBE_SCIENCE_DB_PATH',
]);

const ROLE_RUNTIME_MATRIX = Object.freeze({
  'lead-researcher': Object.freeze({
    roleId: 'lead-researcher',
    dispatchMode: 'inline-only',
    laneId: null,
    allowedTaskKinds: Object.freeze([]),
    executorClasses: Object.freeze([]),
    resultContract: 'next-action decision + persisted handoff/event writes',
    canMutateObjective: true,
    webRequired: false,
  }),
  'literature-mode': Object.freeze({
    roleId: 'literature-mode',
    dispatchMode: 'inline-only',
    laneId: null,
    allowedTaskKinds: Object.freeze([]),
    executorClasses: Object.freeze([]),
    resultContract: 'handoff + registered literature artifacts',
    canMutateObjective: false,
    webRequired: true,
  }),
  'experiment-agent': Object.freeze({
    roleId: 'experiment-agent',
    dispatchMode: 'queue-task',
    laneId: 'execution',
    allowedTaskKinds: Object.freeze(['experiment-flow-register']),
    executorClasses: Object.freeze(['codex-cli', 'claude-cli', 'local-subprocess']),
    resultContract: 'handoff + experiment/analysis artifacts',
    canMutateObjective: false,
    webRequired: false,
  }),
  'results-agent': Object.freeze({
    roleId: 'results-agent',
    dispatchMode: 'queue-task',
    laneId: 'execution',
    allowedTaskKinds: Object.freeze(['results-bundle-discover', 'writing-export-finalize']),
    executorClasses: Object.freeze(['codex-cli', 'claude-cli', 'local-subprocess']),
    resultContract: 'handoff + package/output artifacts',
    canMutateObjective: false,
    webRequired: false,
  }),
  'reviewer-2': Object.freeze({
    roleId: 'reviewer-2',
    dispatchMode: 'review-lane',
    laneId: 'review',
    allowedTaskKinds: Object.freeze(['session-digest-review']),
    executorClasses: Object.freeze(['codex-cli', 'claude-cli', 'local-subprocess']),
    resultContract: 'persisted r2-verdict + handoff reference',
    canMutateObjective: false,
    webRequired: false,
  }),
  'serendipity-mode': Object.freeze({
    roleId: 'serendipity-mode',
    dispatchMode: 'inline-only',
    laneId: null,
    allowedTaskKinds: Object.freeze([]),
    executorClasses: Object.freeze([]),
    resultContract: 'seed proposals only',
    canMutateObjective: false,
    webRequired: true,
  }),
  'continuity-agent': Object.freeze({
    roleId: 'continuity-agent',
    dispatchMode: 'queue-task-or-inline-only',
    laneId: 'execution',
    allowedTaskKinds: Object.freeze(['memory-sync-refresh']),
    executorClasses: Object.freeze(['codex-cli', 'claude-cli', 'local-subprocess']),
    resultContract: 'handoff + continuity evidence',
    canMutateObjective: false,
    webRequired: false,
  }),
});

const SUPPORTED_ROLE_IDS = Object.freeze(Object.keys(ROLE_RUNTIME_MATRIX));
export const REVIEWER2_GATE_ID = 'PROMOTION_REQUIRES_R2_REVIEW';
const REVIEWER2_VERDICTS = new Set(['ACCEPT', 'REJECT', 'DEFER']);
const REVIEW_REQUIRED_BLOCKER_CODES = new Set([
  'E_R2_REVIEW_PENDING',
  'E_STATE_CONFLICT',
  'E_HANDOFF_CONFLICT',
  'SEMANTIC_DRIFT_DETECTED',
]);
const AGENT_ORCHESTRATION_GOVERNANCE_SOURCE_COMPONENT = 'vre/orchestrator/agent-orchestration';
const CONTEXT_PRESSURE_THRESHOLD_NUMERATOR = 3;
const CONTEXT_PRESSURE_THRESHOLD_DENOMINATOR = 5;
const CONTEXT_PRESSURE_THRESHOLD_RATIO =
  CONTEXT_PRESSURE_THRESHOLD_NUMERATOR / CONTEXT_PRESSURE_THRESHOLD_DENOMINATOR;
const CONTEXT_PRESSURE_SAFE_BOUNDARY = 'pre-inline-turn';
const WEB_REQUIRING_ROLE_IDS = new Set(['literature-mode', 'serendipity-mode']);
const FORBIDDEN_TASK_STYLE_TRANSPORTS = new Set([
  'background-task',
  'cloud-task',
  'task-tool',
  'task-tool-background',
]);
const ENV_ALLOWLIST = new Set([
  'PATH',
  'HOME',
  'USERPROFILE',
  'SYSTEMROOT',
  'TEMP',
  'TMP',
  'VRE_ROOT',
  'PHASE9_OBJECTIVE_ID',
  'PHASE9_TASK_ID',
  'PHASE9_ENVELOPE_PATH',
]);
const DENY_REGEX = /^(CLAUDE_|ANTHROPIC_|SESSION_|VRE_SESSION_|SKILL_CACHE_)/u;
const REQUIRED_SURFACES = Object.freeze([
  'environment/orchestrator/provider-gateway.js',
  'environment/orchestrator/executors/codex-cli.js',
  'environment/orchestrator/executors/claude-cli.js',
  'environment/orchestrator/executors/local-subprocess.js',
  'environment/orchestrator/task-registry.js',
  'environment/orchestrator/review-lane.js',
  'environment/orchestrator/execution-lane.js',
]);

export class AgentOrchestrationError extends Error {
  constructor({ code, message, extra = {} }) {
    super(message);
    this.name = 'AgentOrchestrationError';
    this.code = code;
    this.extra = extra;
  }
}

function fail(code, message, extra = {}) {
  throw new AgentOrchestrationError({ code, message, extra });
}

function defaultR2BridgeScriptPath(projectRoot) {
  return path.join(
    path.dirname(projectRoot),
    'vibe-science',
    'plugin',
    'scripts',
    'r2-bridge-writer.js',
  );
}

function buildR2BridgeEnv(overrideEnv = {}) {
  const env = {};
  for (const key of R2_BRIDGE_ENV_WHITELIST) {
    if (process.env[key] !== undefined) {
      env[key] = process.env[key];
    }
  }
  return {
    ...env,
    ...overrideEnv,
  };
}

async function writeR2BridgeEvent(request, options = {}) {
  if (typeof options.writeR2Bridge === 'function') {
    return await options.writeR2Bridge(request);
  }

  const scriptPath = options.r2BridgeScriptPath ?? defaultR2BridgeScriptPath(request.projectRoot);
  try {
    await access(scriptPath);
  } catch {
    fail(
      'E_R2_BRIDGE_REQUIRED',
      'Reviewer-2 verdict was persisted in VRE but the plugin r2-bridge-writer.js surface is missing.',
      { scriptPath, eventId: request.eventId, claimId: request.claimId },
    );
  }

  const argv = [
    scriptPath,
    '--event-log',
    request.eventLogPath,
    '--event-id',
    request.eventId,
    '--session',
    request.sessionId,
    '--json',
  ];
  if (options.r2BridgeDbPath) {
    argv.push('--db-path', options.r2BridgeDbPath);
  }

  try {
    const result = await execFileAsync(process.execPath, argv, {
      cwd: path.dirname(path.dirname(path.dirname(scriptPath))),
      encoding: 'utf-8',
      env: buildR2BridgeEnv(options.r2BridgeEnv ?? {}),
      timeout: options.r2BridgeTimeoutMs ?? R2_BRIDGE_TIMEOUT_MS,
      windowsHide: true,
    });
    return JSON.parse(String(result.stdout || '{}'));
  } catch (error) {
    fail(
      'E_R2_BRIDGE_REQUIRED',
      'Reviewer-2 verdict could not be bridged into plugin claim_events; promotion must remain blocked.',
      {
        eventId: request.eventId,
        claimId: request.claimId,
        stderr: error?.stderr ? String(error.stderr).slice(0, 1000) : null,
        message: error?.message ?? null,
        scriptPath,
      },
    );
  }
}

function defaultAllowedActions(roleId) {
  switch (roleId) {
    case 'lead-researcher':
      return ['choose-next-global-action', 'write-objective-event', 'write-handoff'];
    case 'reviewer-2':
      return ['review-artifacts', 'return-r2-verdict'];
    case 'experiment-agent':
      return ['run-sanctioned-task', 'write-artifact', 'propose-handoff'];
    case 'results-agent':
      return ['package-artifacts', 'write-artifact', 'propose-handoff'];
    case 'continuity-agent':
      return ['refresh-memory', 'verify-resume-state', 'propose-handoff'];
    case 'literature-mode':
      return ['survey-web-inline', 'register-literature-artifact', 'propose-handoff'];
    case 'serendipity-mode':
      return ['survey-web-inline', 'surface-seed', 'propose-handoff'];
    default:
      return ['propose-handoff'];
  }
}

function toFiniteNumber(value) {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    return Number(value);
  }
  return Number.NaN;
}

function evaluateContextPressure(contextBudget) {
  if (contextBudget == null) {
    return null;
  }
  if (typeof contextBudget !== 'object' || Array.isArray(contextBudget)) {
    fail(
      'E_CONTEXT_BUDGET_INVALID',
      'contextBudget must provide usedTokens and modelLimitTokens for inline context-pressure checks.',
    );
  }

  const usedTokens = toFiniteNumber(contextBudget.usedTokens);
  const modelLimitTokens = toFiniteNumber(contextBudget.modelLimitTokens);
  if (!Number.isFinite(usedTokens) || usedTokens < 0) {
    fail('E_CONTEXT_BUDGET_INVALID', 'contextBudget.usedTokens must be a finite non-negative number.');
  }
  if (!Number.isFinite(modelLimitTokens) || modelLimitTokens <= 0) {
    fail('E_CONTEXT_BUDGET_INVALID', 'contextBudget.modelLimitTokens must be a finite positive number.');
  }

  const triggered =
    usedTokens * CONTEXT_PRESSURE_THRESHOLD_DENOMINATOR
      > modelLimitTokens * CONTEXT_PRESSURE_THRESHOLD_NUMERATOR;
  return {
    triggered,
    action: triggered ? 'compact-then-resume' : 'continue-inline',
    boundary: CONTEXT_PRESSURE_SAFE_BOUNDARY,
    usedTokens,
    modelLimitTokens,
    usedRatio: usedTokens / modelLimitTokens,
    thresholdRatio: CONTEXT_PRESSURE_THRESHOLD_RATIO,
  };
}

function requireString(value, label, code) {
  if (typeof value !== 'string' || value.trim() === '') {
    fail(code, `${label} must be a non-empty string.`);
  }
  return value.trim();
}

function isPathInside(baseDir, candidatePath) {
  const relativePath = path.relative(baseDir, candidatePath);
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

function toRepoRelative(projectRoot, targetPath) {
  return path.relative(projectRoot, targetPath).split(path.sep).join('/');
}

function collectPreCompactHandoffCandidates(request) {
  if (Array.isArray(request.preCompactHandoffs)) {
    return request.preCompactHandoffs;
  }
  if (request.preCompactHandoff != null) {
    return [request.preCompactHandoff];
  }
  return [];
}

function normalizePreCompactHandoff(roleId, request, candidate) {
  if (candidate == null || typeof candidate !== 'object' || Array.isArray(candidate)) {
    fail('E_PRE_COMPACT_HANDOFF_REQUIRED', 'preCompactHandoffs entries must be handoff objects.');
  }

  return {
    handoffId: typeof candidate.handoffId === 'string' && candidate.handoffId.trim() !== ''
      ? candidate.handoffId.trim()
      : undefined,
    fromAgentRole: typeof candidate.fromAgentRole === 'string' && candidate.fromAgentRole.trim() !== ''
      ? candidate.fromAgentRole.trim()
      : roleId,
    toAgentRole: typeof candidate.toAgentRole === 'string' && candidate.toAgentRole.trim() !== ''
      ? candidate.toAgentRole.trim()
      : 'lead-researcher',
    artifactPaths: Array.isArray(candidate.artifactPaths) ? [...candidate.artifactPaths] : [],
    summary: requireString(candidate.summary, 'preCompactHandoff.summary', 'E_PRE_COMPACT_HANDOFF_REQUIRED'),
    openBlockers: Array.isArray(candidate.openBlockers) ? [...candidate.openBlockers] : [],
    closesHandoffId: candidate.closesHandoffId ?? null,
    writerSession: typeof candidate.writerSession === 'string' && candidate.writerSession.trim() !== ''
      ? candidate.writerSession.trim()
      : requireString(
        request.generatedBySession,
        'generatedBySession',
        'E_PRE_COMPACT_HANDOFF_REQUIRED',
      ),
  };
}

function deriveOpenHandoffRecords(handoffs) {
  const closedIds = new Set(
    handoffs
      .map((entry) => entry.closesHandoffId)
      .filter((value) => typeof value === 'string' && value.trim() !== ''),
  );
  return handoffs.filter((entry) => !closedIds.has(entry.handoffId));
}

async function reloadPostCompactResume(projectRoot, objectiveId, options = {}) {
  const [
    handshake,
    activeObjective,
    allHandoffs,
    latestEvents,
    resumeSnapshot,
  ] = await Promise.all([
    (options.readCapabilityHandshake ?? generateCapabilityHandshake)(
      projectRoot,
      options.capabilityHandshakeOptions ?? {},
    ),
    readObjectiveRecord(projectRoot, objectiveId),
    readObjectiveHandoffs(projectRoot, objectiveId),
    readJsonl(objectiveEventsPath(projectRoot, objectiveId)),
    readResumeSnapshot(projectRoot, objectiveId),
  ]);

  return {
    source: 'durable-artifacts',
    handshake,
    activeObjective,
    openHandoffs: deriveOpenHandoffRecords(allHandoffs),
    latestEvents: latestEvents.slice(-25),
    resumeSnapshot,
  };
}

async function defaultTriggerCompact(payload) {
  return {
    status: 'compact-requested',
    action: 'compact-then-resume',
    objectiveId: payload.objectiveId,
    boundary: payload.boundary,
  };
}

async function realpathOrResolved(targetPath) {
  const resolvedTarget = path.resolve(targetPath);
  try {
    return await realpath(resolvedTarget);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return resolvedTarget;
    }
    throw error;
  }
}

async function resolveRealpathInsideProject(projectRoot, targetPath, label, code) {
  const canonicalProjectRoot = await realpathOrResolved(projectRoot);
  const canonicalTarget = await realpathOrResolved(targetPath);
  if (!isPathInside(canonicalProjectRoot, canonicalTarget)) {
    fail(code, `${label} must stay inside the workspace root.`, {
      label,
      candidate: canonicalTarget,
    });
  }
  return canonicalTarget;
}

async function pathExists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

async function assertRequiredSurfacesAvailable(projectRoot, options = {}) {
  if (options.skipSurfaceCheck) {
    return;
  }

  const surfaceExists = options.surfaceExists ?? pathExists;
  for (const repoRelativePath of REQUIRED_SURFACES) {
    const absolutePath = path.join(projectRoot, repoRelativePath);
    if (!(await surfaceExists(absolutePath))) {
      fail(
        'E_VRE_SURFACE_MISSING',
        `Wave 4.5 requires reviewed VRE surface ${repoRelativePath} before role dispatch can proceed.`,
        { missingSurface: repoRelativePath },
      );
    }
  }
}

function resolveExecutorClass(binding) {
  if (binding.integrationKind === 'provider-cli') {
    if (binding.providerRef === 'openai/codex') return 'codex-cli';
    if (binding.providerRef === 'anthropic/claude') return 'claude-cli';
    return `provider-cli:${binding.providerRef ?? 'unknown'}`;
  }

  return binding.integrationKind;
}

function hasReviewer2VerdictEvidence(context = {}) {
  return (
    typeof context.latestR2VerdictEventId === 'string' && context.latestR2VerdictEventId.trim() !== ''
  ) || (
    context.r2Verdict != null && typeof context.r2Verdict === 'object'
  );
}

export function evaluateReviewer2Gate(action, context = {}) {
  if (action === 'claim-promotion') {
    const latestClaimEventType = typeof context.latestClaimEventType === 'string'
      ? context.latestClaimEventType.trim().toUpperCase()
      : null;
    if (latestClaimEventType === 'R2_REVIEWED') {
      return {
        allowed: true,
        gateId: REVIEWER2_GATE_ID,
        action,
        claimId: context.claimId ?? null,
      };
    }
    return {
      allowed: false,
      code: REVIEWER2_GATE_ID,
      gateId: REVIEWER2_GATE_ID,
      action,
      claimId: context.claimId ?? null,
      latestClaimEventType,
      requestedReviewer: 'reviewer-2',
      message: 'Claim promotion requires the existing plugin lifecycle gate to observe latest event R2_REVIEWED.',
    };
  }

  const requiresReviewer2 = new Set([
    'objective-completion',
    'final-digest-export',
    'semantic-drift-resolution',
    'handoff-conflict-continuation',
  ]);
  if (!requiresReviewer2.has(action) || hasReviewer2VerdictEvidence(context)) {
    return {
      allowed: true,
      gateId: REVIEWER2_GATE_ID,
      action,
      latestR2VerdictEventId: context.latestR2VerdictEventId ?? null,
    };
  }

  return {
    allowed: false,
    code: 'E_R2_REVIEW_PENDING',
    gateId: REVIEWER2_GATE_ID,
    action,
    latestR2VerdictEventId: context.latestR2VerdictEventId ?? null,
    requestedReviewer: 'reviewer-2',
    message: `Reviewer-2 verdict is required before ${action}.`,
  };
}

export function assertReviewer2Gate(action, context = {}) {
  const decision = evaluateReviewer2Gate(action, context);
  if (!decision.allowed) {
    fail(decision.code, decision.message, {
      action,
      gateId: decision.gateId,
      claimId: decision.claimId ?? null,
      latestClaimEventType: decision.latestClaimEventType ?? null,
      latestR2VerdictEventId: decision.latestR2VerdictEventId ?? null,
      requestedReviewer: decision.requestedReviewer,
    });
  }
  return decision;
}

function assertRoleMutationPermission(roleContract, request) {
  const mutation = request.objectiveMutation ?? {};
  const mutatesGlobalState =
    mutation.setCompletion === true
    || mutation.completeObjective === true
    || mutation.chooseNextGlobalAction === true;

  if (mutatesGlobalState && !roleContract.canMutateObjective) {
    fail(
      'E_ROLE_CANNOT_MUTATE_OBJECTIVE',
      `Role ${roleContract.roleId} may return proposals or evidence but cannot mutate global objective state.`,
      { roleId: roleContract.roleId },
    );
  }

  if (mutation.claimPromotion != null) {
    assertReviewer2Gate('claim-promotion', mutation.claimPromotion);
  }

  if (mutation.completeObjective === true || mutation.setCompletion === true) {
    assertReviewer2Gate('objective-completion', mutation);
  }

  if (mutation.finalDigestExport === true || mutation.exportFinalDigest === true) {
    assertReviewer2Gate('final-digest-export', mutation);
  }
}

function deriveDispatchMode(roleContract, request) {
  const requestedMode = request.requestedDispatchMode ?? null;

  if (roleContract.dispatchMode === 'inline-only') {
    if (requestedMode != null && requestedMode !== 'inline-only') {
      fail(
        'E_ROLE_INLINE_ONLY',
        `Role ${roleContract.roleId} is inline-only in Phase 9 v1.`,
        { roleId: roleContract.roleId, requestedMode },
      );
    }
    return 'inline-only';
  }

  if (roleContract.dispatchMode === 'queue-task-or-inline-only') {
    if (requestedMode != null && !['queue-task', 'inline-only'].includes(requestedMode)) {
      fail(
        'E_ROLE_DISPATCH_MODE_UNSUPPORTED',
        `Role ${roleContract.roleId} supports only queue-task or inline-only dispatch in Phase 9 v1.`,
        { roleId: roleContract.roleId, requestedMode },
      );
    }
    if (requestedMode === 'inline-only') {
      return 'inline-only';
    }
    return request.taskKind ? 'queue-task' : 'inline-only';
  }

  if (requestedMode != null && requestedMode !== roleContract.dispatchMode) {
    fail(
      'E_ROLE_DISPATCH_MODE_UNSUPPORTED',
      `Role ${roleContract.roleId} requires dispatchMode=${roleContract.dispatchMode}.`,
      { roleId: roleContract.roleId, requestedMode },
    );
  }

  return roleContract.dispatchMode;
}

function assertTransportPolicy(roleId, request, dispatchMode) {
  const requestedTransport = request.requestedTransport ?? null;

  if (WEB_REQUIRING_ROLE_IDS.has(roleId) && requestedTransport && FORBIDDEN_TASK_STYLE_TRANSPORTS.has(requestedTransport)) {
    fail(
      'E_WEB_ROLE_REQUIRES_INLINE_OR_REVIEWED_SUBPROCESS',
      `Role ${roleId} may not use Task-style background delegation in Phase 9 v1.`,
      { roleId, requestedTransport },
    );
  }

  if (dispatchMode === 'inline-only' && requestedTransport === 'provider-gateway') {
    fail(
      'E_ROLE_INLINE_ONLY',
      `Role ${roleId} is inline-only in Phase 9 v1 and cannot be routed through provider-gateway yet.`,
      { roleId },
    );
  }
}

function assertObjectiveScope(request, dispatchMode) {
  const objectiveId = requireString(request.objectiveId, 'objectiveId', 'E_OBJECTIVE_ID_REQUIRED');
  const hasObjectiveState = request.objectiveStateExists !== false;

  if (hasObjectiveState && request.contextSource === 'chat-only' && dispatchMode !== 'inline-only') {
    fail(
      'E_CHAT_ONLY_DISPATCH_FORBIDDEN',
      `Objective-scoped role dispatch for ${objectiveId} cannot start from chat-only context.`,
      { objectiveId },
    );
  }

  return objectiveId;
}

function resolvePathInsideProject(projectRoot, absoluteCandidate, label, code) {
  const resolved = path.resolve(absoluteCandidate);
  const relative = path.relative(projectRoot, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    fail(code, `${label} must stay inside the workspace root.`, {
      label,
      candidate: resolved,
    });
  }
  return resolved;
}

async function buildSessionIsolation(projectRoot, request, options = {}) {
  const isolation = request.sessionIsolation;
  if (isolation == null || typeof isolation !== 'object') {
    fail(
      'E_SESSION_ISOLATION_REQUIRED',
      'Reviewed subprocess roles require explicit sessionIsolation metadata.',
      { roleId: request.roleId },
    );
  }

  if (isolation.inheritChatHistory !== false) {
    fail(
      'E_SESSION_ISOLATION_REQUIRED',
      'Reviewed subprocess roles must set sessionIsolation.inheritChatHistory=false.',
      { roleId: request.roleId },
    );
  }

  const workspaceRoot = await resolveRealpathInsideProject(
    projectRoot,
    resolvePathInsideProject(
      projectRoot,
      requireString(isolation.workspaceRoot, 'sessionIsolation.workspaceRoot', 'E_SESSION_ISOLATION_REQUIRED'),
      'sessionIsolation.workspaceRoot',
      'E_CWD_ESCAPE',
    ),
    'sessionIsolation.workspaceRoot',
    'E_CWD_ESCAPE',
  );
  const childSessionId =
    typeof isolation.childSessionId === 'string' && isolation.childSessionId.trim() !== ''
      ? isolation.childSessionId.trim()
      : `child-${request.taskId}-${randomUUID()}`;
  const lexicalScratchRoot = isolation.scratchRoot == null
    ? resolveInside(
      projectRoot,
      '.vibe-science-environment',
      'objectives',
      request.objectiveId,
      'dispatch',
      'scratch',
      request.taskId,
    )
    : resolvePathInsideProject(
      projectRoot,
      requireString(isolation.scratchRoot, 'sessionIsolation.scratchRoot', 'E_SESSION_ISOLATION_REQUIRED'),
      'sessionIsolation.scratchRoot',
      'E_WORKSPACE_WRITE_ESCAPE',
    );
  const scratchRoot = await resolveRealpathInsideProject(
    projectRoot,
    lexicalScratchRoot,
    'sessionIsolation.scratchRoot',
    'E_WORKSPACE_WRITE_ESCAPE',
  );

  return Object.freeze({
    childSessionId,
    workspaceRoot,
    scratchRoot,
    inheritChatHistory: false,
  });
}

function buildRoleEnvelope(request, sessionIsolation, options = {}) {
  return {
    schemaVersion: 'phase9.role-envelope.v1',
    objectiveId: request.objectiveId,
    stageId: request.stageId ?? null,
    roleId: request.roleId,
    taskId: request.taskId,
    dispatchParentPid: options.spawnParentPid ?? process.pid,
    sessionIsolation,
    handshakeSubset: request.handshakeSubset ?? {},
    handoffCursor: request.handoffCursor ?? null,
    allowedActions: Array.isArray(request.allowedActions)
      ? [...request.allowedActions]
      : defaultAllowedActions(request.roleId),
    activeGates: Array.isArray(request.activeGates) ? [...request.activeGates] : [],
    stopConditions: request.stopConditions ?? {},
    expectedOutputShape: request.expectedOutputShape ?? {},
    generatedAt: options.now ?? ioNow(),
    generatedBySession: request.generatedBySession ?? null,
  };
}

function buildAllowedEnv(projectRoot, envelopePath, request) {
  const env = Object.create(null);
  for (const key of ['PATH', 'HOME', 'USERPROFILE', 'SYSTEMROOT', 'TEMP', 'TMP']) {
    if (process.env[key] !== undefined) {
      env[key] = process.env[key];
    }
  }

  env.VRE_ROOT = projectRoot;
  env.PHASE9_OBJECTIVE_ID = request.objectiveId;
  env.PHASE9_TASK_ID = request.taskId;
  env.PHASE9_ENVELOPE_PATH = envelopePath;

  if (request.spawn?.env && typeof request.spawn.env === 'object') {
    for (const [key, value] of Object.entries(request.spawn.env)) {
      env[key] = value;
    }
  }

  return env;
}

function buildSpawnRequest(projectRoot, envelopePath, envelope, request) {
  const requestedArgs = Array.isArray(request.spawn?.argv) ? [...request.spawn.argv] : [];
  const argv = requestedArgs.length > 0
    ? requestedArgs
    : [REVIEWED_ROLE_RUNNER_PATH, '--envelope', envelopePath];
  const envelopeIndex = argv.indexOf('--envelope');
  if (envelopeIndex === -1) {
    argv.push('--envelope', envelopePath);
  } else if (argv[envelopeIndex + 1] !== envelopePath) {
    argv[envelopeIndex + 1] = envelopePath;
  }

  return Object.freeze({
    command: request.spawn?.command ?? process.execPath,
    argv,
    cwd: request.spawn?.cwd ?? envelope.sessionIsolation.workspaceRoot,
    env: buildAllowedEnv(projectRoot, envelopePath, request),
    stdio: Array.isArray(request.spawn?.stdio) ? [...request.spawn.stdio] : ['pipe', 'pipe', 'pipe'],
  });
}

async function resolveInlineContextPressureBoundary(projectRoot, roleId, objectiveId, request, options = {}) {
  const contextPressure = evaluateContextPressure(request.contextBudget);
  if (contextPressure == null) {
    return {
      contextPressure: null,
      preCompact: null,
      postCompactResume: null,
    };
  }
  if (!contextPressure.triggered) {
    return {
      contextPressure,
      preCompact: null,
      postCompactResume: null,
    };
  }

  const writtenAt = options.now ?? ioNow();
  const eventWrite = await appendObjectiveEvent(
    projectRoot,
    objectiveId,
    'budget-threshold',
    {
      reason: 'context-pressure',
      action: 'compact-then-resume',
      boundary: contextPressure.boundary,
      roleId,
      usedTokens: contextPressure.usedTokens,
      modelLimitTokens: contextPressure.modelLimitTokens,
      usedRatio: contextPressure.usedRatio,
      thresholdRatio: contextPressure.thresholdRatio,
    },
    writtenAt,
  );

  const handoffWrites = [];
  for (const candidate of collectPreCompactHandoffCandidates(request)) {
    handoffWrites.push(await appendObjectiveHandoff(
      projectRoot,
      objectiveId,
      normalizePreCompactHandoff(roleId, request, candidate),
      {
        writtenAt,
        workspaceRoot: request.sessionIsolation?.workspaceRoot ?? projectRoot,
        scratchRoot: request.sessionIsolation?.scratchRoot ?? null,
      },
    ));
  }

  const snapshotWrite = await writeObjectiveResumeSnapshot(projectRoot, objectiveId, {
    writtenReason: 'pre-compact',
    writtenAt,
    notes: `Inline context pressure ${(contextPressure.usedRatio * 100).toFixed(4)}% exceeded the 60% model limit threshold.`,
  });

  const compact = await (options.triggerCompact ?? defaultTriggerCompact)({
    objectiveId,
    roleId,
    boundary: contextPressure.boundary,
    eventId: eventWrite.event.eventId,
    eventLogPath: eventWrite.eventsPath,
    handoffLedgerPath: objectiveHandoffsPath(projectRoot, objectiveId),
    snapshotPath: snapshotWrite.snapshotPath,
    contextPressure,
  });
  const postCompactResume = await reloadPostCompactResume(projectRoot, objectiveId, options);

  return {
    contextPressure,
    preCompact: {
      event: eventWrite.event,
      eventsPath: eventWrite.eventsPath,
      handoffs: handoffWrites.map((entry) => entry.handoff),
      handoffLedgerPath: objectiveHandoffsPath(projectRoot, objectiveId),
      snapshot: snapshotWrite,
      compact,
    },
    postCompactResume,
  };
}

function extractHandoffCandidate(result) {
  if (result == null || typeof result !== 'object' || Array.isArray(result)) {
    return null;
  }

  if (result.handoff != null && typeof result.handoff === 'object' && !Array.isArray(result.handoff)) {
    return result.handoff;
  }

  if (Array.isArray(result.artifactPaths) || typeof result.summary === 'string') {
    return result;
  }

  return null;
}

function normalizeRoleResultToHandoff(plan, envelope, result) {
  const candidate = extractHandoffCandidate(result);
  if (!candidate) {
    fail(
      'E_ROLE_RESULT_HANDOFF_REQUIRED',
      `Role ${plan.roleId} must return a phase9.handoff.v1 payload before the lead may continue.`,
      {
        roleId: plan.roleId,
        taskId: plan.taskId
      },
    );
  }

  return {
    handoffId: candidate.handoffId ?? `H-${plan.taskId}`,
    fromAgentRole: candidate.fromAgentRole ?? plan.roleId,
    toAgentRole: candidate.toAgentRole ?? 'lead-researcher',
    artifactPaths: Array.isArray(candidate.artifactPaths) ? [...candidate.artifactPaths] : [],
    summary: candidate.summary,
    openBlockers: Array.isArray(candidate.openBlockers) ? [...candidate.openBlockers] : [],
    closesHandoffId: candidate.closesHandoffId ?? null,
    writerSession: candidate.writerSession ?? envelope.sessionIsolation.childSessionId,
  };
}

function deriveLeadContinuation(handoff) {
  const firstBlocker = Array.isArray(handoff?.openBlockers) ? handoff.openBlockers[0] : null;
  if (!firstBlocker) {
    return {
      status: 'ready',
      blockerCode: null,
      requestedReviewer: null,
    };
  }

  const blockerCode = typeof firstBlocker === 'string'
    ? firstBlocker
    : firstBlocker.code ?? 'UNKNOWN_BLOCKER';
  const requiresReview = REVIEW_REQUIRED_BLOCKER_CODES.has(blockerCode) || /\bCONFLICT\b/iu.test(blockerCode);
  return {
    status: requiresReview ? 'review-required' : 'blocked',
    blockerCode,
    requestedReviewer: blockerCode === 'E_R2_REVIEW_PENDING' ? 'reviewer-2-or-lead' : requiresReview ? 'reviewer-2' : null,
  };
}

async function recordStateConflictGovernanceEvent(objectiveId, leadContinuation) {
  if (
    leadContinuation?.blockerCode !== 'E_STATE_CONFLICT' ||
    leadContinuation.status !== 'review-required'
  ) {
    return;
  }
  try {
    await logGovernanceEventViaPlugin({
      event_type: 'state_conflict_detected',
      source_component: AGENT_ORCHESTRATION_GOVERNANCE_SOURCE_COMPONENT,
      objective_id: objectiveId,
      severity: 'critical',
      details: {
        conflictCode: 'E_STATE_CONFLICT',
        continuationStatus: leadContinuation.status,
        requestedReviewer: leadContinuation.requestedReviewer
      }
    });
  } catch (error) {
    const code = typeof error?.code === 'string' ? error.code : 'E_GOVERNANCE_BRIDGE_FAILED';
    process.stderr.write(`[phase9-governance] state_conflict_detected telemetry failed: ${code}\n`);
  }
}

function normalizeReviewer2Verdict(plan, persistedHandoff, result) {
  if (plan.roleId !== 'reviewer-2') {
    return null;
  }

  const rawVerdict = result?.r2Verdict ?? result?.verdict ?? null;

  if (rawVerdict == null) {
    // T4.5.3 spec is conditional: "Reviewer-2 verdict is persisted as
    // objective event `r2-verdict` and, if tied to a role handoff, references
    // handoffId." The strict per-dispatch verdict requirement is NOT in spec
    // scope. The strategic gate (claim-promotion, objective-completion,
    // final-digest-export, semantic-drift-resolution, handoff-conflict-continuation)
    // is enforced via assertReviewer2Gate at the decision points. This
    // function is the persistence path: when a verdict is returned, validate
    // and persist; when none is returned, return null and let the dispatch
    // proceed with handoff-only persistence.
    return null;
  }

  const verdictValue = typeof rawVerdict === 'string'
    ? rawVerdict
    : rawVerdict?.verdict;
  const verdict = typeof verdictValue === 'string' ? verdictValue.trim().toUpperCase() : null;
  if (!REVIEWER2_VERDICTS.has(verdict)) {
    fail(
      'E_R2_VERDICT_REQUIRED',
      'Reviewer-2 dispatch returned an r2Verdict payload but verdict is not in ACCEPT | REJECT | DEFER.',
      {
        roleId: plan.roleId,
        taskId: plan.taskId,
      },
    );
  }

  const resolvedBlockerCodes = Array.isArray(rawVerdict?.resolvedBlockerCodes)
    ? rawVerdict.resolvedBlockerCodes.filter((entry) => typeof entry === 'string' && entry.trim() !== '')
    : ['E_R2_REVIEW_PENDING'];

  return {
    gateId: REVIEWER2_GATE_ID,
    claimId: typeof rawVerdict?.claimId === 'string' && rawVerdict.claimId.trim() !== ''
      ? rawVerdict.claimId.trim()
      : null,
    verdict,
    summary: typeof rawVerdict?.summary === 'string' && rawVerdict.summary.trim() !== ''
      ? rawVerdict.summary.trim()
      : persistedHandoff.summary,
    reviewerRole: 'reviewer-2',
    handoffId: persistedHandoff.handoffId,
    reviewedArtifactPaths: [...persistedHandoff.artifactPaths],
    resolvedBlockerCodes,
  };
}

export async function validateReviewedSpawnRequest(spawnRequest, envelope, envelopePath) {
  for (const [key, value] of Object.entries(spawnRequest.env ?? {})) {
    if (DENY_REGEX.test(key) || (typeof value === 'string' && DENY_REGEX.test(value))) {
      fail('E_ENV_LEAK', `Spawn env contains forbidden reviewed-session material in ${key}.`, {
        key,
      });
    }

    if (!ENV_ALLOWLIST.has(key)) {
      fail(
        'E_ENV_ALLOWLIST_VIOLATED',
        `Spawn env key ${key} is outside the reviewed allowlist.`,
        { key },
      );
    }
  }

  const argv = Array.isArray(spawnRequest.argv) ? spawnRequest.argv : [];
  const envelopeFlagIndex = argv.indexOf('--envelope');
  if (envelopeFlagIndex === -1 || argv[envelopeFlagIndex + 1] !== envelopePath) {
    fail('E_ARGV_LEAK', 'Reviewed subprocess argv must transport the bounded context via --envelope <path>.');
  }

  for (const token of argv) {
    if (typeof token !== 'string' || DENY_REGEX.test(token)) {
      fail('E_ARGV_LEAK', 'Reviewed subprocess argv contains a forbidden token or token-like secret.', {
        token,
      });
    }
  }

  const expectedCwd = await realpathOrResolved(envelope.sessionIsolation.workspaceRoot);
  const actualCwd = await realpathOrResolved(spawnRequest.cwd);
  if (actualCwd !== expectedCwd) {
    fail('E_CWD_ESCAPE', 'Reviewed subprocess cwd must equal the resolved workspaceRoot.', {
      expectedCwd,
      actualCwd,
    });
  }

  const stdio = Array.isArray(spawnRequest.stdio) ? spawnRequest.stdio : [];
  if (stdio.length !== 3 || stdio.some((value) => value !== 'pipe')) {
    fail('E_FD_LEAK', 'Phase 9 v1 reviewed subprocesses must use stdio [pipe, pipe, pipe] only.', {
      stdio,
    });
  }
}

async function resolveDispatchBinding(projectRoot, roleContract, request, options = {}) {
  const taskKind = requireString(request.taskKind, 'taskKind', 'E_TASK_KIND_REQUIRED');
  const taskEntry = await (options.getTaskEntry ?? getTaskEntry)(taskKind);
  if (!taskEntry) {
    fail('E_TASK_KIND_UNSUPPORTED', `Unsupported task kind ${taskKind}.`, { taskKind });
  }

  if (!roleContract.allowedTaskKinds.includes(taskKind)) {
    fail(
      'E_TASK_KIND_NOT_ALLOWED',
      `Role ${roleContract.roleId} cannot dispatch task kind ${taskKind}.`,
      { roleId: roleContract.roleId, taskKind },
    );
  }

  if (taskEntry.lane !== roleContract.laneId) {
    fail(
      'E_TASK_KIND_LANE_MISMATCH',
      `Task kind ${taskKind} is registered for ${taskEntry.lane}, not ${roleContract.laneId}.`,
      { taskKind, expectedLane: roleContract.laneId, actualLane: taskEntry.lane },
    );
  }

  const lanePolicies = options.lanePolicies ?? await readLanePolicies(projectRoot);
  const continuityProfile = options.continuityProfile ?? await readContinuityProfile(projectRoot);
  const binding = (options.selectLaneBinding ?? selectLaneBinding)({
    laneId: roleContract.laneId,
    lanePolicies,
    continuityProfile,
    requiredCapability: taskEntry.requiredCapability,
    providerExecutors: options.providerExecutors ?? {},
    systemDefaultAllowApiFallback: false,
  });
  const executorClass = resolveExecutorClass(binding);

  if (!roleContract.executorClasses.includes(executorClass)) {
    fail(
      'E_EXECUTOR_CLASS_NOT_ALLOWED',
      `Role ${roleContract.roleId} cannot dispatch through executor class ${executorClass}.`,
      { roleId: roleContract.roleId, executorClass },
    );
  }

  return { taskEntry, binding, executorClass };
}

export async function prepareRoleDispatch(projectPath, request = {}, options = {}) {
  const projectRoot = resolveProjectRoot(projectPath);
  await assertRequiredSurfacesAvailable(projectRoot, options);

  const roleId = requireString(request.roleId, 'roleId', 'E_UNSUPPORTED_ROLE');
  const roleContract = ROLE_RUNTIME_MATRIX[roleId];
  if (!roleContract) {
    fail('E_UNSUPPORTED_ROLE', `Unsupported role ${roleId}.`, { roleId });
  }

  assertRoleMutationPermission(roleContract, request);
  const dispatchMode = deriveDispatchMode(roleContract, request);
  assertTransportPolicy(roleId, request, dispatchMode);
  const objectiveId = assertObjectiveScope(request, dispatchMode);

  if (dispatchMode === 'inline-only') {
    const allowedActions = Array.isArray(request.allowedActions)
      ? [...request.allowedActions]
      : defaultAllowedActions(roleId);
    const boundary = await resolveInlineContextPressureBoundary(
      projectRoot,
      roleId,
      objectiveId,
      request,
      options,
    );
    return {
      roleId,
      objectiveId,
      dispatchMode: 'inline-only',
      laneId: null,
      canMutateObjective: roleContract.canMutateObjective,
      resultContract: roleContract.resultContract,
      allowedTaskKinds: [...roleContract.allowedTaskKinds],
      allowedActions,
      transport: 'inline-role-mode',
      ...boundary,
    };
  }

  const taskId = requireString(request.taskId, 'taskId', 'E_TASK_ID_REQUIRED');
  const { taskEntry, binding, executorClass } = await resolveDispatchBinding(projectRoot, roleContract, {
    ...request,
    objectiveId,
    roleId,
    taskId,
  }, options);
  const sessionIsolation = await buildSessionIsolation(projectRoot, {
    ...request,
    objectiveId,
    taskId,
    roleId,
  }, options);
  await mkdir(sessionIsolation.scratchRoot, { recursive: true });

  const envelope = buildRoleEnvelope({
    ...request,
    objectiveId,
    roleId,
    taskId,
  }, sessionIsolation, {
    now: options.now ?? ioNow(),
    spawnParentPid: options.spawnParentPid ?? process.pid,
  });
  const validateEnvelope = options.roleEnvelopeValidator
    ?? await loadValidator(projectRoot, 'phase9-role-envelope.schema.json');

  try {
    assertValid(validateEnvelope, envelope, 'phase9.role-envelope.v1');
  } catch (error) {
    fail('E_INVALID_ENVELOPE', error.message, { roleId, taskId });
  }

  const envelopePath = resolveInside(sessionIsolation.scratchRoot, 'phase9-role-envelope.json');
  await atomicWriteJson(envelopePath, envelope);
  const spawnRequest = buildSpawnRequest(projectRoot, envelopePath, envelope, {
    ...request,
    objectiveId,
    taskId,
  });
  await validateReviewedSpawnRequest(spawnRequest, envelope, envelopePath);

  return {
    roleId,
    objectiveId,
    taskId,
    taskKind: taskEntry.taskKind,
    dispatchMode,
    laneId: roleContract.laneId,
    executorClass,
    binding,
    transport: 'reviewed-subprocess',
    canMutateObjective: roleContract.canMutateObjective,
    resultContract: roleContract.resultContract,
    allowedTaskKinds: [...roleContract.allowedTaskKinds],
    envelope,
    envelopePath,
    spawnRequest,
  };
}

export async function dispatchRoleAssignment(projectPath, request = {}, options = {}) {
  const plan = await prepareRoleDispatch(projectPath, request, options);
  if (options.execute !== true || plan.transport !== 'reviewed-subprocess') {
    return { ...plan, executed: false, result: null };
  }

  const finalEnvelope = {
    ...plan.envelope,
    dispatchParentPid: options.spawnParentPid ?? process.pid,
  };
  const validateEnvelope = options.roleEnvelopeValidator
    ?? await loadValidator(resolveProjectRoot(projectPath), 'phase9-role-envelope.schema.json');

  try {
    assertValid(validateEnvelope, finalEnvelope, 'phase9.role-envelope.v1');
  } catch (error) {
    fail('E_INVALID_ENVELOPE', error.message, {
      roleId: plan.roleId,
      taskId: plan.taskId,
    });
  }

  await atomicWriteJson(plan.envelopePath, finalEnvelope);
  const finalSpawnRequest = buildSpawnRequest(resolveProjectRoot(projectPath), plan.envelopePath, finalEnvelope, {
    ...request,
    objectiveId: plan.objectiveId,
    taskId: plan.taskId,
  });
  await validateReviewedSpawnRequest(finalSpawnRequest, finalEnvelope, plan.envelopePath);

  const result = await (options.invokeLaneBinding ?? invokeLaneBinding)(
    plan.binding,
    options.providerExecutors ?? {},
    {
      projectPath: resolveProjectRoot(projectPath),
      roleId: plan.roleId,
      roleEnvelope: finalEnvelope,
      roleEnvelopePath: plan.envelopePath,
      taskKind: plan.taskKind,
      objectiveId: plan.objectiveId,
      stageId: finalEnvelope.stageId,
      expectedOutputShape: finalEnvelope.expectedOutputShape,
    },
  );

  const handoff = normalizeRoleResultToHandoff(plan, finalEnvelope, result);
  const persistedHandoff = await appendObjectiveHandoff(
    resolveProjectRoot(projectPath),
    plan.objectiveId,
    handoff,
    {
      writtenAt: options.now ?? ioNow(),
      workspaceRoot: finalEnvelope.sessionIsolation.workspaceRoot,
      scratchRoot: finalEnvelope.sessionIsolation.scratchRoot,
    },
  );
  const persistedRecord = persistedHandoff?.handoff ?? null;
  const leadContinuation = persistedRecord ? deriveLeadContinuation(persistedRecord) : null;
  await recordStateConflictGovernanceEvent(plan.objectiveId, leadContinuation);
  const r2Verdict = normalizeReviewer2Verdict(plan, persistedRecord, result);
  let r2VerdictEvent = null;
  let r2Snapshot = null;
  let r2Digest = null;
  let r2Bridge = null;

  if (r2Verdict != null) {
    const projectRoot = resolveProjectRoot(projectPath);
    const writtenAt = options.now ?? ioNow();
    r2VerdictEvent = (await appendObjectiveEvent(
      projectRoot,
      plan.objectiveId,
      'r2-verdict',
      r2Verdict,
      writtenAt,
    )).event;
    r2Snapshot = await writeObjectiveResumeSnapshot(projectRoot, plan.objectiveId, {
      writtenReason: 'pre-handoff',
      writtenAt,
      notes: `Reviewer-2 verdict ${r2Verdict.verdict} persisted as ${r2VerdictEvent.eventId}.`,
    });
    r2Digest = await writeObjectiveDigest(projectRoot, plan.objectiveId, {
      writtenAt,
      wakeId: null,
      status: 'reviewed',
      queueCursor: null,
      lastTaskId: plan.taskId,
      snapshotPath: toRepoRelative(projectRoot, r2Snapshot.snapshotPath),
      eventLogPath: toRepoRelative(projectRoot, objectiveEventsPath(projectRoot, plan.objectiveId)),
      handoffLedgerPath: toRepoRelative(projectRoot, objectiveHandoffsPath(projectRoot, plan.objectiveId)),
      queuePath: null,
      handoffId: persistedRecord.handoffId,
      digestKind: 'r2-verdict',
      latestR2VerdictId: r2VerdictEvent.eventId,
      r2Verdict: r2Verdict.verdict,
      claimId: r2Verdict.claimId,
      notes: r2Verdict.summary,
    });
    if (typeof r2Verdict.claimId === 'string' && r2Verdict.claimId.trim() !== '') {
      r2Bridge = await writeR2BridgeEvent({
        projectRoot,
        objectiveId: plan.objectiveId,
        eventId: r2VerdictEvent.eventId,
        eventLogPath: objectiveEventsPath(projectRoot, plan.objectiveId),
        claimId: r2Verdict.claimId,
        sessionId: finalEnvelope.generatedBySession,
        verdict: r2Verdict.verdict,
      }, options);
    } else {
      r2Bridge = {
        status: 'skipped',
        reason: 'r2-verdict-without-claim-id',
      };
    }
  }

  return {
    ...plan,
    envelope: finalEnvelope,
    spawnRequest: finalSpawnRequest,
    executed: true,
    handoff: persistedRecord,
    handoffLedgerPath: persistedHandoff?.handoffsPath ?? null,
    leadContinuation,
    r2Verdict,
    r2VerdictEvent,
    r2Bridge,
    resumeSnapshotPath: r2Snapshot ? toRepoRelative(resolveProjectRoot(projectPath), r2Snapshot.snapshotPath) : null,
    digestPath: r2Digest ? toRepoRelative(resolveProjectRoot(projectPath), r2Digest.latestPath) : null,
    result,
  };
}

export function getRoleDispatchContract(roleId) {
  return ROLE_RUNTIME_MATRIX[roleId] ?? null;
}

export function listSupportedAgentRoles() {
  return [...SUPPORTED_ROLE_IDS];
}
