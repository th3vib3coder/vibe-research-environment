import {
  writeL0HaltSnapshotBeforeAction
} from './halt-snapshot.js';
import {
  evaluateHighStakesGate
} from './high-stakes-gate.js';

const ALLOWED_RUNTIME_MODE = 'attended-batch';
const TIER_RANK = Object.freeze({
  chat: 0,
  reasoning: 1,
  worker: 2
});

const FORBIDDEN_ACTION_ERRORS = Object.freeze({
  'promote-claim': 'E_L0_LOOP_CLAIM_PROMOTION_FORBIDDEN',
  'write-accepted-claim-edge': 'E_L0_LOOP_CLAIM_EDGE_FORBIDDEN',
  export: 'E_L0_LOOP_EXPORT_FORBIDDEN',
  graphify: 'E_L0_LOOP_GRAPHIFY_FORBIDDEN'
});

export class L0ReasoningLoopError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.name = 'L0ReasoningLoopError';
    this.code = code;
    this.extra = extra;
  }
}

function assertRuntimeMode(runtimeMode) {
  if (runtimeMode === 'unattended-batch') {
    throw new L0ReasoningLoopError(
      'E_L0_LOOP_UNATTENDED_FORBIDDEN',
      'TL0.2 L0 reasoning loop forbids unattended-batch runtime.'
    );
  }

  if (runtimeMode !== ALLOWED_RUNTIME_MODE) {
    throw new L0ReasoningLoopError(
      'E_L0_LOOP_RUNTIME_MODE_FORBIDDEN',
      'TL0.2 L0 reasoning loop only accepts attended-batch runtime.',
      { runtimeMode: runtimeMode ?? null }
    );
  }
}

function assertNonNegativeInteger(value, fieldName) {
  if (!Number.isInteger(value) || value < 0) {
    throw new L0ReasoningLoopError(
      `E_L0_LOOP_${fieldName.toUpperCase()}_INVALID`,
      `TL0.2 L0 reasoning loop requires a non-negative integer ${fieldName}.`,
      { [fieldName]: value }
    );
  }
}

function normalizeTier(tier) {
  if (!Object.hasOwn(TIER_RANK, tier)) {
    throw new L0ReasoningLoopError(
      'E_L0_LOOP_TIER_INVALID',
      'TL0.2 L0 reasoning loop requires chat, reasoning, or worker tier.',
      { tier: tier ?? null }
    );
  }
  return tier;
}

function cloneBudget(budgetRemaining) {
  if (budgetRemaining == null || typeof budgetRemaining !== 'object') {
    throw new L0ReasoningLoopError(
      'E_L0_LOOP_BUDGET_MISSING',
      'TL0.2 L0 reasoning loop requires a Phase 9 budgetRemaining object.'
    );
  }
  return {
    maxWallSecondsLeft: budgetRemaining.maxWallSecondsLeft,
    maxIterationsLeft: budgetRemaining.maxIterationsLeft,
    costCeilingLeft: budgetRemaining.costCeilingLeft
  };
}

function isBudgetExhausted(budgetRemaining) {
  return budgetRemaining.maxIterationsLeft <= 0
    || budgetRemaining.maxWallSecondsLeft <= 0
    || (
      budgetRemaining.costCeilingLeft != null
      && budgetRemaining.costCeilingLeft <= 0
    );
}

function spendOneIteration(budgetRemaining) {
  return {
    ...budgetRemaining,
    maxIterationsLeft: budgetRemaining.maxIterationsLeft == null
      ? budgetRemaining.maxIterationsLeft
      : budgetRemaining.maxIterationsLeft - 1
  };
}

function assertActionAllowed(action, tier) {
  const kind = action?.kind;
  const forbiddenCode = FORBIDDEN_ACTION_ERRORS[kind];
  if (forbiddenCode) {
    throw new L0ReasoningLoopError(
      forbiddenCode,
      `TL0.2 L0 reasoning loop forbids ${kind} actions.`,
      { actionId: action?.id ?? null, kind }
    );
  }

  const requiredTier = action?.requiredTier ?? 'reasoning';
  if (!Object.hasOwn(TIER_RANK, requiredTier)) {
    throw new L0ReasoningLoopError(
      'E_L0_LOOP_ACTION_TIER_INVALID',
      'TL0.2 L0 reasoning loop action has an invalid requiredTier.',
      { actionId: action?.id ?? null, requiredTier }
    );
  }

  if (TIER_RANK[tier] < TIER_RANK[requiredTier]) {
    throw new L0ReasoningLoopError(
      'E_L0_LOOP_TIER_FORBIDDEN',
      'TL0.2 L0 reasoning loop tier cannot execute this action.',
      { tier, actionId: action?.id ?? null, requiredTier }
    );
  }
}

