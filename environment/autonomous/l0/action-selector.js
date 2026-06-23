import { checkDirection as defaultCheckDirection } from '../../directions/check.js';

const SCHEMA_VERSION = 'phase14.tl0.3-next-scientific-action-selector.v1';
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

export class L0ActionSelectorError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.name = 'L0ActionSelectorError';
    this.code = code;
    this.extra = extra;
  }
}

function fail(code, message, extra = {}) {
  throw new L0ActionSelectorError(code, message, extra);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
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

function conditionSatisfied(requiredCondition, suppliedCondition) {
  const required = normalizeCondition(requiredCondition);
  const supplied = normalizeCondition(suppliedCondition);
  if (!required || !supplied) return false;
  return comparable(required.kind) === comparable(supplied.kind)
    && comparable(required.detail) === comparable(supplied.detail);
}

function assertObjectiveRecord(objectiveRecord) {
  if (
    !objectiveRecord
    || typeof objectiveRecord !== 'object'
    || !nonEmptyString(objectiveRecord.objectiveId)
  ) {
    fail(
      'E_L0_SELECTOR_OBJECTIVE_MISSING',
      'TL0.3 selector requires a durable objective record with objectiveId.'
    );
  }
}

function assertOpenGateRecords(openGateRecords) {
  if (!Array.isArray(openGateRecords)) {
    fail(
      'E_L0_SELECTOR_OPEN_GATES_MISSING',
      'TL0.3 selector requires durable open gate records.'
    );
  }
}

function assertCandidates(candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    fail(
      'E_L0_SELECTOR_CANDIDATES_MISSING',
      'TL0.3 selector requires at least one candidate action.'
    );
  }
}

function candidateDirectionTarget(candidate) {
  const direction = candidate.direction ?? {};
  const directionId = normalizeText(direction.directionId ?? candidate.directionId);
  const summary = normalizeText(direction.summary ?? candidate.summary);
  if (!directionId && !summary) {
    fail(
      'E_L0_SELECTOR_DIRECTION_TARGET_MISSING',
      'TL0.3 selector candidates require a directionId or summary.',
      { candidateId: candidate.id ?? null }
    );
  }
  return {
    directionId,
    summary,
    satisfies: direction.satisfies ?? candidate.satisfies
  };
}

function normalizeCandidate(candidate) {
  if (!candidate || typeof candidate !== 'object' || !nonEmptyString(candidate.id)) {
    fail(
      'E_L0_SELECTOR_CANDIDATE_INVALID',
      'TL0.3 selector candidates require a stable id.'
    );
  }
  if (!nonEmptyString(candidate.summary)) {
    fail(
      'E_L0_SELECTOR_CANDIDATE_INVALID',
      'TL0.3 selector candidates require a summary.',
      { candidateId: candidate.id }
    );
  }

  return {
    ...candidate,
    id: candidate.id.trim(),
    actionType: normalizeText(candidate.actionType ?? 'research-next-step'),
    summary: candidate.summary.trim(),
    priority: Number.isFinite(candidate.priority) ? candidate.priority : 0,
    directionTarget: candidateDirectionTarget(candidate)
  };
}

function instinctWeightFor(candidate, instinctWeights) {
  if (!instinctWeights || typeof instinctWeights !== 'object') return 0;
  const byId = instinctWeights[candidate.id];
  if (Number.isFinite(byId)) return byId;
  const byType = instinctWeights[candidate.actionType];
  return Number.isFinite(byType) ? byType : 0;
}

function rankedCandidates(candidates, instinctWeights) {
  return candidates
    .map((candidate) => {
      const normalized = normalizeCandidate(candidate);
      const instinctWeight = instinctWeightFor(normalized, instinctWeights);
      return {
        candidate: normalized,
        instinctWeight,
        score: normalized.priority + instinctWeight
      };
    })
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.candidate.id.localeCompare(right.candidate.id, 'en-US');
    });
}

