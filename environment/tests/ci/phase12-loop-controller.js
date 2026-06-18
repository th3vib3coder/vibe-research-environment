import { readFile } from 'node:fs/promises';
import { assert, isDirectRun, repoRoot, runValidator } from './_helpers.js';
import {
  evaluatePhase12LoopStep
} from '../../phase12/loop-controller.js';

const ISO_TIME = '2026-06-18T00:00:00.000Z';
const NOW = '2026-06-18T00:10:00.000Z';

export function validLoopInput(overrides = {}) {
  const run = {
    schemaVersion: 'phase12.relay-run.v1',
    runId: 'RUN-20260618-000000-t12-4-0',
    phaseScope: 'phase12',
    activeAuthor: 'codex',
    counterReviewer: 'claude-code',
    operator: 'carmine',
    createdAt: ISO_TIME,
    updatedAt: ISO_TIME,
    state: 'ACCEPTED',
    relaySubstrate: 'filesystem',
    maxIterations: 3,
    budget: { maxTurns: 8, maxWallMinutes: 60, maxCostUsd: null },
    providerAutomationAllowed: false,
    guiAutomationAllowed: false
  };

  const candidate = {
    schemaVersion: 'phase12.relay-candidate.v1',
    runId: run.runId,
    artifactId: 'CAND-LOOP-001',
    artifactKind: 'plan',
    author: 'codex',
    createdAt: ISO_TIME,
    artifactPath: 'candidate/candidate.md',
    sourceRefs: ['phase12-implementation-plan/21-hat1-stop.md'],
    changedFiles: [],
    claimBoundary: 'implementation-candidate',
    validationPerformed: ['phase12-loop-controller'],
    knownLimits: []
  };

  const review = {
    schemaVersion: 'phase12.relay-review.v1',
    runId: run.runId,
    reviewId: 'REV-LOOP-001',
    reviewer: 'claude-code',
    reviewedArtifactRef: candidate.artifactId,
    mode: ['implementation-review'],
    verdict: 'ACCEPT',
    severity: 'NONE',
    findings: [],
    requiredActions: [],
    residualRisk: [],
    selfCertificationCheck: 'reviewer-did-not-author-reviewed-artifact',
    createdAt: ISO_TIME
  };

  const finalVerdict = {
    schemaVersion: 'phase12.relay-final-verdict.v1',
    runId: run.runId,
    verdictId: 'VERDICT-LOOP-001',
    relayVerdictType: 'phase12-relay-verdict',
    author: 'codex',
    candidateAuthor: 'codex',
    acceptedBy: 'claude-code',
    reviewedArtifacts: [candidate.artifactId],
    finalState: 'ACCEPTED',
    iterationsUsed: 1,
    accepted: true,
    blockingFindings: [],
    requiredFollowup: [],
    residualRisk: [],
    operatorGoRef: 'gate:phase-12-t12.4.0',
    closureSignalStatus: {
      implementationMatchesPlan: 'pass',
      testsPass: 'pass',
      risksHandled: 'pass',
      duplicationAvoided: 'pass',
      hatsAligned: 'pass',
      noRegression: 'pass'
    },
    createdAt: ISO_TIME
  };

  const evidenceBundle = {
    schemaVersion: 'phase12.relay-evidence-bundle.v1',
    runId: run.runId,
    artifacts: [
      { path: 'candidate/candidate.md', sha256: 'a'.repeat(64), type: 'candidate' }
    ],
    reviewArtifacts: [
      { path: 'reviews/review-001.json', sha256: 'b'.repeat(64), type: 'review' }
    ],
    finalVerdictRef: 'verdicts/final-verdict.json',
    scenarioCoverage: [],
    validation: [
      {
        tool: 'phase12-loop-controller',
        result: 'pass',
        evidenceRef: 'validation/phase12-loop-controller.json',
        sha256: 'c'.repeat(64)
      }
    ],
    tracking: { governanceEventRefs: [], ledgerRefs: [], provenanceRefs: [] },
    createdAt: ISO_TIME
  };

  const phase10Law13ReviewExtension = {
    schemaVersion: 'phase12.phase10-law13-review-extension.v1',
    relayVerdictType: 'phase12-relay-verdict',
    law13StatusChecked: true,
    provenanceRefsChecked: true,
    queryNotProvenanceCheck: true,
    r2PathRequired: true,
    r2PathPresent: true,
    suppositionIsolationChecked: true,
    checkedAssertionRefs: [],
    checkedProvenanceRefs: [],
    checkedSourceRefs: [],
    evidenceBundleRefs: []
  };

  const phase11GraphReviewExtension = {
    schemaVersion: 'phase12.phase11-graph-review-extension.v1',
    graphAsNavigationOnlyChecked: true,
    unsafeIndexingChecked: true,
    staleGraphChecked: true,
    sourceReadRequired: true,
    wikiVreAuthorityPreserved: true,
    checkedGraphRunRefs: [],
    checkedWikiRefs: [],
    checkedSourceRefs: [],
    staleGraphMetadataRefs: []
  };

  return {
    run,
    candidate,
    review,
    finalVerdict,
    evidenceBundle,
    phase10Law13ReviewExtension,
    phase11GraphReviewExtension,
    iterationsUsed: 1,
    turnsUsed: 1,
    ...overrides
  };
}

