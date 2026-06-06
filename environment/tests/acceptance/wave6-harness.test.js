import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  runWave6AcceptanceAggregate,
  runWave6AcceptanceScenario,
  WAVE6_SCENARIOS
} from '../../acceptance/wave6-harness.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const realSurfaceByScenario = Object.freeze({
  A: ['startObjectiveCommand', 'runAnalysisCommand'],
  B: ['writeObjectiveBlockerFlag', 'statusObjectiveCommand', 'writeObjectiveResumeSnapshot'],
  B2: ['schedulerInstallCommand', 'runResearchLoopCommand'],
  B3: ['evaluateDeterministicStrategicCheckpoint', 'runResearchLoopCommand'],
  C: ['appendObjectiveQueueRecord', 'runResearchLoopCommand'],
  D: ['runAnalysisCommand'],
  E: ['resolveKernelReader', 'runResearchLoopCommand'],
  F: ['createClaimEdge', 'buildEvidenceExcerpt'],
  G: ['prepareRoleDispatch', 'writeObjectiveResumeSnapshot']
});

async function withTempAcceptance(fn) {
  const root = await mkdtemp(path.join(repoRoot, '.tmp-wave6-acceptance-'));
  await cp(path.join(repoRoot, 'environment'), path.join(root, 'environment'), {
    recursive: true
  });
  await cp(path.join(repoRoot, 'bin'), path.join(root, 'bin'), {
    recursive: true
  });
  await cp(path.join(repoRoot, 'commands'), path.join(root, 'commands'), {
    recursive: true
  });
  await cp(path.join(repoRoot, 'package.json'), path.join(root, 'package.json'));
  await mkdir(path.join(root, '.vibe-science-environment'), { recursive: true });
  try {
    await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function readJson(targetPath) {
  return JSON.parse(await readFile(targetPath, 'utf8'));
}

function collectRealSurfaces(value, surfaces = new Set()) {
  if (value == null) {
    return surfaces;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectRealSurfaces(item, surfaces);
    }
    return surfaces;
  }
  if (typeof value !== 'object') {
    return surfaces;
  }
  if (typeof value.realSurface === 'string' && value.realSurface.trim() !== '') {
    surfaces.add(value.realSurface.trim());
  }
  if (
    typeof value.provenance?.realSurface === 'string' &&
    value.provenance.realSurface.trim() !== ''
  ) {
    surfaces.add(value.provenance.realSurface.trim());
  }
  for (const nested of Object.values(value)) {
    collectRealSurfaces(nested, surfaces);
  }
  return surfaces;
}

async function assertArtifactObjectiveId(value, objectiveId, label) {
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      assert.equal(item.objectiveId, objectiveId, `${label}[${index}] objectiveId`);
    }
    return;
  }
  assert.equal(value.objectiveId, objectiveId, `${label} objectiveId`);
}

