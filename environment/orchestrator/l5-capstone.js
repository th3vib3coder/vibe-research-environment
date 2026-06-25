const SCHEMA_VERSION = 'phase14.t26.0-l5-capstone-cycle.v1';

export const L5_CAPSTONE_STAGE_IDS = Object.freeze([
  'objective',
  'literature-gap',
  'hypothesis',
  'sanctioned-analysis',
  'validation',
  'claim',
  'writeup'
]);

const HIGH_STAKES_STAGE_IDS = new Set([
  'sanctioned-analysis',
  'claim',
  'writeup'
]);

const REVIEW_METADATA_KINDS = new Set([
  'adversarial-verdict',
  'relay-verdict',
  'review-output',
  'review-text',
  'chat-output'
]);

export class L5CapstoneCycleError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.name = 'L5CapstoneCycleError';
    this.code = code;
    this.extra = extra;
  }
}

function fail(code, message, extra = {}) {
  throw new L5CapstoneCycleError(code, message, extra);
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function nonEmptyString(value) {
  return normalizeText(value) !== '';
}

function comparable(value) {
  return normalizeText(value).toLocaleLowerCase('en-US');
}

function normalizeCondition(condition) {
  if (!condition || typeof condition !== 'object') return null;
  const kind = normalizeText(condition.kind);
  const detail = normalizeText(condition.detail);
  if (!kind || !detail) return null;
  return { kind, detail };
}

function conditionsMatch(requiredCondition, suppliedCondition) {
  const required = normalizeCondition(requiredCondition);
  const supplied = normalizeCondition(suppliedCondition);
  if (!required || !supplied) return false;
  return comparable(required.kind) === comparable(supplied.kind)
    && comparable(required.detail) === comparable(supplied.detail);
}

function assertEligibleRuntime(input) {
  if (input?.autonomyTier !== 'L5') {
    fail(
      'E_PHASE14_L5_TIER_REQUIRED',
      'T26.0 requires explicit autonomyTier "L5".'
    );
  }

  if (input?.runtimeMode === 'unattended-batch') {
    fail(
      'E_PHASE14_L5_UNATTENDED_FORBIDDEN',
      'T26.0 is attended-batch only; unattended L5 is closed.'
    );
  }

  if (input?.runtimeMode !== 'attended-batch') {
    fail(
      'E_PHASE14_L5_MODE_REQUIRED',
      'T26.0 requires explicit runtimeMode "attended-batch".'
    );
  }
}

function assertObjectiveRecord(objectiveRecord) {
  if (!objectiveRecord || typeof objectiveRecord !== 'object') {
    fail(
      'E_PHASE14_L5_OBJECTIVE_REQUIRED',
      'T26.0 requires a durable objective record.'
    );
  }

  if (!nonEmptyString(objectiveRecord.objectiveId)) {
    fail(
      'E_PHASE14_L5_OBJECTIVE_REQUIRED',
      'T26.0 objective record requires objectiveId.'
    );
  }
}

function assertDirectionTarget(directionTarget) {
  if (!directionTarget || typeof directionTarget !== 'object') {
    fail(
      'E_PHASE14_L5_DIRECTION_TARGET_REQUIRED',
      'T26.0 requires a direction target before the cycle starts.'
    );
  }

  if (
    !nonEmptyString(directionTarget.directionId)
    && !nonEmptyString(directionTarget.summary)
  ) {
    fail(
      'E_PHASE14_L5_DIRECTION_TARGET_REQUIRED',
      'T26.0 direction target requires directionId or summary.'
    );
  }
}

function assertPlannerProposal(input) {
  const proposal = input?.plannerProposal;
  if (!proposal) return;
  const source = comparable(proposal.source);

  if (source === 'chat' || source === 'chat-output') {
    fail(
      'E_PHASE14_L5_CHAT_AUTHORITY_FORBIDDEN',
      'T26.0 refuses chat-backed proposal input as authoritative state.'
    );
  }
}

function assertNoClosedWriters(input, deps) {
  if (input?.authoritativeKnowledgeWrite === true) {
    fail(
      'E_PHASE14_L5_AUTHORITATIVE_WRITE_FORBIDDEN',
      'T26.0 keeps L2-authoritative knowledge writes closed.'
    );
  }

  if (typeof deps?.writeAuthoritativeKnowledgePage === 'function') {
    fail(
      'E_PHASE14_L5_AUTHORITATIVE_WRITE_FORBIDDEN',
      'T26.0 must not receive an authoritative knowledge-page writer.'
    );
  }
}

function assertProvenanceRefs(input) {
  const refs = Array.isArray(input?.provenanceRefs) ? input.provenanceRefs : [];
  for (const ref of refs) {
    const kind = [
      ref?.kind,
      ref?.type,
      ref?.provenanceClass,
      ref?.sourceType,
      ref?.targetType,
      ref?.targetRef?.kind,
      ref?.targetRef?.type
    ].map(comparable).find((candidate) => REVIEW_METADATA_KINDS.has(candidate));
    if (REVIEW_METADATA_KINDS.has(kind)) {
      fail(
        'E_PHASE14_L5_REVIEW_METADATA_NOT_PROVENANCE',
        'T26.0 keeps relay/review/adversarial metadata out of science provenance.',
        { kind }
      );
    }
  }
}

function assertStaticInputs(input, deps) {
  assertEligibleRuntime(input);
  assertObjectiveRecord(input.objectiveRecord);
  assertDirectionTarget(input.directionTarget);
  assertPlannerProposal(input);
  assertProvenanceRefs(input);
  assertNoClosedWriters(input, deps);
}

async function readDirectionMemory(input, deps) {
  if (typeof deps.checkDirectionStatus !== 'function') {
    fail(
      'E_PHASE14_L5_DIRECTION_READER_REQUIRED',
      'T26.0 requires an injected direction-memory reader.'
    );
  }

  const result = await deps.checkDirectionStatus(input.directionTarget);
  const verdict = normalizeText(result?.verdict);
  if (!['allow', 'allow-with-condition', 'block'].includes(verdict)) {
    fail(
      'E_PHASE14_L5_DIRECTION_VERDICT_INVALID',
      'T26.0 direction-memory reader returned an invalid verdict.',
      { verdict: result?.verdict ?? null }
    );
  }

  if (verdict === 'allow') return { ...result, verdict };

  if (verdict === 'allow-with-condition') {
    if (conditionsMatch(result?.doNotRepeatUnless, input.directionTarget?.satisfies)) {
      return { ...result, verdict };
    }

    fail(
      'E_PHASE14_L5_DIRECTION_CONDITION_UNSATISFIED',
      'T26.0 conditional direction re-entry requires a matched condition.',
      {
        doNotRepeatUnless: normalizeCondition(result?.doNotRepeatUnless),
        suppliedCondition: normalizeCondition(input.directionTarget?.satisfies)
      }
    );
  }

  if (
    conditionsMatch(result?.doNotRepeatUnless, input.directionTarget?.satisfies)
  ) {
    return {
      ...result,
      verdict: 'allow-with-condition'
    };
  }

  fail(
    'E_PHASE14_L5_DIRECTION_BLOCKED',
    'T26.0 refuses killed or contradicted direction re-entry.',
    {
      blockingDirectionId: result?.blockingDirectionId ?? null,
      blockingState: result?.blockingState ?? null,
      doNotRepeatUnless: normalizeCondition(result?.doNotRepeatUnless)
    }
  );
}

function stageRunner(deps, stageId) {
  const runner = deps?.stageRunners?.[stageId];
  if (typeof runner !== 'function') {
    fail(
      'E_PHASE14_L5_STAGE_DEPENDENCY_REQUIRED',
      'T26.0 requires an injected runner for each capstone stage.',
      { stageId }
    );
  }
  return runner;
}

function acceptedOperatorGate(input, stageId) {
  const gate = input?.operatorGateResults?.[stageId];
  if (!gate || typeof gate !== 'object') return null;
  if (gate.verdict !== 'accepted' || gate.reviewed !== true) return null;
  return {
    stageId,
    verdict: 'accepted',
    reviewed: true,
    operator: normalizeText(gate.operator) || null,
    evidenceRef: normalizeText(gate.evidenceRef) || null
  };
}

function haltForGate(stageId) {
  return {
    ok: false,
    schemaVersion: SCHEMA_VERSION,
    proposalOnly: true,
    runtimeOpened: false,
    autonomousRuntimeAllowed: false,
    halt: {
      reason: 'high-stakes-operator-gate-required',
      stageId,
      requiredGate: 'reviewed-operator-gate',
      actionExecuted: false,
      runtimeOpened: false
    },
    stageIds: [...L5_CAPSTONE_STAGE_IDS],
    stages: [],
    claimCreated: false,
    claimEdgeWritten: false,
    exportOpened: false,
    graphifyOpened: false
  };
}

function normalizePlannerProposal(proposal) {
  if (!proposal || typeof proposal !== 'object') {
    return null;
  }

  return {
    source: normalizeText(proposal.source) || null,
    proposalId: normalizeText(proposal.proposalId) || null,
    summary: normalizeText(proposal.summary ?? proposal.text) || null,
    proposalOnly: true,
    promoteToClaim: false,
    claimCreated: false,
    exportOpened: false
  };
}

function baseCyclePacket(input, directionMemory) {
  return {
    ok: true,
    schemaVersion: SCHEMA_VERSION,
    autonomyTier: 'L5',
    runtimeMode: 'attended-batch',
    proposalOnly: true,
    runtimeOpened: true,
    autonomousRuntimeAllowed: true,
    unattendedRuntimeOpened: false,
    providerAutomationInvoked: false,
    obdkInvoked: false,
    reviewedApiAutomationInvoked: false,
    realDataRead: false,
    biomedicalClaimAuthority: false,
    claimCreated: false,
    claimEdgeWritten: false,
    exportOpened: false,
    graphifyOpened: false,
    cliDispatchOpened: false,
    browserGuiOpened: false,
    childProcessOpened: false,
    persistentPhase12WriterOpened: false,
    objectiveRecord: {
      objectiveId: input.objectiveRecord.objectiveId,
      title: input.objectiveRecord.title ?? null
    },
    directionMemory,
    plannerProposal: normalizePlannerProposal(input.plannerProposal),
    stageIds: [...L5_CAPSTONE_STAGE_IDS],
    stages: [],
    reconstruction: {
      coldReconstructable: true,
      source: 'objective-plus-cycle-packet',
      chatStateUsed: false,
      stageOrder: [...L5_CAPSTONE_STAGE_IDS]
    }
  };
}

async function runStage({ input, deps, packet, stageId, directionMemory }) {
  const highStakes = HIGH_STAKES_STAGE_IDS.has(stageId);
  const operatorGate = highStakes ? acceptedOperatorGate(input, stageId) : null;

  if (highStakes && !operatorGate) {
    return haltForGate(stageId);
  }

  const runner = stageRunner(deps, stageId);
  const result = await runner({
    stageId,
    objectiveRecord: packet.objectiveRecord,
    directionMemory,
    plannerProposal: packet.plannerProposal,
    proposalOnly: true
  });

  packet.stages.push({
    stageId,
    highStakes,
    operatorGate,
    status: 'completed',
    result: result ?? null,
    proposalOnly: true,
    claimCreated: false,
    claimEdgeWritten: false,
    exportOpened: false,
    graphifyOpened: false
  });

  return null;
}

export async function runL5CapstoneCycle(input = {}, deps = {}) {
  assertStaticInputs(input, deps);
  const directionMemory = await readDirectionMemory(input, deps);
  const packet = baseCyclePacket(input, directionMemory);

  for (const stageId of L5_CAPSTONE_STAGE_IDS) {
    const halt = await runStage({
      input,
      deps,
      packet,
      stageId,
      directionMemory
    });
    if (halt) {
      return {
        ...halt,
        stages: packet.stages
      };
    }
  }

  return packet;
}