function expectState(input, expectedState) {
  const result = evaluatePhase12LoopStep(input, { now: input.now ?? NOW });
  assert(result.finalState === expectedState, `expected ${expectedState}, got ${result.finalState}`);
  assert(result.stepCount === 1, 'controller must advance exactly one step');
  assert(result.runStateCreated === false, 'controller must not create run state');
  return result;
}

export default async function validatePhase12LoopController() {
  const accepted = expectState(validLoopInput(), 'ACCEPTED');
  assert(accepted.ok === true, 'valid non-author ACCEPT should pass');
  assert(
    JSON.stringify(accepted.evidenceRefs.map((ref) => ref.path))
      === JSON.stringify([
        'candidate/candidate.md',
        'reviews/review-001.json',
        'validation/phase12-loop-controller.json'
      ]),
    'evidence refs must be deterministic and sorted'
  );

  const selfAccept = validLoopInput({
    review: { ...validLoopInput().review, reviewer: 'codex' }
  });
  const selfAcceptResult = expectState(selfAccept, 'SCHEMA_INVALID');
  assert(
    selfAcceptResult.issues.some((issue) => issue.code === 'E_PHASE12_SELF_ACCEPT_FORBIDDEN')
  );

  expectState(validLoopInput({ iterationsUsed: 3 }), 'ITERATION_LIMIT_REACHED');
  expectState(validLoopInput({ turnsUsed: 8 }), 'BUDGET_EXHAUSTED');
  expectState(validLoopInput({ now: '2026-06-18T02:00:00.000Z' }), 'STALE_CONTEXT');
  expectState(validLoopInput({ abortRequested: true }), 'ABORTED_BY_OPERATOR');
  expectState(validLoopInput({
    run: { ...validLoopInput().run, providerAutomationAllowed: true }
  }), 'SCHEMA_INVALID');
  expectState(validLoopInput({
    run: { ...validLoopInput().run, guiAutomationAllowed: true }
  }), 'SCHEMA_INVALID');

  const writeback = expectState(validLoopInput({ writebackRequested: true }), 'SCHEMA_INVALID');
  assert(writeback.issues.some((issue) => issue.code === 'E_PHASE12_LIVE_WRITEBACK_FORBIDDEN'));

  const source = await readFile(`${repoRoot}/environment/phase12/loop-controller.js`, 'utf8');
  assert(!/\bwriteFile\b|\bappendFile\b|\bmkdir\b|\brm\b|\bunlink\b/u.test(source));
}

if (isDirectRun(import.meta)) {
  await runValidator('phase12-loop-controller', validatePhase12LoopController);
}
