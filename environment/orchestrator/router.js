import { now } from '../control/_io.js';
import { appendEscalationRecord } from './ledgers.js';
import {
  appendQueueLaneReassignment,
  appendQueueStatusTransition,
  createQueueTask,
  getQueueTask,
} from './queue.js';
import {
  bootstrapOrchestratorState,
  readRouterSession,
  writeRouterSession,
} from './state.js';
import { findByRouterKeyword, getTaskEntry } from './task-registry.js';

export const MODE_TO_PRIMARY_LANE = Object.freeze({
  intake: 'coordination',
  brainstorm: 'coordination',
  execute: 'execution',
  supervise: 'coordination',
  review: 'review',
  report: 'reporting',
  monitor: 'monitoring',
  recover: 'coordination',
});

function normalizeObjective(objective) {
  if (typeof objective !== 'string' || objective.trim() === '') {
    throw new Error('Orchestrator objective must be a non-empty string.');
  }

  return objective.trim();
}

async function inferTaskKindFromObjective(objective) {
  const match = await findByRouterKeyword(objective);
  if (!match || match.ambiguous) {
    return null;
  }
  return match.taskKind;
}

async function resolveObjectiveAmbiguity(objective) {
  const match = await findByRouterKeyword(objective);
  if (match?.ambiguous) {
    return match.candidates;
  }
  return null;
}

export async function classifyObjectiveMode(objective, requestedMode = null) {
  if (requestedMode) {
    return requestedMode;
  }

  const text = normalizeObjective(objective);
  const taskKind = await inferTaskKindFromObjective(text);
  if (taskKind) {
    return 'execute';
  }
  if (/\b(review|contrarian|adversarial|second opinion|challenge)\b/iu.test(text)) {
    return 'review';
  }
  if (/\b(report|status|summary|digest)\b/iu.test(text)) {
    return 'report';
  }
  if (/\b(monitor|watch|poll|cooldown)\b/iu.test(text)) {
    return 'monitor';
  }
  if (/\b(recover|resume|retry)\b/iu.test(text)) {
    return 'recover';
  }
  if (/\b(brainstorm|idea|hypothesis)\b/iu.test(text)) {
    return 'brainstorm';
  }
  if (/\b(supervise|coordinate|route)\b/iu.test(text)) {
    return 'supervise';
  }
  if (/\b(run|export|prepare|generate|build|create)\b/iu.test(text)) {
    return 'execute';
  }

  return 'intake';
}

async function buildTargetRef({ mode, taskKind, targetRef }) {
  if (targetRef && typeof targetRef === 'object') {
    return {
      kind: taskKind ?? targetRef.kind,
      id: targetRef.id,
    };
  }

  if (taskKind) {
    const entry = await getTaskEntry(taskKind);
    if (entry) {
      return { kind: taskKind, id: 'latest' };
    }
  }

  if (mode === 'review') {
    return {
      kind: 'artifact-review',
      id: 'manual',
    };
  }

  return null;
}

