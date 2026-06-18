import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  evaluatePhase12AcceptanceHarness,
  evaluatePhase12AcceptanceScenario
} from '../../phase12/acceptance-harness.js';
import {
  default as validatePhase12AcceptanceHarness,
  loadAcceptanceHarnessFixture
} from './phase12-acceptance-harness.js';

function findScenario(fixture, id) {
  return fixture.scenarios.find((scenario) => scenario.id === id);
}

function expectScenarioCode(scenario, code) {
  const result = evaluatePhase12AcceptanceScenario(scenario);
  assert.equal(result.passed, true, JSON.stringify(result, null, 2));
  assert(
    result.observedCodes.includes(code),
    JSON.stringify(result.observedCodes, null, 2)
  );
}

test('acceptance harness passes tracked A-H fixture scenarios', async () => {
  const fixture = await loadAcceptanceHarnessFixture();
  const result = evaluatePhase12AcceptanceHarness(fixture);

  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.deepEqual(result.requiredScenarioIds, ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
  assert.deepEqual(result.coveredScenarioIds, ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
  assert.deepEqual(result.delegatedValidators, [
    'validatePhase12ArtifactSet',
    'evaluatePhase12LoopStep',
    'validatePhase12BridgeReview'
  ]);
  assert.equal(result.runStateCreated, false);
  assert.equal(result.providerAutomationInvoked, false);
  assert.equal(result.graphifyExecuted, false);
});

test('scenario A proves a non-author ACCEPT path', async () => {
  const fixture = await loadAcceptanceHarnessFixture();
  const result = evaluatePhase12AcceptanceScenario(findScenario(fixture, 'A'));

  assert.equal(result.passed, true, JSON.stringify(result, null, 2));
  assert.equal(result.finalState, 'ACCEPTED');
  assert.deepEqual(result.observedCodes, []);
});

test('scenarios B-H prove the required failure paths', async () => {
  const fixture = await loadAcceptanceHarnessFixture();

  expectScenarioCode(findScenario(fixture, 'B'), 'E_PHASE12_SELF_ACCEPT_FORBIDDEN');
  expectScenarioCode(findScenario(fixture, 'C'), 'E_PHASE12_REDIRECT_ACTION_REQUIRED');
  expectScenarioCode(findScenario(fixture, 'D'), 'E_PHASE12_OPERATOR_DECISION_EVIDENCE_REQUIRED');
  expectScenarioCode(findScenario(fixture, 'E'), 'E_PHASE12_STALE_CONTEXT');
  expectScenarioCode(findScenario(fixture, 'F'), 'E_PHASE12_TURN_BUDGET_EXHAUSTED');
  expectScenarioCode(findScenario(fixture, 'G'), 'E_PHASE12_QUERY_OUTPUT_NOT_PROVENANCE');
  expectScenarioCode(findScenario(fixture, 'H'), 'E_PHASE12_GRAPH_PATH_NOT_IMPLEMENTATION_PROOF');
});

test('missing scenario roster is fail-closed', async () => {
  const fixture = await loadAcceptanceHarnessFixture();
  fixture.scenarios = fixture.scenarios.filter((scenario) => scenario.id !== 'H');

  const result = evaluatePhase12AcceptanceHarness(fixture);
  assert.equal(result.ok, false);
  assert(result.issues.some((issue) => (
    issue.code === 'E_PHASE12_ACCEPTANCE_SCENARIO_MISSING'
    && issue.scenarioId === 'H'
  )));
});

test('residual risk summaries are required', async () => {
  const fixture = await loadAcceptanceHarnessFixture();
  delete fixture.residualRisks;

  const harnessResult = evaluatePhase12AcceptanceHarness(fixture);
  assert.equal(harnessResult.ok, false);
  assert(harnessResult.issues.some((issue) => (
    issue.code === 'E_PHASE12_ACCEPTANCE_RESIDUAL_RISK_REQUIRED'
  )));

  const scenario = findScenario(await loadAcceptanceHarnessFixture(), 'A');
  delete scenario.acceptanceSummary.residualRisks;
  expectScenarioCode({
    ...scenario,
    expected: { ok: false, codes: ['E_PHASE12_ACCEPTANCE_RESIDUAL_RISK_REQUIRED'] }
  }, 'E_PHASE12_ACCEPTANCE_RESIDUAL_RISK_REQUIRED');
});

test('raw chat missing review artifacts and SHA mismatch fail', async () => {
  const fixture = await loadAcceptanceHarnessFixture();

  const rawChat = structuredClone(findScenario(fixture, 'A'));
  rawChat.input.candidate.sourceRefs.push('raw-chat:operator-window');
  rawChat.expected = { ok: false, codes: ['E_PHASE12_RAW_CHAT_NOT_AUTHORITY'] };
  expectScenarioCode(rawChat, 'E_PHASE12_RAW_CHAT_NOT_AUTHORITY');

  const missingReview = structuredClone(findScenario(fixture, 'A'));
  missingReview.input.evidenceBundle.reviewArtifacts = [];
  missingReview.expected = {
    ok: false,
    codes: ['E_PHASE12_ACCEPTANCE_REVIEW_ARTIFACT_REQUIRED']
  };
  expectScenarioCode(
    missingReview,
    'E_PHASE12_ACCEPTANCE_REVIEW_ARTIFACT_REQUIRED'
  );

  const shaMismatch = structuredClone(findScenario(fixture, 'A'));
  shaMismatch.input.evidenceBundle.artifacts[0].sha256 = '0'.repeat(64);
  shaMismatch.expected = { ok: false, codes: ['E_PHASE12_ACCEPTANCE_SHA_MISMATCH'] };
  expectScenarioCode(shaMismatch, 'E_PHASE12_ACCEPTANCE_SHA_MISMATCH');
});

test('acceptance harness source composes existing validators and stays pure', async () => {
  const source = await readFile('environment/phase12/acceptance-harness.js', 'utf8');

  assert(source.includes('validatePhase12ArtifactSet('));
  assert(source.includes('evaluatePhase12LoopStep('));
  assert(source.includes('validatePhase12BridgeReview('));
  assert(!/\bwriteFile\b|\bappendFile\b|\bmkdir\b|\brm\b|\bunlink\b/u.test(source));
});

test('phase12 acceptance harness CI module passes production cases', async () => {
  await validatePhase12AcceptanceHarness();
});
