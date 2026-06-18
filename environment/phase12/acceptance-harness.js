import { createHash } from 'node:crypto';

import { validatePhase12ArtifactSet } from './artifact-contracts.js';
import { evaluatePhase12LoopStep } from './loop-controller.js';
import { validatePhase12BridgeReview } from './bridge-validators.js';

export const REQUIRED_ACCEPTANCE_SCENARIOS = Object.freeze([
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  'G',
  'H'
]);

const DELEGATED_VALIDATORS = Object.freeze([
  'validatePhase12ArtifactSet',
  'evaluatePhase12LoopStep',
  'validatePhase12BridgeReview'
]);

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function pushIssue(issues, code, message, details = {}) {
  issues.push({ code, message, ...details });
}

function withSource(issue, source) {
  return { ...issue, source };
}

function collectEvidenceRefs(evidenceBundle) {
  return [
    ...asArray(evidenceBundle?.artifacts).map((artifact) => ({
      path: artifact.path,
      sha256: artifact.sha256,
      type: artifact.type
    })),
    ...asArray(evidenceBundle?.reviewArtifacts).map((artifact) => ({
      path: artifact.path,
      sha256: artifact.sha256,
      type: artifact.type
    })),
    ...asArray(evidenceBundle?.validation).map((artifact) => ({
      path: artifact.evidenceRef,
      sha256: artifact.sha256,
      type: artifact.type ?? 'validation'
    }))
  ].filter((ref) => typeof ref.path === 'string');
}

