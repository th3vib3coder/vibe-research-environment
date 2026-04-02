import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  assertRepoPathExists,
  PHASE1_EXPECTED_TASK_FILES,
  PHASE2_EXPECTED_TASK_FILES,
  repoRoot,
  listSavedBenchmarkRepeats,
  readRepoJson
} from './_helpers.js';

function taskIdFromFile(fileName) {
  return fileName.replace(/\.json$/u, '');
}

async function readRepeatArtifact(taskId, repeatId, fileName) {
  return readRepoJson(
    `.vibe-science-environment/operator-validation/benchmarks/${taskId}/${repeatId}/${fileName}`
  );
}

async function externalPathExists(repoRelativePath) {
  try {
    await access(path.resolve(repoRoot, repoRelativePath));
    return true;
  } catch {
    return false;
  }
}

const HAS_KERNEL_SIBLING = await externalPathExists('../vibe-science/CLAUDE.md');

test('saved benchmark artifacts exist for every Phase 1 task and include the required files', async () => {
  for (const fileName of PHASE1_EXPECTED_TASK_FILES) {
    const taskId = taskIdFromFile(fileName);
    const repeats = await listSavedBenchmarkRepeats(taskId);

    assert.ok(repeats.length >= 1, `Expected at least one saved repeat for ${taskId}`);

    const repeatId = repeats.at(-1);
    const input = await readRepeatArtifact(taskId, repeatId, 'input.json');
    const output = await readRepeatArtifact(taskId, repeatId, 'output.json');
    const metrics = await readRepeatArtifact(taskId, repeatId, 'metrics.json');
    const summary = await readRepeatArtifact(taskId, repeatId, 'summary.json');

    assert.equal(input.taskId, taskId);
    assert.equal(output.taskId, taskId);
    assert.equal(metrics.taskId, taskId);
    assert.equal(summary.taskId, taskId);
    assert.equal(input.repeatId, repeatId);
    assert.equal(summary.repeatId, repeatId);
    assert.equal(summary.benchmarkId, 'phase1-core');
    assert.equal(summary.passed, true, `Expected saved repeat ${taskId}/${repeatId} to pass`);
    assert.ok(Array.isArray(summary.actualWrites));
    assert.equal(typeof summary.transcriptPath, 'string');
    await access(path.join(repoRoot, summary.transcriptPath));
  }
});

test('saved benchmark artifacts exist for every Phase 2 task and include the required files', async () => {
  for (const fileName of PHASE2_EXPECTED_TASK_FILES) {
    const taskId = taskIdFromFile(fileName);
    const repeats = await listSavedBenchmarkRepeats(taskId);

    assert.ok(repeats.length >= 1, `Expected at least one saved repeat for ${taskId}`);

    const repeatId = repeats.at(-1);
    const input = await readRepeatArtifact(taskId, repeatId, 'input.json');
    const output = await readRepeatArtifact(taskId, repeatId, 'output.json');
    const metrics = await readRepeatArtifact(taskId, repeatId, 'metrics.json');
    const summary = await readRepeatArtifact(taskId, repeatId, 'summary.json');

    assert.equal(input.taskId, taskId);
    assert.equal(output.taskId, taskId);
    assert.equal(metrics.taskId, taskId);
    assert.equal(summary.taskId, taskId);
    assert.equal(input.repeatId, repeatId);
    assert.equal(summary.repeatId, repeatId);
    assert.equal(summary.benchmarkId, 'phase2-memory-packaging');
    assert.equal(summary.passed, true, `Expected saved repeat ${taskId}/${repeatId} to pass`);
    assert.ok(Array.isArray(summary.actualWrites));
    assert.equal(typeof summary.transcriptPath, 'string');
    await access(path.join(repoRoot, summary.transcriptPath));
  }
});

test('saved degraded-kernel-mode artifact records honest degraded behavior', async () => {
  const repeats = await listSavedBenchmarkRepeats('degraded-kernel-mode');
  const latestRepeat = repeats.at(-1);
  const output = await readRepeatArtifact('degraded-kernel-mode', latestRepeat, 'output.json');
  const summary = await readRepeatArtifact('degraded-kernel-mode', latestRepeat, 'summary.json');

  assert.equal(summary.metrics.degradedHonestyScore, 1);
  assert.equal(output.snapshot.kernel.dbAvailable, false);
  assert.equal(output.snapshot.kernel.degradedReason, 'bridge unavailable');
  assert.equal(output.snapshot.signals.unresolvedClaims, 0);
  assert.equal(output.snapshot.signals.exportAlerts, 0);
});

