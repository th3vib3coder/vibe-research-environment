import {
  atomicWriteJson,
  resolveInside,
  resolveProjectRoot
} from '../../control/_io.js';
import {
  selectNextScientificAction
} from './action-selector.js';
import {
  evaluateL0GuardrailForAction
} from './guardrail-controller.js';
import {
  writeL0HaltSnapshotBeforeAction
} from './halt-snapshot.js';
import {
  evaluateHighStakesGate
} from './high-stakes-gate.js';
import {
  runL0BoundedReasoningLoop
} from './reasoning-loop.js';

const SCHEMA_VERSION = 'phase14.tl0.6-attended-dry-run.v1';
const ALLOWED_RUNTIME_MODE = 'attended-batch';
const REQUIRED_AUTONOMY_TIER = 'L0';
const DRY_RUN_RELATIVE_DIR =
  '.vibe-science-environment/autonomous/l0/dry-run';

export class L0AttendedDryRunError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.name = 'L0AttendedDryRunError';
    this.code = code;
    this.extra = extra;
  }
}

function fail(code, message, extra = {}) {
  throw new L0AttendedDryRunError(code, message, extra);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function assertAutonomyTier(autonomyTier) {
  if (!nonEmptyString(autonomyTier)) {
    fail(
      'E_L0_ATTENDED_DRY_RUN_AUTONOMY_TIER_REQUIRED',
      'TL0.6 attended dry run requires an explicit L0 autonomy tier.'
    );
  }
  if (autonomyTier.trim() !== REQUIRED_AUTONOMY_TIER) {
    fail(
      'E_L0_ATTENDED_DRY_RUN_AUTONOMY_TIER_FORBIDDEN',
      'TL0.6 attended dry run only accepts the L0 autonomy tier.',
      { autonomyTier }
    );
  }
}

function assertRuntimeMode(runtimeMode) {
  if (runtimeMode === 'unattended-batch') {
    fail(
      'E_L0_ATTENDED_DRY_RUN_UNATTENDED_FORBIDDEN',
      'TL0.6 attended dry run forbids unattended-batch runtime.'
    );
  }
  if (runtimeMode !== ALLOWED_RUNTIME_MODE) {
    fail(
      'E_L0_ATTENDED_DRY_RUN_RUNTIME_MODE_FORBIDDEN',
      'TL0.6 attended dry run only accepts attended-batch runtime.',
      { runtimeMode: runtimeMode ?? null }
    );
  }
}

function assertSafeArtifactName(name) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(name)) {
    fail(
      'E_L0_ATTENDED_DRY_RUN_ARTIFACT_NAME_UNSAFE',
      'TL0.6 attended dry run artifact names must be safe record filenames.',
      { name }
    );
  }
}

function assertObjectiveRecord(objectiveRecord) {
  if (!objectiveRecord || !nonEmptyString(objectiveRecord.objectiveId)) {
    fail(
      'E_L0_ATTENDED_DRY_RUN_OBJECTIVE_MISSING',
      'TL0.6 attended dry run requires a durable objective record.'
    );
  }
}

function assertOperatorGo(operatorGoText) {
  if (!nonEmptyString(operatorGoText)) {
    fail(
      'E_L0_ATTENDED_DRY_RUN_OPERATOR_GO_REQUIRED',
      'TL0.6 attended dry run resume requires explicit operator GO text.'
    );
  }
}

function dryRunArtifactPath(projectRoot, name) {
  assertSafeArtifactName(name);
  return resolveInside(
    resolveProjectRoot(projectRoot),
    ...DRY_RUN_RELATIVE_DIR.split('/'),
    `${name}.json`
  );
}

