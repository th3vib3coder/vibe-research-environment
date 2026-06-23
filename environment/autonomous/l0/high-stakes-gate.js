import {
  atomicWriteJson,
  now,
  resolveInside,
  resolveProjectRoot
} from '../../control/_io.js';

export const L0_HIGH_STAKES_GATE_SCHEMA_VERSION =
  'phase14.tl0.4-high-stakes-operator-gate.v1';
export const L0_HIGH_STAKES_GATE_RELATIVE_DIR =
  '.vibe-science-environment/autonomous/l0/operator-gates';
export const L0_HIGH_STAKES_ALLOWED_OPERATORS = Object.freeze([
  'Carmine',
  'Elisa'
]);

const HIGH_STAKES_ACTION_TYPES = new Set([
  'clinical-interpretation',
  'dataset-widening',
  'claim-promotion',
  'promote-claim',
  'accepted-claim-edge',
  'write-accepted-claim-edge',
  'new-direction',
  'direction-revival',
  'export',
  'graphify'
]);

export class L0HighStakesGateError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.name = 'L0HighStakesGateError';
    this.code = code;
    this.extra = extra;
  }
}

function fail(code, message, extra = {}) {
  throw new L0HighStakesGateError(code, message, extra);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function actionId(action) {
  return normalizeText(action?.id ?? action?.actionId);
}

function actionType(action) {
  return normalizeText(
    action?.actionType
      ?? action?.kind
      ?? action?.type
      ?? 'research-next-step'
  );
}

export function isHighStakesAction(action = {}) {
  if (!action || typeof action !== 'object') return false;
  return action.highStakes === true
    || action.requiresOperatorGate === true
    || HIGH_STAKES_ACTION_TYPES.has(actionType(action));
}

function requireActionId(action) {
  const id = actionId(action);
  if (!id) {
    fail(
      'E_L0_HIGH_STAKES_GATE_ACTION_ID_REQUIRED',
      'TL0.4 high-stakes gate requires a stable action id before stopping.',
      { actionType: actionType(action) || null }
    );
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id)) {
    fail(
      'E_L0_HIGH_STAKES_GATE_ACTION_ID_UNSAFE',
      'TL0.4 high-stakes gate action id must be a safe record filename.',
      { actionId: id }
    );
  }
  return id;
}

function requireObjectiveId(objectiveRecord) {
  const objectiveId = normalizeText(objectiveRecord?.objectiveId);
  if (!objectiveId) {
    fail(
      'E_L0_HIGH_STAKES_GATE_OBJECTIVE_MISSING',
      'TL0.4 high-stakes gate requires a durable objective id.'
    );
  }
  return objectiveId;
}

function gateRecordPath(projectRoot, actionIdentifier) {
  return resolveInside(
    resolveProjectRoot(projectRoot),
    ...L0_HIGH_STAKES_GATE_RELATIVE_DIR.split('/'),
    `${actionIdentifier}.json`
  );
}

async function defaultWriteOperatorGateRecord(record, options = {}) {
  if (!nonEmptyString(options.projectRoot)) {
    fail(
      'E_L0_HIGH_STAKES_GATE_PROJECT_ROOT_REQUIRED',
      'TL0.4 high-stakes gate default writer requires projectRoot.'
    );
  }
  const targetPath = gateRecordPath(options.projectRoot, record.actionId);
  await atomicWriteJson(targetPath, record);
  return {
    gateRecord: record,
    gateRecordPath: targetPath,
    gateRecordRelativePath:
      `${L0_HIGH_STAKES_GATE_RELATIVE_DIR}/${record.actionId}.json`
  };
}

export function buildHighStakesGateRecord({
  action,
  objectiveRecord,
  iteration = 0,
  priorOperatorGoText = null,
  createdAt = now()
} = {}) {
  if (!isHighStakesAction(action)) {
    fail(
      'E_L0_HIGH_STAKES_GATE_ACTION_NOT_HIGH_STAKES',
      'TL0.4 high-stakes gate can only build STOP records for high-stakes actions.'
    );
  }

  const id = requireActionId(action);
  const type = actionType(action);
  const objectiveId = requireObjectiveId(objectiveRecord);

  return {
    schemaVersion: L0_HIGH_STAKES_GATE_SCHEMA_VERSION,
    requestedGate: 'TL0.4',
    gateKind: 'high-stakes-operator-gate',
    actionId: id,
    actionType: type,
    summary: normalizeText(action.summary) || null,
    reason:
      `High-stakes action '${type}' requires explicit operator GO before execution.`,
    objectiveId,
    iteration,
    createdAt,
    actionExecuted: false,
    resumeRequiresOperatorGo: true,
    runtimeOpened: false,
    autonomousRuntimeAllowed: false,
    acceptedPriorGo: false,
    priorOperatorGoText: nonEmptyString(priorOperatorGoText)
      ? priorOperatorGoText.trim()
      : null,
    operatorSet: [...L0_HIGH_STAKES_ALLOWED_OPERATORS],
    interruptSemantics: 'checked-before-action-execution',
    resumeSource: 'artifact',
    stopSurface: true
  };
}

export async function evaluateHighStakesGate(input = {}, deps = {}) {
  const { action } = input;
  if (!isHighStakesAction(action)) {
    return {
      ok: true,
      verdict: 'allow',
      actionExecuted: false,
      runtimeOpened: false
    };
  }

  const gateRecord = buildHighStakesGateRecord(input);
  const writer = deps.writeOperatorGateRecord
    ?? ((record) => defaultWriteOperatorGateRecord(record, {
      projectRoot: input.projectRoot
    }));

  try {
    const written = await writer(gateRecord);
    return {
      ok: false,
      verdict: 'stop',
      stopReason: 'high-stakes-operator-gate',
      actionExecuted: false,
      runtimeOpened: false,
      gateRecord: written?.gateRecord ?? gateRecord,
      gateRecordPath: written?.gateRecordPath ?? null,
      gateRecordRelativePath: written?.gateRecordRelativePath ?? null
    };
  } catch (error) {
    fail(
      'E_L0_HIGH_STAKES_GATE_RECORD_WRITE_FAILED',
      'TL0.4 high-stakes gate failed closed while writing the operator-gate record.',
      {
        actionId: gateRecord.actionId,
        actionType: gateRecord.actionType,
        causeCode: error?.code ?? null
      }
    );
  }
}