test('saved flow-status-resume artifact demonstrates resume within the Phase 1 latency budget', async () => {
  const repeats = await listSavedBenchmarkRepeats('flow-status-resume');
  const latestRepeat = repeats.at(-1);
  const summary = await readRepeatArtifact('flow-status-resume', latestRepeat, 'summary.json');

  assert.equal(summary.passed, true);
  assert.ok(
    typeof summary.metrics.resumeLatencySeconds === 'number' &&
      summary.metrics.resumeLatencySeconds <= 120,
    'Resume artifact exceeded the Phase 1 latency budget.'
  );
});

test('saved sync-memory-refresh artifact records honest mirror sync and freshness state', async () => {
  const repeats = await listSavedBenchmarkRepeats('sync-memory-refresh');
  const latestRepeat = repeats.at(-1);
  const output = await readRepeatArtifact('sync-memory-refresh', latestRepeat, 'output.json');
  const summary = await readRepeatArtifact('sync-memory-refresh', latestRepeat, 'summary.json');

  assert.equal(summary.passed, true);
  assert.equal(output.result.payload.state.status, 'partial');
  assert.equal(output.result.payload.state.kernelDbAvailable, false);
  assert.ok(
    output.actualWrites.includes('.vibe-science-environment/memory/sync-state.json')
  );
  assert.ok(
    output.actualWrites.includes(
      '.vibe-science-environment/memory/mirrors/project-overview.md'
    )
  );
});

test('saved flow-status-stale-memory artifact surfaces the explicit stale warning', async () => {
  const repeats = await listSavedBenchmarkRepeats('flow-status-stale-memory');
  const latestRepeat = repeats.at(-1);
  const output = await readRepeatArtifact('flow-status-stale-memory', latestRepeat, 'output.json');

  assert.equal(output.snapshot.signals.staleMemory, true);
  assert.ok(output.result.warnings.includes('STALE — run /sync-memory to refresh'));
});

test('saved flow-results-package artifact records sourceAttemptId in a typed bundle manifest', async () => {
  const repeats = await listSavedBenchmarkRepeats('flow-results-package');
  const latestRepeat = repeats.at(-1);
  const output = await readRepeatArtifact('flow-results-package', latestRepeat, 'output.json');

  assert.equal(output.result.payload.bundleManifest.sourceAttemptId, 'ATT-2026-04-02-201');
  assert.ok(
    Array.isArray(output.result.payload.bundleManifest.artifacts) &&
      output.result.payload.bundleManifest.artifacts.length > 0
  );
});

test('saved flow-status-results-findability artifact proves discoverability within the Phase 2 latency budget', async () => {
  const repeats = await listSavedBenchmarkRepeats('flow-status-results-findability');
  const latestRepeat = repeats.at(-1);
  const output = await readRepeatArtifact(
    'flow-status-results-findability',
    latestRepeat,
    'output.json'
  );
  const summary = await readRepeatArtifact(
    'flow-status-results-findability',
    latestRepeat,
    'summary.json'
  );

  assert.equal(summary.passed, true);
  assert.ok(
    typeof summary.metrics.resumeLatencySeconds === 'number' &&
      summary.metrics.resumeLatencySeconds <= 60,
    'Findability artifact exceeded the Phase 2 latency budget.'
  );
  assert.equal(output.result.payload.foundBundle.experimentId, 'EXP-301');
  assert.equal(
    output.result.payload.foundDigest.digestId,
    'DIGEST-session-2026-04-02-findability'
  );
});

test('saved operator-validation artifact points to a passing flow-status resume repeat', async () => {
  const artifact = await readRepoJson(
    '.vibe-science-environment/operator-validation/artifacts/phase1-resume-validation.json'
  );

  assert.equal(artifact.artifactId, 'phase1-resume-validation');
  assert.equal(artifact.phase, 1);
  assert.equal(artifact.passed, true);
  assert.equal(artifact.command.name, '/flow-status');
  assert.ok(
    typeof artifact.elapsedSeconds === 'number' && artifact.elapsedSeconds <= 120,
    'Operator validation artifact does not prove resume within the Phase 1 budget.'
  );
  assert.match(artifact.validationClaim, /\/flow-status/u);

  await assertRepoPathExists(artifact.sourceRepeat.inputPath);
  await assertRepoPathExists(artifact.sourceRepeat.outputPath);
  await assertRepoPathExists(artifact.sourceRepeat.metricsPath);
  await assertRepoPathExists(artifact.sourceRepeat.summaryPath);
  await assertRepoPathExists(artifact.sourceRepeat.transcriptPath);
});