function stopResult({
  runtimeMode,
  tier,
  iterationsRun,
  budgetRemaining,
  results,
  stopReason
}) {
  return {
    ok: true,
    schemaVersion: 'phase14.tl0.2-l0-bounded-reasoning-loop.v1',
    runtimeMode,
    tier,
    runtimeOpened: true,
    autonomousRuntimeAllowed: true,
    iterationsRun,
    stopReason,
    budgetRemaining,
    results
  };
}

export async function runL0BoundedReasoningLoop(input = {}, deps = {}) {
  const runtimeMode = input.runtimeMode;
  assertRuntimeMode(runtimeMode);
  const tier = normalizeTier(input.tier ?? 'reasoning');
  const maxIterations = input.maxIterations ?? 1;
  assertNonNegativeInteger(maxIterations, 'maxIterations');

  const actions = Array.isArray(input.actions) ? input.actions : [];
  let budgetRemaining = cloneBudget(input.budgetRemaining);
  const results = [];
  const writeAhead = deps.writeL0HaltSnapshotBeforeAction
    ?? writeL0HaltSnapshotBeforeAction;
  const evaluateGate = deps.evaluateHighStakesGate
    ?? evaluateHighStakesGate;

  if (maxIterations === 0) {
    return stopResult({
      runtimeMode,
      tier,
      iterationsRun: 0,
      budgetRemaining,
      results,
      stopReason: 'max-iterations'
    });
  }

  if (isBudgetExhausted(budgetRemaining)) {
    return stopResult({
      runtimeMode,
      tier,
      iterationsRun: 0,
      budgetRemaining,
      results,
      stopReason: 'budget-exhausted'
    });
  }

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    if (isBudgetExhausted(budgetRemaining)) {
      return stopResult({
        runtimeMode,
        tier,
        iterationsRun: results.length,
        budgetRemaining,
        results,
        stopReason: 'budget-exhausted'
      });
    }

    const action = actions[iteration];
    if (!action) {
      return stopResult({
        runtimeMode,
        tier,
        iterationsRun: results.length,
        budgetRemaining,
        results,
        stopReason: 'action-queue-empty'
      });
    }

    assertActionAllowed(action, tier);

    const gateResult = await evaluateGate({
      action,
      iteration,
      objectiveRecord: input.objectiveRecord,
      priorOperatorGoText: input.priorOperatorGoText,
      projectRoot: input.projectRoot
    }, deps);
    if (gateResult.ok === false) {
      return {
        ...stopResult({
          runtimeMode,
          tier,
          iterationsRun: results.length,
          budgetRemaining,
          results,
          stopReason: gateResult.stopReason ?? 'high-stakes-operator-gate'
        }),
        highStakesGate: gateResult,
        runtimeOpened: false,
        autonomousRuntimeAllowed: false
      };
    }

    const writeAheadResult = await writeAhead({
      projectRoot: input.projectRoot,
      objectiveRecord: input.objectiveRecord,
      activePointer: input.activePointer,
      queueState: input.queueState,
      iteration,
      haltChecked: input.haltChecked,
      action: async (snapshotContext) => action.run({
        iteration,
        budgetRemaining,
        tier,
        snapshotContext
      }),
      writeOptions: input.writeOptions
    });

    results.push({
      actionId: action.id ?? `iteration-${iteration}`,
      kind: action.kind ?? null,
      result: writeAheadResult.actionResult,
      snapshotPath: writeAheadResult.snapshotPath
    });
    budgetRemaining = spendOneIteration(budgetRemaining);
  }

  return stopResult({
    runtimeMode,
    tier,
    iterationsRun: results.length,
    budgetRemaining,
    results,
    stopReason: isBudgetExhausted(budgetRemaining)
      ? 'budget-exhausted'
      : 'max-iterations'
  });
}
