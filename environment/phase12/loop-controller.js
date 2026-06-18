import { validatePhase12ArtifactSet } from './artifact-contracts.js';

export const PHASE12_LOOP_STOP_STATES = Object.freeze([
  'ACCEPTED',
  'BLOCKED',
  'BUDGET_EXHAUSTED',
  'ITERATION_LIMIT_REACHED',
  'STALE_CONTEXT',
  'SCHEMA_INVALID',
  'ABORTED_BY_OPERATOR'
]);

function issue(code, message, extra = {}) {
  return { code, message, ...extra };
}

function numberOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function minutesBetween(start, end) {
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return 0;
  }
  return Math.max(0, (endMs - startMs) / 60000);
}

function collectEvidenceRefs(evidenceBundle) {
  const refs = [
    ...(evidenceBundle?.artifacts ?? []).map((artifact) => ({
      kind: artifact.type,
      path: artifact.path,
      sha256: artifact.sha256
    })),
    ...(evidenceBundle?.reviewArtifacts ?? []).map((artifact) => ({
      kind: artifact.type,
      path: artifact.path,
      sha256: artifact.sha256
    })),
    ...(evidenceBundle?.validation ?? []).map((artifact) => ({
      kind: artifact.type ?? 'validation',
      path: artifact.evidenceRef,
      sha256: artifact.sha256
    }))
  ];

  return refs
    .filter((ref) => typeof ref.path === 'string')
    .sort((left, right) => left.path.localeCompare(right.path));
}

function baseResult(input) {
  return {
    ok: false,
    phase12: true,
    controllerMode: 'pure-in-memory-single-step',
    runId: input?.run?.runId ?? null,
    finalState: 'BLOCKED',
    terminal: true,
    stepCount: 1,
    runStateCreated: false,
    providerAutomationInvoked: false,
    governanceEvents: [],
    evidenceRefs: collectEvidenceRefs(input?.evidenceBundle),
    issues: []
  };
}

function stop(result, finalState, issues = []) {
  return {
    ...result,
    ok: finalState === 'ACCEPTED',
    finalState,
    issues: [...result.issues, ...issues]
  };
}

function capSnapshot(input) {
  const run = input?.run ?? {};
  const finalVerdict = input?.finalVerdict ?? {};
  return {
    maxIterations: numberOr(run.maxIterations, 3),
    maxTurns: numberOr(run.budget?.maxTurns, 8),
    maxWallMinutes: numberOr(run.budget?.maxWallMinutes, 60),
    iterationsUsed: numberOr(input?.iterationsUsed, numberOr(finalVerdict.iterationsUsed, 0)),
    turnsUsed: numberOr(input?.turnsUsed, 0)
  };
}

export function evaluatePhase12LoopStep(input = {}, options = {}) {
  const result = baseResult(input);
  const run = input.run ?? {};
  const review = input.review ?? {};
  const finalVerdict = input.finalVerdict ?? {};
  const requestedSteps = numberOr(input.requestedSteps, 1);

  if (requestedSteps !== 1) {
    return stop(result, 'SCHEMA_INVALID', [
      issue(
        'E_PHASE12_MULTI_STEP_FORBIDDEN',
        'Phase 12 controller may advance at most one step per call.',
        { requestedSteps }
      )
    ]);
  }

  if (input.writebackRequested === true) {
    return stop(result, 'SCHEMA_INVALID', [
      issue(
        'E_PHASE12_LIVE_WRITEBACK_FORBIDDEN',
        'T12.4.0 controller cannot append live governance events or run state.'
      )
    ]);
  }

  if (input.abortRequested === true) {
    return stop(result, 'ABORTED_BY_OPERATOR');
  }

  if (run.state === 'STALE') {
    return stop(result, 'STALE_CONTEXT', [
      issue('E_PHASE12_STALE_CONTEXT', 'Stale relay run cannot advance.')
    ]);
  }

  if (run.providerAutomationAllowed !== false || run.guiAutomationAllowed !== false) {
    return stop(result, 'SCHEMA_INVALID', [
      issue(
        'E_PHASE12_PROVIDER_OR_GUI_AUTOMATION_FORBIDDEN',
        'Pure controller cannot authorize provider or GUI automation.'
      )
    ]);
  }

  if (run.relaySubstrate !== 'filesystem') {
    return stop(result, 'SCHEMA_INVALID', [
      issue(
        'E_PHASE12_GUI_CLIPBOARD_FORBIDDEN',
        'Phase 12 controller accepts filesystem relay artifacts only.'
      )
    ]);
  }

  const semantic = validatePhase12ArtifactSet(input);
  if (!semantic.ok) {
    return stop(result, 'SCHEMA_INVALID', semantic.issues);
  }

  const caps = capSnapshot(input);
  if (caps.iterationsUsed >= caps.maxIterations) {
    return stop(result, 'ITERATION_LIMIT_REACHED', [
      issue('E_PHASE12_ITERATION_LIMIT_REACHED', 'Iteration cap reached.', caps)
    ]);
  }

  if (caps.turnsUsed >= caps.maxTurns) {
    return stop(result, 'BUDGET_EXHAUSTED', [
      issue('E_PHASE12_TURN_BUDGET_EXHAUSTED', 'Turn budget exhausted.', caps)
    ]);
  }

  const now = options.now ?? input.now ?? new Date().toISOString();
  const ageMinutes = minutesBetween(run.createdAt ?? run.updatedAt, now);
  if (ageMinutes > caps.maxWallMinutes) {
    return stop(result, 'STALE_CONTEXT', [
      issue(
        'E_PHASE12_WALL_CLOCK_STALE',
        'Relay run exceeded the wall-clock cap.',
        { ageMinutes, maxWallMinutes: caps.maxWallMinutes }
      )
    ]);
  }

  if (review.verdict === 'ACCEPT'
    && finalVerdict.accepted === true
    && finalVerdict.finalState === 'ACCEPTED') {
    return stop(result, 'ACCEPTED');
  }

  return stop(result, 'BLOCKED', [
    issue(
      'E_PHASE12_REVIEW_NOT_ACCEPTED',
      'Controller stops when the current relay review is not an accepted final verdict.',
      { verdict: review.verdict, finalState: finalVerdict.finalState }
    )
  ]);
}