async function assertAcceptanceBundleComplete(result) {
  const bundle = await readJson(path.join(result.bundleDir, 'evidence-bundle.json'));
  const requiredArtifacts = [
    'capabilityHandshake',
    'objectiveState',
    'activeObjectivePointer',
    'queueRecords',
    'laneRunRecords',
    'experimentManifest',
    'analysisManifest',
    'packageManifest',
    'reviewRecord',
    'resumeSnapshot',
    'memorySyncState',
    'kernelProjectionSnapshot',
    'testOutput'
  ];

  assert.equal(bundle.objectiveId, result.objectiveId);
  assert.deepEqual(bundle.realSurfaces.sort(), realSurfaceByScenario[result.scenario].toSorted());
  assert.deepEqual(
    [...collectRealSurfaces(bundle.artifacts)].sort(),
    realSurfaceByScenario[result.scenario].toSorted(),
    `Scenario ${result.scenario} realSurfaces must be derived from artifact provenance`
  );
  assert.equal(bundle.objectiveMismatches.length, 0);
  assert.equal(bundle.neutralArtifacts.preObjectiveHandshake.includes('objective-neutral'), true);
  assert.equal(bundle.artifacts.preObjectiveHandshake.objectiveId, null);

  for (const artifactKey of requiredArtifacts) {
    assert.ok(bundle.artifacts[artifactKey], `${artifactKey} missing from evidence bundle`);
    assert.ok(bundle.artifactFiles[artifactKey], `${artifactKey} missing file pointer`);
    const artifactFromDisk = await readJson(path.join(result.bundleDir, bundle.artifactFiles[artifactKey]));
    assert.deepEqual(artifactFromDisk, bundle.artifacts[artifactKey], `${artifactKey} file differs from bundle`);
    await assertArtifactObjectiveId(artifactFromDisk, result.objectiveId, artifactKey);
  }

  const digest = bundle.artifacts.sessionDigest;
  assert.equal(digest.objectiveId, result.objectiveId);
  assert.match(digest.immutablePath, /^digest-2026-06-06T000000000Z-.+\.md$/u);
  assert.equal(await readFile(path.join(result.bundleDir, digest.immutablePath), 'utf8').then((body) => body.includes(result.objectiveId)), true);
  assert.equal(await readFile(path.join(result.bundleDir, 'digest-latest.md'), 'utf8').then((body) => body.includes(result.objectiveId)), true);
  assert.notEqual(digest.immutablePath, digest.latestPath);

  const packageManifest = bundle.artifacts.packageManifest;
  const reviewRecord = bundle.artifacts.reviewRecord;
  assert.equal(packageManifest.artifacts.includes('evidence-bundle.json'), true);
  assert.equal(packageManifest.artifacts.includes(digest.immutablePath), true);
  assert.equal(reviewRecord.packageManifestPath, 'package-manifest.json');
  assert.equal(reviewRecord.packageManifestDigest, packageManifest.contentDigest);
  assert.deepEqual(reviewRecord.reviewInputArtifacts, packageManifest.artifacts);

  return bundle;
}

test('Wave 6 harness exposes 9 scenario commands plus aggregate', () => {
  assert.deepEqual(
    WAVE6_SCENARIOS.map((scenario) => scenario.id),
    ['A', 'B', 'B2', 'B3', 'C', 'D', 'E', 'F', 'G']
  );
  assert.deepEqual(
    WAVE6_SCENARIOS.map((scenario) => scenario.command),
    [
      'phase9:acceptance:A',
      'phase9:acceptance:B',
      'phase9:acceptance:B2',
      'phase9:acceptance:B3',
      'phase9:acceptance:C',
      'phase9:acceptance:D',
      'phase9:acceptance:E',
      'phase9:acceptance:F',
      'phase9:acceptance:G'
    ]
  );
});

test('package.json exposes 9 scenario scripts plus aggregate', async () => {
  const packageJson = JSON.parse(await readFile(new URL('../../../package.json', import.meta.url), 'utf8'));
  const scripts = packageJson.scripts;

  assert.equal(scripts['phase9:acceptance'], 'node environment/acceptance/run-wave6-acceptance.js --all');
  for (const scenarioId of ['A', 'B', 'B2', 'B3', 'C', 'D', 'E', 'F', 'G']) {
    assert.equal(
      scripts[`phase9:acceptance:${scenarioId}`],
      `node environment/acceptance/run-wave6-acceptance.js ${scenarioId}`
    );
  }
  assert.match(scripts['test:phase9'], /environment\/tests\/acceptance\/wave6-harness\.test\.js/u);
});

test('Scenario A bundle pins post-objective handshake and direct-script block', async () => {
  await withTempAcceptance(async (projectRoot) => {
    const result = await runWave6AcceptanceScenario({
      projectRoot,
      scenarioId: 'A',
      objectiveId: 'OBJ-W6-A'
    });

    assert.equal(result.ok, true);
    assert.equal(result.scenario, 'A');
    assert.equal(result.assertions.directScriptBlocked, true);
    assert.equal(result.assertions.postObjectiveHandshakeCarriesObjectiveId, true);
    assert.equal(result.assertions.preObjectiveHandshakeIsNeutral, true);

    const bundle = await readJson(path.join(result.bundleDir, 'evidence-bundle.json'));
    assert.deepEqual(bundle.realSurfaces.sort(), realSurfaceByScenario.A.toSorted());
    assert.equal(bundle.objectiveId, 'OBJ-W6-A');
    assert.equal(bundle.artifacts.preObjectiveHandshake.objectiveId, null);
    assert.equal(bundle.artifacts.capabilityHandshake.objectiveId, 'OBJ-W6-A');
    assert.equal(bundle.artifacts.unsafeExecution.realSurface, 'runAnalysisCommand');
    assert.equal(bundle.artifacts.unsafeExecution.code, 'E_ACTIVE_OBJECTIVE_POINTER_MISSING');
    assert.equal(bundle.artifacts.sanctionedRun.realSurface, 'runAnalysisCommand');
  });
});

