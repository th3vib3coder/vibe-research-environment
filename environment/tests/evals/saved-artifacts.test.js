import test from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import path from 'node:path';

import {
  EXPECTED_TASK_FILES,
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

test('saved benchmark artifacts exist for every Phase 1 task and include the required files', async () => {
  for (const fileName of EXPECTED_TASK_FILES) {
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