async function defaultWriteDryRunArtifact(name, artifact, options = {}) {
  if (!nonEmptyString(options.projectRoot)) {
    fail(
      'E_L0_ATTENDED_DRY_RUN_PROJECT_ROOT_REQUIRED',
      'TL0.6 attended dry run default artifact writer requires projectRoot.'
    );
  }

  const artifactPath = dryRunArtifactPath(options.projectRoot, name);
  await atomicWriteJson(artifactPath, artifact);
  return {
    artifact,
    artifactPath,
    artifactRelativePath: `${DRY_RUN_RELATIVE_DIR}/${name}.json`
  };
}

async function writeArtifact(name, artifact, input, deps) {
  const writer = deps.writeDryRunArtifact
    ?? ((artifactName, value) =>
      defaultWriteDryRunArtifact(artifactName, value, {
        projectRoot: input.projectRoot
      }));
  return writer(name, artifact);
}

function proposalToAction(proposal) {
  return {
    id: proposal.actionId,
    kind: proposal.actionType,
    actionType: proposal.actionType,
    summary: proposal.summary,
    requiredTier: 'worker',
    highStakes: proposal.requiresOperatorGate === true,
    requiresOperatorGate: proposal.requiresOperatorGate === true,
    run: async () => {
      fail(
        'E_L0_ATTENDED_DRY_RUN_HIGH_STAKES_EXECUTED',
        'TL0.6 attended dry run high-stakes proposal must stop before execution.',
        { actionId: proposal.actionId }
      );
    }
  };
}

function buildResumeAction(proposal) {
  return {
    id: proposal.actionId,
    kind: 'operator-approved-dry-run-resume',
    requiredTier: 'worker',
    summary: proposal.summary,
    originalActionType: proposal.actionType,
    directionId: proposal.directionId ?? null
  };
}

function materializeResumeAction(action, operatorGoText) {
  if (!action || !nonEmptyString(action.id)) {
    fail(
      'E_L0_ATTENDED_DRY_RUN_RESUME_ACTION_MISSING',
      'TL0.6 attended dry run reconstruction requires a resumable action.'
    );
  }

  return {
    ...cloneJson(action),
    run: async ({ snapshotContext } = {}) => ({
      dryRunResumed: true,
      actionId: action.id,
      operatorGoText,
      snapshotPath: snapshotContext?.snapshotPath ?? null
    })
  };
}

function loopDeps(deps) {
  return {
    ...deps,
    evaluateHighStakesGate:
      deps.evaluateHighStakesGate ?? evaluateHighStakesGate,
    evaluateL0GuardrailForAction:
      deps.evaluateL0GuardrailForAction ?? evaluateL0GuardrailForAction,
    writeL0HaltSnapshotBeforeAction:
      deps.writeL0HaltSnapshotBeforeAction ?? writeL0HaltSnapshotBeforeAction
  };
}

function buildReconstruction({
  input,
  selectorResult,
  loopResult,
  artifactWrites
}) {
  const proposal = selectorResult.proposal;
  return {
    schemaVersion: `${SCHEMA_VERSION}.reconstruction`,
    source: 'persisted-artifacts',
    resumeRequiresOperatorGo: true,
    runtimeMode: input.runtimeMode,
    autonomyTier: input.autonomyTier,
    objectiveRecord: cloneJson(input.objectiveRecord),
    activePointer: cloneJson(input.activePointer ?? {
      objectiveId: input.objectiveRecord.objectiveId,
      queueId: 'tl0.6-dry-run',
      index: 0
    }),
    queueState: cloneJson(input.queueState ?? {
      queueId: 'tl0.6-dry-run',
      queued: [proposal.actionId]
    }),
    selectedAction: cloneJson(proposal),
    resumeAction: buildResumeAction(proposal),
    artifacts: {
      selectorRationale:
        artifactWrites.selector?.artifactRelativePath
          ?? artifactWrites.selector?.artifactPath
          ?? null,
      operatorGate:
        loopResult.highStakesGate?.gateRecordRelativePath
          ?? loopResult.highStakesGate?.gateRecordPath
          ?? artifactWrites.operatorGate?.artifactRelativePath
          ?? artifactWrites.operatorGate?.artifactPath
          ?? null
    }
  };
}