test('Scenario B writes an overnight blocker without continuing work', async () => {
  await withTempAcceptance(async (projectRoot) => {
    const result = await runWave6AcceptanceScenario({
      projectRoot,
      scenarioId: 'B',
      objectiveId: 'OBJ-W6-B'
    });

    assert.equal(result.ok, true);
    assert.equal(result.assertions.blockerFlagExists, true);
    assert.equal(result.assertions.noWorkAfterBlocker, true);
    assert.equal(result.assertions.objectiveStatusFreshProcessReadable, true);

    const bundle = await readJson(path.join(result.bundleDir, 'evidence-bundle.json'));
    assert.deepEqual(bundle.realSurfaces.sort(), realSurfaceByScenario.B.toSorted());
    assert.equal(bundle.artifacts.blockerFlag.objectiveId, 'OBJ-W6-B');
    assert.equal(bundle.artifacts.statusProbe.realSurface, 'statusObjectiveCommand');
    assert.equal(bundle.artifacts.statusProbe.status, 'blocked');
  });
});

test('Scenario B2 proves one heartbeat slice and duplicate wake no-op', async () => {
  await withTempAcceptance(async (projectRoot) => {
    const result = await runWave6AcceptanceScenario({
      projectRoot,
      scenarioId: 'B2',
      objectiveId: 'OBJ-W6-B2'
    });

    assert.equal(result.ok, true);
    assert.equal(result.assertions.schedulerRegistrationExistsBeforeWake, true);
    assert.equal(result.assertions.firstWakeRunsOneBoundedSlice, true);
    assert.equal(result.assertions.duplicateWakeNoOp, true);
    assert.equal(result.assertions.noUnattendedClaimPromotion, true);

    const bundle = await readJson(path.join(result.bundleDir, 'evidence-bundle.json'));
    assert.deepEqual(bundle.realSurfaces.sort(), realSurfaceByScenario.B2.toSorted());
    assert.equal(bundle.artifacts.schedulerRegistration.realSurface, 'schedulerInstallCommand');
    assert.equal(bundle.artifacts.wakeEvents.every((entry) => entry.realSurface === 'runResearchLoopCommand'), true);
    assert.equal(bundle.artifacts.resumeSnapshot.writtenReason, 'heartbeat');
    assert.equal(bundle.artifacts.resumeSnapshot.objectiveId, 'OBJ-W6-B2');
  });
});

test('Scenario B3 detects dependency-aware drift without duplicate registrations', async () => {
  await withTempAcceptance(async (projectRoot) => {
    const result = await runWave6AcceptanceScenario({
      projectRoot,
      scenarioId: 'B3',
      objectiveId: 'OBJ-W6-B3'
    });

    assert.equal(result.ok, true);
    assert.equal(result.assertions.noDuplicateRegistrations, true);
    assert.equal(result.assertions.kernelDriftBlocksOnlyDependentNextAction, true);
    assert.equal(result.assertions.sameObjectiveIdAfterSeventyTwoHours, true);

    const bundle = await readJson(path.join(result.bundleDir, 'evidence-bundle.json'));
    assert.deepEqual(bundle.realSurfaces.sort(), realSurfaceByScenario.B3.toSorted());
    assert.equal(bundle.artifacts.registrationCounts.before.paper, 1);
    assert.equal(bundle.artifacts.registrationCounts.after.paper, 1);
    assert.equal(bundle.artifacts.strategicCheckpoint.realSurface, 'evaluateDeterministicStrategicCheckpoint');
    assert.equal(bundle.artifacts.loopResult.realSurface, 'runResearchLoopCommand');
    assert.equal(bundle.artifacts.kernelDrift.dependentNextActionBlocked, true);
    assert.equal(bundle.artifacts.kernelDrift.independentNextActionAllowed, true);
  });
});

