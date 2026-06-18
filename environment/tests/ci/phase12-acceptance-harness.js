import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { assert, isDirectRun, repoRoot, runValidator } from './_helpers.js';
import {
  evaluatePhase12AcceptanceHarness,
  sha256Text
} from '../../phase12/acceptance-harness.js';

const DEFAULT_ROOT = 'environment/tests/fixtures/phase12/acceptance-harness';
const ISO_TIME = '2026-06-18T00:00:00.000Z';

function scenarioPath(rootPath, relativePath) {
  return path.join(rootPath, relativePath);
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function loadEvidenceContents(rootPath, evidenceFiles) {
  const entries = await Promise.all(
    evidenceFiles.map(async (file) => [
      file,
      await readFile(scenarioPath(rootPath, file), 'utf8')
    ])
  );
  return Object.fromEntries(entries);
}

function evidenceRef(pathValue, contents, type) {
  return {
    path: pathValue,
    sha256: sha256Text(contents[pathValue]),
    type
  };
}

function baseInput({
  id,
  variant,
  evidenceContents,
  evidenceFiles
}) {
  const runId = `RUN-20260618-T12-6-${id}`;
  const candidatePath = evidenceFiles.find((file) => file.includes('candidate'));
  const reviewPath = evidenceFiles.find((file) => file.includes('review'));
  const validationPath = evidenceFiles.find((file) => file.includes('validation'));

  const run = {
    schemaVersion: 'phase12.relay-run.v1',
    runId,
    phaseScope: 'phase12',
    activeAuthor: 'codex',
    counterReviewer: 'claude-code',
    operator: 'carmine',
    createdAt: ISO_TIME,
    updatedAt: ISO_TIME,
    state: variant === 'stale' ? 'STALE' : 'ACCEPTED',
    relaySubstrate: 'filesystem',
    maxIterations: 3,
    budget: { maxTurns: 8, maxWallMinutes: 60, maxCostUsd: null },
    providerAutomationAllowed: false,
    guiAutomationAllowed: false
  };

  const candidate = {
    schemaVersion: 'phase12.relay-candidate.v1',
    runId,
    artifactId: `CAND-${id}`,
    artifactKind: 'implementation',
    author: 'codex',
    createdAt: ISO_TIME,
    artifactPath: candidatePath,
    sourceRefs: ['phase12-implementation-plan/25-hat1-stop-t12-6-0.md'],
    changedFiles: [],
    claimBoundary: 'review-only-acceptance-fixture',
    validationPerformed: ['phase12-acceptance-harness'],
    knownLimits: []
  };

  const review = {
    schemaVersion: 'phase12.relay-review.v1',
    runId,
    reviewId: `REV-${id}`,
    reviewer: variant === 'self-accept' ? 'codex' : 'claude-code',
    reviewedArtifactRef: candidate.artifactId,
    mode: ['acceptance-harness-review'],
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
    runId,
    verdictId: `VERDICT-${id}`,
    relayVerdictType: 'phase12-relay-verdict',
    author: 'codex',
    candidateAuthor: 'codex',
    acceptedBy: variant === 'self-accept' ? 'codex' : 'claude-code',
    reviewedArtifacts: [candidate.artifactId],
    finalState: 'ACCEPTED',
    iterationsUsed: 1,
    accepted: true,
    blockingFindings: [],
    requiredFollowup: [],
    residualRisk: [],
    operatorGoRef: 'gate:phase-12-t12.6.0',
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
    runId,
    artifacts: [
      evidenceRef(
        candidatePath,
        evidenceContents,
        variant === 'graph-evidence' ? 'graphify-output' : 'candidate'
      )
    ],
    reviewArtifacts: [evidenceRef(reviewPath, evidenceContents, 'review')],
    finalVerdictRef: `verdicts/${id}.json`,
    scenarioCoverage: [id],
    validation: [
      {
        tool: 'phase12-acceptance-harness',
        result: 'pass',
        evidenceRef: validationPath,
        sha256: sha256Text(evidenceContents[validationPath])
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

  const input = {
    run,
    candidate,
    review,
    finalVerdict,
    evidenceBundle,
    phase10Law13ReviewExtension,
    phase11GraphReviewExtension,
    bridgeReviewMetadata: {
      phase10PublicationRequested: false,
      phase10WritebackRequested: false,
      graphifyExecutionRequested: false,
      graphifyWritebackRequested: false,
      graphPathRole: 'navigation-metadata',
      validatorOutputAsLaw13Provenance: false
    }
  };

  if (variant === 'redirect-empty') {
    input.review.verdict = 'REDIRECT';
    input.review.severity = 'MEDIUM';
    input.finalVerdict.accepted = false;
    input.finalVerdict.finalState = 'BLOCKED';
    input.finalVerdict.acceptedBy = null;
  }

  if (variant === 'block-needs-operator') {
    input.review.verdict = 'BLOCK';
    input.review.severity = 'HIGH';
    input.review.findings = ['operator decision required'];
    input.finalVerdict.accepted = false;
    input.finalVerdict.finalState = 'BLOCKED';
    input.finalVerdict.acceptedBy = null;
  }

  if (variant === 'phase10-provenance-bypass') {
    input.evidenceBundle.tracking.provenanceRefs = [
      { kind: 'query-output', path: 'query/phase10-result.json' }
    ];
  }

  if (variant === 'graph-evidence') {
    input.bridgeReviewMetadata.graphPathRole = 'implementation-proof';
  }

  return input;
}

async function buildScenario(rootPath, descriptor) {
  const evidenceContents = await loadEvidenceContents(rootPath, descriptor.evidenceFiles);
  const input = baseInput({
    id: descriptor.id,
    variant: descriptor.variant,
    evidenceContents,
    evidenceFiles: descriptor.evidenceFiles
  });

  return {
    id: descriptor.id,
    description: descriptor.description,
    expected: descriptor.expected,
    now: descriptor.now ?? '2026-06-18T00:10:00.000Z',
    turnsUsed: descriptor.turnsUsed,
    operatorDecisionRequired: descriptor.operatorDecisionRequired === true,
    operatorDecisionEvidence: descriptor.operatorDecisionEvidence,
    acceptanceSummary: descriptor.acceptanceSummary,
    evidenceContents,
    input: {
      ...input,
      turnsUsed: descriptor.turnsUsed
    }
  };
}

export async function loadAcceptanceHarnessFixture(options = {}) {
  const rootPath = options.rootPath ?? path.join(repoRoot, DEFAULT_ROOT);
  const config = await readJson(path.join(rootPath, 'scenarios.json'));
  const scenarios = [];

  for (const descriptor of config.scenarios) {
    scenarios.push(await buildScenario(rootPath, descriptor));
  }

  return {
    residualRisks: config.residualRisks,
    scenarios
  };
}

export default async function validatePhase12AcceptanceHarness() {
  const fixture = await loadAcceptanceHarnessFixture();
  const result = evaluatePhase12AcceptanceHarness(fixture);
  assert(
    result.ok,
    `Phase 12 acceptance harness failed: ${JSON.stringify(result, null, 2)}`
  );
}

if (isDirectRun(import.meta)) {
  await runValidator('phase12-acceptance-harness', validatePhase12AcceptanceHarness);
}