export async function runL0AttendedDryRun(input = {}, deps = {}) {
  assertAutonomyTier(input.autonomyTier);
  assertRuntimeMode(input.runtimeMode);
  assertObjectiveRecord(input.objectiveRecord);

  const artifactWrites = {};
  const selectorResult = await selectNextScientificAction(input, {
    checkDirection: deps.checkDirection,
    writeRationaleArtifact: async (artifact) => {
      artifactWrites.selector = await writeArtifact(
        'selector-rationale',
        artifact,
        input,
        deps
      );
      return {
        artifactPath: artifactWrites.selector.artifactPath,
        artifactRelativePath: artifactWrites.selector.artifactRelativePath
      };
    }
  });

  if (selectorResult.ok !== true || !selectorResult.proposal) {
    const summary = {
      ok: false,
      schemaVersion: SCHEMA_VERSION,
      stopReason: 'selector-blocked',
      runtimeOpened: false,
      autonomousRuntimeAllowed: false,
      selector: selectorResult
    };
    artifactWrites.summary = await writeArtifact(
      'dry-run-summary',
      summary,
      input,
      deps
    );
    return summary;
  }

  const loopInput = {
    ...input,
    actions: [proposalToAction(selectorResult.proposal)],
    maxIterations: 1,
    tier: input.tier ?? 'worker'
  };
  const loopResult = await runL0BoundedReasoningLoop(loopInput, loopDeps(deps));

  if (loopResult.highStakesGate?.gateRecord) {
    artifactWrites.operatorGate = await writeArtifact(
      'operator-gate',
      loopResult.highStakesGate.gateRecord,
      input,
      deps
    );
  }

  const reconstruction = buildReconstruction({
    input,
    selectorResult,
    loopResult,
    artifactWrites
  });

  const summary = {
    ok: true,
    schemaVersion: SCHEMA_VERSION,
    stopReason: loopResult.stopReason,
    actionExecuted: false,
    runtimeOpened: false,
    autonomousRuntimeAllowed: false,
    selector: selectorResult,
    loop: loopResult,
    reconstruction
  };
  artifactWrites.summary = await writeArtifact(
    'dry-run-summary',
    summary,
    input,
    deps
  );

  return summary;
}

export async function resumeL0AttendedDryRun(input = {}, deps = {}) {
  assertAutonomyTier(input.autonomyTier);
  assertRuntimeMode(input.runtimeMode);
  assertOperatorGo(input.operatorGoText);

  const reconstruction = input.reconstruction;
  if (
    !reconstruction
    || reconstruction.source !== 'persisted-artifacts'
    || reconstruction.resumeRequiresOperatorGo !== true
  ) {
    fail(
      'E_L0_ATTENDED_DRY_RUN_RECONSTRUCTION_INVALID',
      'TL0.6 attended dry run resume requires persisted reconstruction artifacts.'
    );
  }

  assertObjectiveRecord(reconstruction.objectiveRecord);
  const action = materializeResumeAction(
    reconstruction.resumeAction,
    input.operatorGoText
  );

  return runL0BoundedReasoningLoop({
    projectRoot: input.projectRoot,
    objectiveRecord: reconstruction.objectiveRecord,
    activePointer: reconstruction.activePointer,
    queueState: reconstruction.queueState,
    runtimeMode: input.runtimeMode,
    tier: input.tier ?? 'worker',
    maxIterations: 1,
    budgetRemaining: input.budgetRemaining ?? {
      maxWallSecondsLeft: 60,
      maxIterationsLeft: 1,
      costCeilingLeft: null
    },
    haltChecked: true,
    actions: [action],
    priorOperatorGoText: input.operatorGoText,
    writeOptions: input.writeOptions
  }, loopDeps(deps));
}

export {
  DRY_RUN_RELATIVE_DIR,
  SCHEMA_VERSION as L0_ATTENDED_DRY_RUN_SCHEMA_VERSION
};