function projectionChecker(directionProjection) {
  if (!directionProjection || typeof directionProjection !== 'object') {
    return null;
  }

  const records = Object.values(directionProjection);
  return async (_projectRoot, options = {}) => {
    const targetId = normalizeText(options.directionId);
    const targetSummary = comparable(options.summary);
    const blockingRecord = records.find((record) => {
      if (!record || !['killed', 'contradicted'].includes(record.state)) {
        return false;
      }
      return (
        (targetId && record.directionId === targetId)
        || (targetSummary && comparable(record.summary) === targetSummary)
      );
    });

    if (!blockingRecord) {
      return {
        ok: true,
        verdict: 'allow',
        directionId: targetId || undefined,
        summary: options.summary || undefined,
        written: false
      };
    }

    const doNotRepeatUnless = normalizeCondition(blockingRecord.doNotRepeatUnless);
    const allowedByCondition = conditionSatisfied(
      doNotRepeatUnless,
      options.satisfies
    );

    return {
      ok: true,
      verdict: allowedByCondition ? 'allow-with-condition' : 'block',
      directionId: targetId || undefined,
      summary: options.summary || undefined,
      blockingDirectionId: blockingRecord.directionId,
      blockingSummary: blockingRecord.summary,
      blockingState: blockingRecord.state,
      doNotRepeatUnless,
      evidenceRefs: Array.isArray(blockingRecord.evidenceRefs)
        ? [...blockingRecord.evidenceRefs]
        : [],
      written: false
    };
  };
}

function resolveDirectionChecker(input, deps) {
  if (typeof deps.checkDirection === 'function') return deps.checkDirection;
  const injectedProjectionChecker = projectionChecker(input.directionProjection);
  if (injectedProjectionChecker) return injectedProjectionChecker;
  if (nonEmptyString(input.projectRoot)) return defaultCheckDirection;
  fail(
    'E_L0_SELECTOR_DIRECTION_READER_MISSING',
    'TL0.3 selector requires a direction projection, injected checker, or projectRoot.'
  );
}

function highStakes(candidate) {
  return Boolean(candidate.highStakes)
    || HIGH_STAKES_ACTION_TYPES.has(candidate.actionType);
}

function buildProposal({ candidate, directionCheck, score, instinctWeight }) {
  const requiresOperatorGate = highStakes(candidate);
  return {
    schemaVersion: `${SCHEMA_VERSION}.proposal`,
    actionId: candidate.id,
    actionType: candidate.actionType,
    summary: candidate.summary,
    proposalOnly: true,
    actionExecuted: false,
    requiresOperatorGate,
    requiredGate: requiresOperatorGate ? 'TL0.4' : null,
    directionVerdict: directionCheck.verdict,
    directionId: directionCheck.directionId ?? candidate.directionTarget.directionId ?? null,
    doNotRepeatUnless: directionCheck.doNotRepeatUnless ?? null,
    score,
    instinctWeight,
    rationale: candidate.rationale ?? null
  };
}

function buildRationaleArtifact({
  input,
  ranking,
  selected,
  proposal,
  directionCheck
}) {
  return {
    schemaVersion: `${SCHEMA_VERSION}.rationale`,
    objective: {
      objectiveId: input.objectiveRecord.objectiveId,
      title: input.objectiveRecord.title ?? null
    },
    gateInputs: input.openGateRecords.map((gate) => ({
      gateId: gate?.gateId ?? gate?.id ?? null,
      status: gate?.status ?? null
    })),
    ranking: ranking.map((entry, index) => ({
      rank: index + 1,
      actionId: entry.candidate.id,
      actionType: entry.candidate.actionType,
      priority: entry.candidate.priority,
      instinctWeight: entry.instinctWeight,
      score: entry.score
    })),
    selectedAction: proposal,
    directionCheck: {
      verdict: directionCheck.verdict,
      directionId: directionCheck.directionId ?? selected.candidate.directionTarget.directionId ?? null,
      blockingDirectionId: directionCheck.blockingDirectionId ?? null,
      blockingState: directionCheck.blockingState ?? null,
      evidenceRefs: Array.isArray(directionCheck.evidenceRefs)
        ? [...directionCheck.evidenceRefs]
        : [],
      doNotRepeatUnless: directionCheck.doNotRepeatUnless ?? null
    },
    reconstruction: {
      deterministicSort: 'score-desc/actionId-asc',
      selectedRank: 1,
      proposalOnly: true
    }
  };
}

