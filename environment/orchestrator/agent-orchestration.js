import { randomUUID } from 'node:crypto';
import { access, mkdir } from 'node:fs/promises';
import path from 'node:path';

import {
  atomicWriteJson,
  assertValid,
  loadValidator,
  now as ioNow,
  resolveInside,
  resolveProjectRoot,
} from '../control/_io.js';
import { appendObjectiveHandoff } from '../objectives/store.js';
import { invokeLaneBinding, selectLaneBinding } from './provider-gateway.js';
import { readContinuityProfile, readLanePolicies } from './state.js';
import { getTaskEntry } from './task-registry.js';

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

function requireString(value, label, code) {
  if (typeof value !== 'string' || value.trim() === '') {
    fail(code, `${label} must be a non-empty string.`);
  }
  return value.trim();
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

function buildSessionIsolation(projectRoot, request, options = {}) {
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

  const workspaceRoot = resolvePathInsideProject(
    projectRoot,
    requireString(isolation.workspaceRoot, 'sessionIsolation.workspaceRoot', 'E_SESSION_ISOLATION_REQUIRED'),
    'sessionIsolation.workspaceRoot',
    'E_CWD_ESCAPE',
  );
  const childSessionId =
    typeof isolation.childSessionId === 'string' && isolation.childSessionId.trim() !== ''
      ? isolation.childSessionId.trim()
      : `child-${request.taskId}-${randomUUID()}`;
  const scratchRoot = isolation.scratchRoot == null
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
  const argv = requestedArgs.length > 0 ? requestedArgs : ['--envelope', envelopePath];
  const envelopeIndex = argv.indexOf('--envelope');
  if (envelopeIndex === -1) {
    argv.push('--envelope', envelopePath);
  } else if (argv[envelopeIndex + 1] !== envelopePath) {
    argv[envelopeIndex + 1] = envelopePath;
  }

  return Object.freeze({
    command: request.spawn?.command ?? 'reviewed-role-runner',
    argv,
    cwd: request.spawn?.cwd ?? envelope.sessionIsolation.workspaceRoot,
    env: buildAllowedEnv(projectRoot, envelopePath, request),
    stdio: Array.isArray(request.spawn?.stdio) ? [...request.spawn.stdio] : ['pipe', 'pipe', 'pipe'],
  });
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
  return {
    status: blockerCode === 'E_R2_REVIEW_PENDING' ? 'review-required' : 'blocked',
    blockerCode,
    requestedReviewer: blockerCode === 'E_R2_REVIEW_PENDING' ? 'reviewer-2-or-lead' : null,
  };
}

export function validateReviewedSpawnRequest(spawnRequest, envelope, envelopePath) {
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

  const expectedCwd = path.resolve(envelope.sessionIsolation.workspaceRoot);
  const actualCwd = path.resolve(spawnRequest.cwd);
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
    return {
      roleId,
      objectiveId,
      dispatchMode: 'inline-only',
      laneId: null,
      canMutateObjective: roleContract.canMutateObjective,
      resultContract: roleContract.resultContract,
      allowedTaskKinds: [...roleContract.allowedTaskKinds],
      allowedActions: Array.isArray(request.allowedActions)
        ? [...request.allowedActions]
        : defaultAllowedActions(roleId),
      transport: 'inline-role-mode',
    };
  }

  const taskId = requireString(request.taskId, 'taskId', 'E_TASK_ID_REQUIRED');
  const { taskEntry, binding, executorClass } = await resolveDispatchBinding(projectRoot, roleContract, {
    ...request,
    objectiveId,
    roleId,
    taskId,
  }, options);
  const sessionIsolation = buildSessionIsolation(projectRoot, {
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
  validateReviewedSpawnRequest(spawnRequest, envelope, envelopePath);

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
  validateReviewedSpawnRequest(finalSpawnRequest, finalEnvelope, plan.envelopePath);

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

  return {
    ...plan,
    envelope: finalEnvelope,
    spawnRequest: finalSpawnRequest,
    executed: true,
    handoff: persistedHandoff?.handoff ?? null,
    handoffLedgerPath: persistedHandoff?.handoffsPath ?? null,
    leadContinuation: persistedHandoff ? deriveLeadContinuation(persistedHandoff.handoff) : null,
    result,
  };
}

export function getRoleDispatchContract(roleId) {
  return ROLE_RUNTIME_MATRIX[roleId] ?? null;
}

export function listSupportedAgentRoles() {
  return [...SUPPORTED_ROLE_IDS];
}