export function sha256Text(value) {
  return createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function validateReviewEvidence(input, issues) {
  if (asArray(input?.evidenceBundle?.reviewArtifacts).length === 0) {
    pushIssue(
      issues,
      'E_PHASE12_ACCEPTANCE_REVIEW_ARTIFACT_REQUIRED',
      'Acceptance scenario must carry an inspectable review artifact.'
    );
  }
}

function validateResidualRiskSummary(scenario, issues) {
  if (!Array.isArray(scenario?.acceptanceSummary?.residualRisks)) {
    pushIssue(
      issues,
      'E_PHASE12_ACCEPTANCE_RESIDUAL_RISK_REQUIRED',
      'Acceptance scenario must carry explicit residual risk summary.'
    );
  }
}

function validateOperatorDecisionRequirement(scenario, issues) {
  if (scenario?.operatorDecisionRequired === true
    && !isObject(scenario.operatorDecisionEvidence)) {
    pushIssue(
      issues,
      'E_PHASE12_OPERATOR_DECISION_EVIDENCE_REQUIRED',
      'BLOCK scenarios that require an operator decision must carry evidence.'
    );
  }
}

function validateEvidenceHashes(scenario, issues) {
  const evidenceContents = scenario?.evidenceContents ?? {};

  for (const ref of collectEvidenceRefs(scenario?.input?.evidenceBundle)) {
    if (typeof ref.sha256 !== 'string') {
      continue;
    }

    const content = evidenceContents[ref.path];
    if (content === undefined) {
      pushIssue(
        issues,
        'E_PHASE12_ACCEPTANCE_EVIDENCE_CONTENT_REQUIRED',
        'Disk-backed acceptance evidence must be available for SHA checking.',
        { path: ref.path }
      );
      continue;
    }

    const actual = sha256Text(content);
    if (actual !== ref.sha256) {
      pushIssue(
        issues,
        'E_PHASE12_ACCEPTANCE_SHA_MISMATCH',
        'Acceptance evidence SHA does not match disk-backed content.',
        { path: ref.path, expected: ref.sha256, actual }
      );
    }
  }
}

function collectDelegatedIssues(scenario) {
  const input = scenario?.input ?? {};
  const now = scenario?.now;
  const artifactResult = validatePhase12ArtifactSet(input);
  const loopResult = evaluatePhase12LoopStep(input, now ? { now } : {});
  const bridgeResult = validatePhase12BridgeReview(input);

  return {
    finalState: loopResult.finalState,
    validatorResults: {
      validatePhase12ArtifactSet: artifactResult.ok,
      evaluatePhase12LoopStep: loopResult.ok,
      validatePhase12BridgeReview: bridgeResult.ok
    },
    issues: [
      ...artifactResult.issues.map((issue) => (
        withSource(issue, 'validatePhase12ArtifactSet')
      )),
      ...loopResult.issues.map((issue) => (
        withSource(issue, 'evaluatePhase12LoopStep')
      )),
      ...bridgeResult.issues.map((issue) => (
        withSource(issue, 'validatePhase12BridgeReview')
      ))
    ]
  };
}

function matchesExpectedCodes(observedCodes, expectedCodes) {
  return expectedCodes.some((code) => observedCodes.includes(code));
}

function evaluateExpectation(scenario, validationIssues, delegated) {
  const expectationIssues = [];
  const expected = scenario?.expected ?? {};
  const expectedCodes = asArray(expected.codes);
  const observedCodes = validationIssues.map((issue) => issue.code);
  const expectOk = expected.ok === true;

  if (expected.finalState && delegated.finalState !== expected.finalState) {
    pushIssue(
      expectationIssues,
      'E_PHASE12_ACCEPTANCE_FINAL_STATE_MISMATCH',
      'Scenario finalState does not match expectation.',
      {
        scenarioId: scenario?.id,
        expected: expected.finalState,
        actual: delegated.finalState
      }
    );
  }

  if (expectOk && validationIssues.length > 0) {
    pushIssue(
      expectationIssues,
      'E_PHASE12_ACCEPTANCE_UNEXPECTED_ISSUES',
      'Expected ACCEPT scenario produced validation issues.',
      { scenarioId: scenario?.id, observedCodes }
    );
  }

  if (!expectOk) {
    if (expectedCodes.length === 0) {
      pushIssue(
        expectationIssues,
        'E_PHASE12_ACCEPTANCE_EXPECTED_CODES_REQUIRED',
        'Failure-path scenarios must declare expected issue codes.',
        { scenarioId: scenario?.id }
      );
    } else if (!matchesExpectedCodes(observedCodes, expectedCodes)) {
      pushIssue(
        expectationIssues,
        'E_PHASE12_ACCEPTANCE_EXPECTED_FAILURE_MISSING',
        'Expected failure-path issue code was not observed.',
        { scenarioId: scenario?.id, expectedCodes, observedCodes }
      );
    }
  }

  return expectationIssues;
}

export function evaluatePhase12AcceptanceScenario(scenario) {
  const localIssues = [];

  if (!scenario?.id || !isObject(scenario?.input)) {
    pushIssue(
      localIssues,
      'E_PHASE12_ACCEPTANCE_SCENARIO_INVALID',
      'Acceptance scenario must carry an id and input artifact set.'
    );
  }

  validateReviewEvidence(scenario?.input, localIssues);
  validateResidualRiskSummary(scenario, localIssues);
  validateOperatorDecisionRequirement(scenario, localIssues);
  validateEvidenceHashes(scenario, localIssues);

  const delegated = collectDelegatedIssues(scenario);
  const validationIssues = [...localIssues, ...delegated.issues];
  const expectationIssues = evaluateExpectation(
    scenario,
    validationIssues,
    delegated
  );

  return {
    id: scenario?.id ?? null,
    passed: expectationIssues.length === 0,
    expectedOk: scenario?.expected?.ok === true,
    finalState: delegated.finalState,
    validatorResults: delegated.validatorResults,
    delegatedValidators: [...DELEGATED_VALIDATORS],
    observedCodes: [...new Set(validationIssues.map((issue) => issue.code))].sort(),
    validationIssues,
    expectationIssues,
    issues: [...validationIssues, ...expectationIssues]
  };
}

function validateHarnessRoster(scenarios, issues) {
  const seen = new Set(asArray(scenarios).map((scenario) => scenario?.id));

  for (const id of REQUIRED_ACCEPTANCE_SCENARIOS) {
    if (!seen.has(id)) {
      pushIssue(
        issues,
        'E_PHASE12_ACCEPTANCE_SCENARIO_MISSING',
        'Acceptance harness is missing a required scenario.',
        { scenarioId: id }
      );
    }
  }

  for (const id of seen) {
    if (!REQUIRED_ACCEPTANCE_SCENARIOS.includes(id)) {
      pushIssue(
        issues,
        'E_PHASE12_ACCEPTANCE_SCENARIO_UNKNOWN',
        'Acceptance harness contains an unknown scenario.',
        { scenarioId: id }
      );
    }
  }
}

export function evaluatePhase12AcceptanceHarness(input = {}) {
  const issues = [];
  const scenarios = asArray(input.scenarios);

  validateHarnessRoster(scenarios, issues);

  if (!Array.isArray(input.residualRisks)) {
    pushIssue(
      issues,
      'E_PHASE12_ACCEPTANCE_RESIDUAL_RISK_REQUIRED',
      'Acceptance harness summary must carry explicit residual risks.'
    );
  }

  const scenarioResults = scenarios.map((scenario) => (
    evaluatePhase12AcceptanceScenario(scenario)
  ));

  return {
    ok: issues.length === 0 && scenarioResults.every((result) => result.passed),
    phase12: true,
    mode: 'review-only-fixture-acceptance-harness',
    runStateCreated: false,
    providerAutomationInvoked: false,
    graphifyExecuted: false,
    phase10Published: false,
    claimLedgerMutated: false,
    exportPackaged: false,
    requiredScenarioIds: [...REQUIRED_ACCEPTANCE_SCENARIOS],
    coveredScenarioIds: scenarios.map((scenario) => scenario?.id).sort(),
    delegatedValidators: [...DELEGATED_VALIDATORS],
    scenarioResults,
    issues
  };
}
