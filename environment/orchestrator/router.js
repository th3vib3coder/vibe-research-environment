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

function inferTaskKindFromObjective(objective) {
  if (/\b(session digest|digest export|export digest|export a digest|digest summary)\b/iu.test(objective)) {
    return 'session-digest-export';
  }

  return null;
}

export function classifyObjectiveMode(objective, requestedMode = null) {
  if (requestedMode) {
    return requestedMode;
  }

  const text = normalizeObjective(objective);
  if (inferTaskKindFromObjective(text)) {
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

function buildTargetRef({ mode, taskKind, targetRef }) {
  if (targetRef && typeof targetRef === 'object') {
    return {
      kind: taskKind ?? targetRef.kind,
      id: targetRef.id,
    };
  }

  if (taskKind === 'session-digest-export') {
    return {
      kind: taskKind,
      id: 'latest',
    };
  }

  if (mode === 'review') {
    return {
      kind: 'artifact-review',
      id: 'manual',
    };
  }

  return null;
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

  if (targetRef.kind === 'session-digest-export') {
    return {
      kind: 'session',
      id: targetRef.id,
      label: 'session-digest-export',
    };
  }

  return {
    kind: 'bundle',
    id: targetRef.id,
    label: targetRef.kind,
  };
}

function buildRouteTitle({ mode, objective, taskKind }) {
  if (taskKind === 'session-digest-export') {
    return 'Export session digest';
  }

  if (mode === 'review') {
    return 'Run contrarian review';
  }

  if (mode === 'intake') {
    return 'Clarify operator request';
  }

  return objective;
}

function buildImmediateEscalation({ mode, objective, taskKind, artifactRefs, targetRef }) {
  if (mode === 'intake') {
    return {
      triggerKind: 'operator-request',
      decisionNeeded: `Clarify the requested orchestrator task before execution: "${objective}"`,
      summary: 'Objective is too ambiguous for automatic routing.',
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
  const mode = classifyObjectiveMode(objective, options.requestedMode ?? null);
  const primaryLane = MODE_TO_PRIMARY_LANE[mode];
  const taskKind = options.taskKind ?? inferTaskKindFromObjective(objective);
  const targetRef = buildTargetRef({ mode, taskKind, targetRef: options.targetRef ?? null });
  const task = await createQueueTask(projectPath, {
    mode,
    ownerLane: primaryLane,
    status: 'queued',
    title: buildRouteTitle({ mode, objective, taskKind }),
    objective,
    targetRef,
    artifactRefs: options.artifactRefs ?? [],
    statusReason: 'Task routed through Phase 5 coordinator.',
  });

  let selectedLane = primaryLane;
  if (taskKind === 'session-digest-export' && primaryLane !== 'execution') {
    await appendQueueLaneReassignment(projectPath, task.taskId, 'execution', {
      statusReason: `Phase 5 routes ${taskKind} through the execution lane.`,
    });
    selectedLane = 'execution';
  }

  const immediateEscalation = buildImmediateEscalation({
    mode,
    objective,
    taskKind,
    artifactRefs: options.artifactRefs ?? [],
    targetRef,
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