test('Scenario C recovers interruption from write-ahead records', async () => {
  await withTempAcceptance(async (projectRoot) => {
    const result = await runWave6AcceptanceScenario({
      projectRoot,
      scenarioId: 'C',
      objectiveId: 'OBJ-W6-C'
    });

    assert.equal(result.ok, true);
    assert.equal(result.assertions.sameObjectiveIdAfterFreshResume, true);
    assert.equal(result.assertions.crashBeforeSnapshotRecoveredFromWriteAhead, true);
    assert.equal(result.assertions.nonIdempotentTaskNotDuplicated, true);

    const bundle = await readJson(path.join(result.bundleDir, 'evidence-bundle.json'));
    assert.deepEqual(bundle.realSurfaces.sort(), realSurfaceByScenario.C.toSorted());
    assert.equal(bundle.artifacts.resumeRecovery.crashPoint, 'after-task-intent-before-snapshot');
    assert.equal(bundle.artifacts.resumeRecovery.realSurface, 'runResearchLoopCommand');
    assert.equal(bundle.artifacts.resumeSnapshot.objectiveId, 'OBJ-W6-C');
  });
});

test('Scenario D blocks direct execution and allows sanctioned manifest execution', async () => {
  await withTempAcceptance(async (projectRoot) => {
    const result = await runWave6AcceptanceScenario({
      projectRoot,
      scenarioId: 'D',
      objectiveId: 'OBJ-W6-D'
    });

    assert.equal(result.ok, true);
    assert.equal(result.assertions.directScriptDeniedAndLogged, true);
    assert.equal(result.assertions.sanctionedManifestAllowedAndLogged, true);
    assert.equal(result.assertions.laneRunRecordHasProvenance, true);

    const bundle = await readJson(path.join(result.bundleDir, 'evidence-bundle.json'));
    assert.deepEqual(bundle.realSurfaces.sort(), realSurfaceByScenario.D.toSorted());
    assert.equal(bundle.artifacts.unsafeExecution.realSurface, 'runAnalysisCommand');
    assert.equal(bundle.artifacts.unsafeExecution.code, 'E_ANALYSIS_TEMPLATE_UNSUPPORTED');
    assert.equal(bundle.artifacts.sanctionedRun.status, 'complete');
    assert.equal(bundle.artifacts.sanctionedRun.realSurface, 'runAnalysisCommand');
  });
});

test('Scenario E separates degraded kernel versus degraded VRE paths', async () => {
  await withTempAcceptance(async (projectRoot) => {
    const result = await runWave6AcceptanceScenario({
      projectRoot,
      scenarioId: 'E',
      objectiveId: 'OBJ-W6-E'
    });

    assert.equal(result.ok, true);
    assert.equal(result.assertions.degradedKernelBlocksClaimPromotion, true);
    assert.equal(result.assertions.workspaceDraftActionsStillAllowed, true);
    assert.equal(result.assertions.vreMissingBlocksAutonomousLoop, true);
    assert.equal(result.assertions.kernelManualOperationsStillAvailable, true);

    const bundle = await readJson(path.join(result.bundleDir, 'evidence-bundle.json'));
    assert.deepEqual(bundle.realSurfaces.sort(), realSurfaceByScenario.E.toSorted());
    assert.equal(bundle.artifacts.degradedKernel.realSurface, 'resolveKernelReader');
    assert.equal(bundle.artifacts.degradedVre.realSurface, 'runResearchLoopCommand');
    assert.equal(bundle.artifacts.degradedKernel.mode, 'kernel-degraded');
    assert.equal(bundle.artifacts.degradedVre.mode, 'vre-missing');
  });
});