function assertJsonSerializable(value) {
  try {
    JSON.stringify(value);
  } catch (error) {
    fail(
      'E_L0_SELECTOR_RATIONALE_NOT_SERIALIZABLE',
      'TL0.3 selector rationale artifact must be JSON-serializable.',
      { cause: error?.message ?? String(error) }
    );
  }
}

function blockedResult(directionCheck) {
  return {
    ok: false,
    schemaVersion: SCHEMA_VERSION,
    proposalOnly: true,
    actionExecuted: false,
    proposal: null,
    proposals: [],
    blocked: {
      verdict: directionCheck.verdict,
      blockingDirectionId: directionCheck.blockingDirectionId ?? null,
      blockingSummary: directionCheck.blockingSummary ?? null,
      blockingState: directionCheck.blockingState ?? null,
      doNotRepeatUnless: directionCheck.doNotRepeatUnless ?? null,
      evidenceRefs: Array.isArray(directionCheck.evidenceRefs)
        ? [...directionCheck.evidenceRefs]
        : []
    }
  };
}

async function writeArtifactIfRequested(artifact, deps) {
  if (typeof deps.writeRationaleArtifact !== 'function') return null;
  try {
    return await deps.writeRationaleArtifact(artifact);
  } catch (error) {
    fail(
      'E_L0_SELECTOR_ARTIFACT_WRITE_FAILED',
      'TL0.3 selector rationale artifact writer failed; no proposal is returned.',
      { cause: error?.message ?? String(error) }
    );
  }
}

export async function selectNextScientificAction(input = {}, deps = {}) {
  assertObjectiveRecord(input.objectiveRecord);
  assertOpenGateRecords(input.openGateRecords);
  assertCandidates(input.candidates);

  const checkDirection = resolveDirectionChecker(input, deps);
  const ranking = rankedCandidates(input.candidates, input.instinctWeights);
  const selected = ranking[0];
  const directionTarget = selected.candidate.directionTarget;
  const directionCheck = await checkDirection(input.projectRoot, {
    directionId: directionTarget.directionId || undefined,
    summary: directionTarget.summary || undefined,
    satisfies: directionTarget.satisfies
  });

  if (directionCheck?.verdict === 'block') {
    return blockedResult(directionCheck);
  }

  if (!['allow', 'allow-with-condition'].includes(directionCheck?.verdict)) {
    fail(
      'E_L0_SELECTOR_DIRECTION_VERDICT_INVALID',
      'TL0.3 selector received an invalid direction verdict.',
      { verdict: directionCheck?.verdict ?? null }
    );
  }

  const proposal = buildProposal({
    candidate: selected.candidate,
    directionCheck,
    score: selected.score,
    instinctWeight: selected.instinctWeight
  });
  const rationaleArtifact = buildRationaleArtifact({
    input,
    ranking,
    selected,
    proposal,
    directionCheck
  });
  assertJsonSerializable(rationaleArtifact);

  const artifactWrite = await writeArtifactIfRequested(rationaleArtifact, deps);

  return {
    ok: true,
    schemaVersion: SCHEMA_VERSION,
    proposalOnly: true,
    actionExecuted: false,
    runtimeOpened: true,
    autonomousRuntimeAllowed: true,
    proposal,
    proposals: [proposal],
    rationaleArtifact,
    rationaleArtifactPath: artifactWrite?.artifactPath ?? null
  };
}