test('saved context baseline artifact measures kernel-owned base and keeps one flow within the Phase 1 incremental budget', async () => {
  const artifact = await readRepoJson(
    '.vibe-science-environment/operator-validation/artifacts/phase1-context-baseline.json'
  );

  assert.equal(artifact.artifactId, 'phase1-context-baseline');
  assert.equal(artifact.phase, 1);
  assert.equal(artifact.scenario.commandName, '/flow-status');
  assert.equal(
    artifact.measurementMethod.sessionStart,
    'Measured from live SessionStart hook output (additionalContext).'
  );
  assert.equal(
    artifact.sources.operatorIncremental.flowCommand.path,
    'commands/flow-status.md'
  );

  if (HAS_KERNEL_SIBLING) {
    await access(path.resolve(repoRoot, artifact.sources.kernelOwned.claude.path));
    await access(path.resolve(repoRoot, artifact.sources.kernelOwned.skill.path));
    await access(path.resolve(repoRoot, artifact.sources.kernelOwned.sessionStart.scriptPath));
  }

  assert.equal(artifact.sources.kernelOwned.sessionStart.hookEventName, 'SessionStart');
  assert.match(
    artifact.sources.kernelOwned.sessionStart.additionalContextSha256,
    /^[a-f0-9]{64}$/u
  );
  assert.ok(artifact.sources.kernelOwned.sessionStart.additionalContextTokens > 0);
  assert.ok(artifact.totals.kernelOwnedBaseTokens > 0);
  assert.ok(artifact.totals.incrementalFlowTokens > 0);
  assert.equal(
    artifact.totals.baselineInvocationTokens,
    artifact.totals.kernelOwnedBaseTokens + artifact.totals.incrementalFlowTokens
  );
  assert.equal(artifact.scenario.excludedSurfaces[0].surface, 'cliBridgeResponses');
  assert.ok(
    artifact.totals.incrementalFlowTokens <= artifact.totals.incrementalBudgetMax,
    'Baseline flow prompt exceeded the Phase 1 incremental context budget.'
  );
  assert.equal(artifact.totals.withinBudget, true);
});

test('saved Phase 2 operator-validation artifact points to passing evidence repeats', async () => {
  const artifact = await readRepoJson(
    '.vibe-science-environment/operator-validation/artifacts/phase2-operator-validation.json'
  );

  assert.equal(artifact.artifactId, 'phase2-operator-validation');
  assert.equal(artifact.phase, 2);
  assert.equal(artifact.benchmarkId, 'phase2-memory-packaging');
  assert.equal(artifact.passed, true);
  assert.ok(Array.isArray(artifact.validationClaims) && artifact.validationClaims.length >= 4);
  assert.equal(
    artifact.decisions.staleMirrorBehavior,
    'Mirrors older than 24 hours are flagged as stale in /flow-status until /sync-memory runs again.'
  );
  assert.equal(
    artifact.decisions.sessionDigestContract,
    'Session digests are operational exports under results/summaries and do not become a second truth path.'
  );

  for (const key of ['syncMemory', 'staleWarning', 'packaging', 'findability']) {
    const evidence = artifact.evidence[key];
    await assertRepoPathExists(evidence.sourceRepeat.inputPath);
    await assertRepoPathExists(evidence.sourceRepeat.outputPath);
    await assertRepoPathExists(evidence.sourceRepeat.metricsPath);
    await assertRepoPathExists(evidence.sourceRepeat.summaryPath);
    await assertRepoPathExists(evidence.sourceRepeat.transcriptPath);
  }
});

test('Phase 2 closeout dossier exists and links to the saved evidence surfaces', async () => {
  const closeoutPath =
    'blueprints/definitive-spec/implementation-plan/phase2-closeout.md';
  const closeout = await readFile(
    path.join(repoRoot, closeoutPath),
    'utf8'
  );
  await assertRepoPathExists(closeoutPath);
  assert.match(closeout, /phase2-operator-validation\.json/u);
  assert.match(closeout, /flow-status-results-findability/u);
});