test('Scenario F writes package manifest before review record and binds objectiveId', async () => {
  await withTempAcceptance(async (projectRoot) => {
    const result = await runWave6AcceptanceScenario({
      projectRoot,
      scenarioId: 'F',
      objectiveId: 'OBJ-W6-F'
    });

    assert.equal(result.ok, true);
    assert.equal(result.assertions.packageManifestExistsBeforeReview, true);
    assert.equal(result.assertions.reviewRecordBindsObjectiveId, true);
    assert.equal(result.assertions.digestLatestIsNotSufficient, true);

    const packageManifest = await readJson(path.join(result.bundleDir, 'package-manifest.json'));
    const reviewRecord = await readJson(path.join(result.bundleDir, 'review-record.json'));
    assert.equal(packageManifest.objectiveId, 'OBJ-W6-F');
    assert.equal(reviewRecord.objectiveId, 'OBJ-W6-F');
    assert.equal(reviewRecord.packageManifestPath, 'package-manifest.json');
    assert.equal(reviewRecord.packageManifestDigest, packageManifest.contentDigest);
    assert.equal(reviewRecord.reviewInputArtifacts.includes(packageManifest.artifacts.at(-1)), true);
    assert.ok(Date.parse(reviewRecord.reviewedAt) >= Date.parse(packageManifest.createdAt));
    assert.equal(packageManifest.artifacts.some((entry) => /^digest-2026-06-06T000000000Z-F-.+\.md$/u.test(entry)), true);
  });
});

test('Scenario G reconstructs multi-agent resume from artifacts', async () => {
  await withTempAcceptance(async (projectRoot) => {
    const result = await runWave6AcceptanceScenario({
      projectRoot,
      scenarioId: 'G',
      objectiveId: 'OBJ-W6-G'
    });

    assert.equal(result.ok, true);
    assert.equal(result.assertions.twoReviewedRolesDispatched, true);
    assert.equal(result.assertions.roleRuntimeMatrixBindingUsed, true);
    assert.equal(result.assertions.leadReconstructsFromArtifacts, true);
    assert.equal(result.assertions.reviewer2VerdictVisibleBeforeContinuation, true);
    assert.equal(result.assertions.noSubagentGlobalCompletionMutation, true);

    const bundle = await readJson(path.join(result.bundleDir, 'evidence-bundle.json'));
    assert.deepEqual(bundle.realSurfaces.sort(), realSurfaceByScenario.G.toSorted());
    assert.equal(bundle.artifacts.handoffs.every((handoff) => handoff.objectiveId === 'OBJ-W6-G'), true);
    assert.equal(bundle.artifacts.reviewRecord.objectiveId, 'OBJ-W6-G');
  });
});

test('Aggregate Wave 6 command runs all 9 scenarios and writes one summary', async () => {
  await withTempAcceptance(async (projectRoot) => {
    const result = await runWave6AcceptanceAggregate({
      projectRoot,
      objectiveId: 'OBJ-W6-ALL'
    });

    assert.equal(result.ok, true);
    assert.equal(result.results.length, 9);
    assert.deepEqual(result.results.map((entry) => entry.scenario), ['A', 'B', 'B2', 'B3', 'C', 'D', 'E', 'F', 'G']);
    assert.equal(result.command, 'phase9:acceptance');
    assert.equal(new Set(result.results.map((entry) => entry.bundleDir)).size, 9);

    const summary = await readJson(result.summaryPath);
    assert.equal(summary.objectiveId, 'OBJ-W6-ALL');
    assert.equal(summary.results.length, 9);
    assert.equal(summary.results.every((entry) => entry.ok), true);
    for (const scenarioResult of result.results) {
      const bundle = await assertAcceptanceBundleComplete(scenarioResult);
      assert.equal(bundle.command, `phase9:acceptance:${scenarioResult.scenario}`);
      assert.equal(bundle.artifacts.testOutput.status, 'pass');
    }
  });
});

test('Aggregate Wave 6 command fails when one scenario returns non-green', async () => {
  await withTempAcceptance(async (projectRoot) => {
    const result = await runWave6AcceptanceAggregate({
      projectRoot,
      objectiveId: 'OBJ-W6-FAIL-INJECTION',
      scenarioRunner: async ({ scenarioId, objectiveId }) => ({
        ok: scenarioId !== 'D',
        scenario: scenarioId,
        command: `phase9:acceptance:${scenarioId}`,
        objectiveId,
        bundleDir: path.join(projectRoot, `bundle-${scenarioId}`),
        assertions: {}
      })
    });

    assert.equal(result.ok, false);
    assert.equal(result.results.length, 9);
    assert.equal(result.results.find((entry) => entry.scenario === 'D').ok, false);
  });
});