function titleCaseTaskKind(taskKind) {
  return taskKind
    .split('-')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function buildSessionTarget(targetRef) {
  if (!targetRef) {
    return null;
  }

  if (
    ['claim', 'paper', 'experiment', 'bundle', 'writing-pack', 'session', 'flow', 'queue-task']
      .includes(targetRef.kind)
  ) {
    return targetRef;
  }

  if (typeof targetRef.kind === 'string' && /^[a-z][a-z0-9-]*$/.test(targetRef.kind)) {
    return {
      kind: 'flow',
      id: targetRef.id,
      label: targetRef.kind,
    };
  }

  return {
    kind: 'bundle',
    id: targetRef.id,
    label: targetRef.kind,
  };
}

async function buildRouteTitle({ mode, objective, taskKind }) {
  if (taskKind) {
    const entry = await getTaskEntry(taskKind);
    if (entry) {
      return `Run ${titleCaseTaskKind(taskKind)}`;
    }
  }

  if (mode === 'review') {
    return 'Run contrarian review';
  }

  if (mode === 'intake') {
    return 'Clarify operator request';
  }

  return objective;
}

function buildImmediateEscalation({ mode, objective, taskKind, artifactRefs, targetRef, ambiguousCandidates = null }) {
  if (mode === 'intake') {
    return {
      triggerKind: 'operator-request',
      decisionNeeded: `Clarify the requested orchestrator task before execution: "${objective}"`,
      summary: 'Objective is too ambiguous for automatic routing.',
    };
  }

  if (ambiguousCandidates && ambiguousCandidates.length > 1 && !taskKind) {
    return {
      triggerKind: 'operator-request',
      decisionNeeded: `Objective matched multiple registered task kinds: ${ambiguousCandidates.join(', ')}. Pick one explicitly via options.taskKind.`,
      summary: `Ambiguous router keyword match across ${ambiguousCandidates.length} task kinds.`,
    };
  }

  if (mode === 'review' && targetRef?.kind !== 'queue-task') {
    return {
      triggerKind: 'review-disagreement',
      decisionNeeded: 'Provide a queue-task target backed by execution output before review can start.',
      summary: 'Review task needs an execution-backed queue target.',
    };
  }

  if (!taskKind && mode === 'execute') {
    return {
      triggerKind: 'operator-request',
      decisionNeeded: 'Choose a supported Phase 5 task class for this execution request.',
      summary: 'No supported Phase 5 execution task matched the objective.',
    };
  }

  if (mode === 'report' || mode === 'monitor' || mode === 'recover' || mode === 'supervise') {
    return {
      triggerKind: 'operator-request',
      decisionNeeded: `Mode "${mode}" is routed visibly, but no runnable Phase 5 lane is frozen for it yet.`,
      summary: `Mode "${mode}" has no runnable Wave 3 lane.`,
    };
  }

  return null;
}

async function writeRouterFocus(projectPath, values = {}) {
  const current = await readRouterSession(projectPath);
  const next = {
    ...(current ?? {}),
    ...values,
    updatedAt: now(),
  };
  return writeRouterSession(projectPath, next);
}

export async function continueRoutedTask(projectPath, options = {}) {
  await bootstrapOrchestratorState(projectPath);

  const task = await getQueueTask(projectPath, options.taskId);
  if (!task) {
    throw new Error(`Queue task not found: ${options.taskId}`);
  }

  const routerSession = await writeRouterFocus(projectPath, {
    currentMode: task.mode,
    objective: task.objective ?? options.objective ?? null,
    currentTarget: buildSessionTarget(task.targetRef ?? null),
    queueFocusTaskId: task.taskId,
    escalationState: {
      status: task.escalationNeeded ? 'pending' : 'none',
      pendingEscalationId: null,
      summary: task.statusReason ?? null,
    },
  });

  return {
    mode: task.mode,
    primaryLane: MODE_TO_PRIMARY_LANE[task.mode],
    selectedLane: task.ownerLane,
    taskKind: task.targetRef?.kind ?? null,
    task,
    routerSession,
    immediateEscalation: null,
    created: false,
  };
}

export async function routeOrchestratorObjective(projectPath, options = {}) {
  await bootstrapOrchestratorState(projectPath);

  const objective = normalizeObjective(options.objective);
  const mode = await classifyObjectiveMode(objective, options.requestedMode ?? null);
  const primaryLane = MODE_TO_PRIMARY_LANE[mode];
  const taskKind = options.taskKind ?? await inferTaskKindFromObjective(objective);
  const ambiguousCandidates = options.taskKind ? null : await resolveObjectiveAmbiguity(objective);
  const targetRef = await buildTargetRef({ mode, taskKind, targetRef: options.targetRef ?? null });
  const task = await createQueueTask(projectPath, {
    mode,
    ownerLane: primaryLane,
    status: 'queued',
    title: await buildRouteTitle({ mode, objective, taskKind }),
    objective,
    targetRef,
    artifactRefs: options.artifactRefs ?? [],
    statusReason: 'Task routed through Phase 5 coordinator.',
  });

  let selectedLane = primaryLane;
  if (taskKind) {
    const entry = await getTaskEntry(taskKind);
    if (entry?.lane && entry.lane !== primaryLane) {
      await appendQueueLaneReassignment(projectPath, task.taskId, entry.lane, {
        statusReason: `Phase 5 routes ${taskKind} through the ${entry.lane} lane.`,
      });
      selectedLane = entry.lane;
    }
  }

  const immediateEscalation = buildImmediateEscalation({
    mode,
    objective,
    taskKind,
    artifactRefs: options.artifactRefs ?? [],
    targetRef,
    ambiguousCandidates,
  });

  if (immediateEscalation) {
    const escalation = await appendEscalationRecord(projectPath, {
      taskId: task.taskId,
      status: 'pending',
      triggerKind: immediateEscalation.triggerKind,
      decisionNeeded: immediateEscalation.decisionNeeded,
      contextShown: [
        `queue/${task.taskId}`,
        `router-mode/${mode}`,
      ],
    });
    await appendQueueStatusTransition(projectPath, task.taskId, {
      status: 'blocked',
      eventKind: 'escalation-link',
      escalationNeeded: true,
      statusReason: immediateEscalation.summary,
    });

    const routerSession = await writeRouterFocus(projectPath, {
      currentMode: mode,
      objective,
      currentTarget: buildSessionTarget(targetRef),
      queueFocusTaskId: task.taskId,
      escalationState: {
        status: 'pending',
        pendingEscalationId: escalation.escalationId,
        summary: immediateEscalation.summary,
      },
    });

    return {
      mode,
      primaryLane,
      selectedLane,
      taskKind,
      task: await getQueueTask(projectPath, task.taskId),
      routerSession,
      immediateEscalation: escalation,
      created: true,
    };
  }

  await appendQueueStatusTransition(projectPath, task.taskId, {
    status: 'ready',
    eventKind: 'status-change',
    escalationNeeded: false,
    statusReason: `Ready for ${selectedLane} lane execution.`,
  });

  const routerSession = await writeRouterFocus(projectPath, {
    currentMode: mode,
    objective,
    currentTarget: buildSessionTarget(targetRef),
    queueFocusTaskId: task.taskId,
    escalationState: {
      status: 'none',
      pendingEscalationId: null,
      summary: null,
    },
  });

  return {
    mode,
    primaryLane,
    selectedLane,
    taskKind,
    task: await getQueueTask(projectPath, task.taskId),
    routerSession,
    immediateEscalation: null,
    created: true,
  };
}
