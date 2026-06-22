import {
  assertValid,
  atomicWriteJson,
  loadValidator,
  resolveProjectRoot
} from '../../control/_io.js';
import { INTERNALS as AUTONOMY_RUNTIME_INTERNALS } from '../../orchestrator/autonomy-runtime.js';
import {
  RESUME_SNAPSHOT_SCHEMA_FILE
} from '../../objectives/resume-snapshot.js';
import { resolveSchemaHostRoot } from '../../objectives/store.js';

export class L0HaltSnapshotError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.name = 'L0HaltSnapshotError';
    this.code = code;
    this.extra = extra;
  }
}

function assertNonNegativeInteger(value, fieldName) {
  if (!Number.isInteger(value) || value < 0) {
    throw new L0HaltSnapshotError(
      `E_L0_HALT_SNAPSHOT_${fieldName.toUpperCase()}_INVALID`,
      `L0 halt snapshot requires a non-negative integer ${fieldName}.`,
      { [fieldName]: value }
    );
  }
}

function cloneBudgetRemaining(budgetRemaining) {
  if (budgetRemaining == null || typeof budgetRemaining !== 'object') {
    throw new L0HaltSnapshotError(
      'E_L0_HALT_SNAPSHOT_BUDGET_MISSING',
      'L0 halt snapshot requires the Phase 9 budgetRemaining object.'
    );
  }
  return {
    maxWallSecondsLeft: budgetRemaining.maxWallSecondsLeft,
    maxIterationsLeft: budgetRemaining.maxIterationsLeft,
    costCeilingLeft: budgetRemaining.costCeilingLeft
  };
}

function assertHaltChecked(haltChecked) {
  if (haltChecked !== true) {
    throw new L0HaltSnapshotError(
      'E_L0_HALT_SNAPSHOT_NOT_CHECKED',
      'L0 halt snapshot cannot run an action before the operator-halt guard has been checked.',
      { haltChecked }
    );
  }
}

export function attachL0HaltSnapshotFields(snapshot, options = {}) {
  if ('budget_left' in options) {
    throw new L0HaltSnapshotError(
      'E_L0_HALT_SNAPSHOT_BUDGET_MANUAL',
      'L0 halt snapshot budget_left must be derived from budgetRemaining, not supplied by the caller.'
    );
  }

  assertNonNegativeInteger(options.iteration, 'iteration');
  assertHaltChecked(options.haltChecked);

  return {
    ...snapshot,
    iteration: options.iteration,
    budget_left: cloneBudgetRemaining(snapshot.budgetRemaining),
    halt_checked: true
  };
}

export async function validateL0HaltResumeSnapshot(projectPath, snapshot) {
  const projectRoot = resolveProjectRoot(projectPath);
  const schemaHostRoot = await resolveSchemaHostRoot(projectRoot, RESUME_SNAPSHOT_SCHEMA_FILE);
  const validate = await loadValidator(schemaHostRoot, RESUME_SNAPSHOT_SCHEMA_FILE);
  assertValid(validate, snapshot, 'phase9 L0 halt resume snapshot');
  return snapshot;
}

export async function writeL0HaltSnapshotBeforeAction({
  projectRoot,
  objectiveRecord,
  activePointer,
  queueState,
  iteration,
  haltChecked,
  action,
  writeOptions = {}
} = {}, deps = {}) {
  assertHaltChecked(haltChecked);

  const writeRuntimeResumeSnapshot = deps.writeRuntimeResumeSnapshot
    ?? AUTONOMY_RUNTIME_INTERNALS.writeRuntimeResumeSnapshot;
  const validateSnapshot = deps.validateSnapshot ?? validateL0HaltResumeSnapshot;
  const atomicWriteJsonImpl = deps.atomicWriteJson ?? atomicWriteJson;

  const baseWrite = await writeRuntimeResumeSnapshot(
    projectRoot,
    objectiveRecord,
    activePointer,
    queueState,
    {
      ...writeOptions,
      writtenReason: writeOptions.writtenReason ?? 'loop-iteration'
    }
  );

  const snapshot = attachL0HaltSnapshotFields(baseWrite.snapshot, {
    iteration,
    haltChecked
  });

  await validateSnapshot(projectRoot, snapshot);
  await atomicWriteJsonImpl(baseWrite.snapshotPath, snapshot);

  const actionResult = typeof action === 'function'
    ? await action({
        snapshot,
        snapshotPath: baseWrite.snapshotPath
      })
    : null;

  return {
    snapshot,
    snapshotPath: baseWrite.snapshotPath,
    actionResult
  };
}
