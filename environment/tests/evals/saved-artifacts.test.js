import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

import {
  assertRepoPathExists,
  PHASE1_EXPECTED_TASK_FILES,
  PHASE2_EXPECTED_TASK_FILES,
  PHASE3_EXPECTED_TASK_FILES,
  PHASE4_EXPECTED_TASK_FILES,
  PHASE5_EXPECTED_TASK_FILES,
  repoRoot,
  listSavedBenchmarkRepeats,
  readRepoJson
} from './_helpers.js';
import { buildReviewExecutorForMode } from '../../evals/save-phase5-artifacts.js';

// Blueprint planning docs are kept private and not published to the public
// repo. Tests that assert on closeout dossier content skip when the
// directory is absent — the dossier tests are useful for local dev loops,
// but they cannot run in a fresh public checkout.
const BLUEPRINTS_ROOT = path.join(
  repoRoot,
  'blueprints',
  'definitive-spec',
  'implementation-plan',
);
const BLUEPRINTS_PRESENT = existsSync(BLUEPRINTS_ROOT);

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

function assertNoNullValues(value, label) {
  if (value === null) {
    assert.fail(`${label} must not contain null`);
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoNullValues(entry, `${label}[${index}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      assertNoNullValues(entry, `${label}.${key}`);
    }
  }
}

function assertMetricValue(value, label) {
  if (typeof value === 'number') {
    assert.ok(Number.isFinite(value), `${label} must be finite`);
    return;
  }
  assert.equal(value?.status, 'not-applicable', `${label} must be numeric or structured not-applicable`);
  assert.equal(typeof value.reason, 'string');
  assert.notEqual(value.reason.trim(), '');
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

test('saved benchmark artifacts exist for every Phase 3 task and include the required files', async () => {
  for (const fileName of PHASE3_EXPECTED_TASK_FILES) {
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
    assert.equal(summary.benchmarkId, 'phase3-writing-deliverables');
    assert.equal(summary.passed, true, `Expected saved repeat ${taskId}/${repeatId} to pass`);
    assert.ok(Array.isArray(summary.actualWrites));
    assert.equal(typeof summary.transcriptPath, 'string');
    await access(path.join(repoRoot, summary.transcriptPath));
  }
});

test('saved benchmark artifacts exist for every Phase 4 task and include the required files', async () => {
  for (const fileName of PHASE4_EXPECTED_TASK_FILES) {
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
    assert.equal(summary.benchmarkId, 'phase4-external-surfaces');
    assert.equal(summary.passed, true, `Expected saved repeat ${taskId}/${repeatId} to pass`);
    assert.ok(Array.isArray(summary.actualWrites));
    assert.equal(typeof summary.transcriptPath, 'string');
    await access(path.join(repoRoot, summary.transcriptPath));
  }
});

test('saved benchmark artifacts exist for every Phase 5 task and include the required files', async () => {
  for (const fileName of PHASE5_EXPECTED_TASK_FILES) {
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
    assert.equal(summary.benchmarkId, 'phase5-orchestrator-mvp');
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

test('saved Phase 3 export-eligibility artifact records one shared-helper positive export path', async () => {
  const repeats = await listSavedBenchmarkRepeats('flow-writing-export-eligibility-positive');
  const latestRepeat = repeats.at(-1);
  const output = await readRepeatArtifact(
    'flow-writing-export-eligibility-positive',
    latestRepeat,
    'output.json'
  );

  assert.equal(output.result.payload.snapshot.claims[0].eligible, true);
  assert.equal(output.result.payload.seeds.length, 1);
  assert.equal(output.result.payload.exportRecord.claimId, 'C-501');
  assert.equal(output.result.payload.exportRecord.snapshotId, 'WEXP-2026-04-03-501');
});

test('saved Phase 3 default-mode block artifact records explicit schema-validation gating', async () => {
  const repeats = await listSavedBenchmarkRepeats('flow-writing-default-mode-blocked');
  const latestRepeat = repeats.at(-1);
  const output = await readRepeatArtifact(
    'flow-writing-default-mode-blocked',
    latestRepeat,
    'output.json'
  );

  assert.equal(output.result.payload.seeds.length, 0);
  assert.match(
    output.result.payload.blockedClaims[0].reasons.join(','),
    /needs_fresh_schema_validation/u
  );
  assert.equal(output.result.payload.snapshot.claims[0].governanceProfileAtCreation, 'default');
});

test('saved Phase 3 snapshot-export artifact keeps snapshot ids traceable across writing outputs', async () => {
  const repeats = await listSavedBenchmarkRepeats('flow-writing-snapshot-export');
  const latestRepeat = repeats.at(-1);
  const output = await readRepeatArtifact(
    'flow-writing-snapshot-export',
    latestRepeat,
    'output.json'
  );
  const summary = await readRepeatArtifact(
    'flow-writing-snapshot-export',
    latestRepeat,
    'summary.json'
  );

  assert.equal(output.result.payload.snapshot.snapshotId, 'WEXP-2026-04-03-503');
  assert.equal(output.result.payload.seed.snapshotId, 'WEXP-2026-04-03-503');
  assert.equal(output.result.payload.exportRecord.snapshotId, 'WEXP-2026-04-03-503');
  assert.ok(summary.actualWrites.includes('.vibe-science-environment/writing/exports/export-log.jsonl'));
});

test('saved Phase 3 pack artifacts prove both advisor and rebuttal pack assembly', async () => {
  const advisorRepeats = await listSavedBenchmarkRepeats('flow-writing-advisor-pack');
  const rebuttalRepeats = await listSavedBenchmarkRepeats('flow-writing-rebuttal-pack');
  const advisorOutput = await readRepeatArtifact(
    'flow-writing-advisor-pack',
    advisorRepeats.at(-1),
    'output.json'
  );
  const rebuttalOutput = await readRepeatArtifact(
    'flow-writing-rebuttal-pack',
    rebuttalRepeats.at(-1),
    'output.json'
  );

  assert.equal(advisorOutput.result.payload.packType, 'advisor');
  assert.ok(advisorOutput.result.payload.copiedFigures.length >= 1);
  assert.equal(rebuttalOutput.result.payload.packType, 'rebuttal');
  assert.deepEqual(rebuttalOutput.result.payload.claimIds, ['C-504']);
});

test('saved Phase 3 warning replay artifact records visible post-export alerts after drift', async () => {
  const repeats = await listSavedBenchmarkRepeats('flow-writing-warning-replay');
  const latestRepeat = repeats.at(-1);
  const output = await readRepeatArtifact(
    'flow-writing-warning-replay',
    latestRepeat,
    'output.json'
  );

  assert.ok(
    output.result.payload.alerts.some((entry) => entry.kind === 'claim_killed')
  );
  assert.ok(
    output.result.payload.alerts.some((entry) => entry.kind === 'citation_invalidated')
  );
  assert.ok(
    output.actualWrites.includes('.vibe-science-environment/writing/exports/export-alerts.jsonl')
  );
});

test('saved Phase 3 results-policy artifact proves results and writing share the export helper surface', async () => {
  const repeats = await listSavedBenchmarkRepeats('flow-results-export-policy');
  const latestRepeat = repeats.at(-1);
  const output = await readRepeatArtifact(
    'flow-results-export-policy',
    latestRepeat,
    'output.json'
  );

  assert.equal(output.result.payload.claimExportStatuses.length, 1);
  assert.equal(output.result.payload.claimExportStatuses[0].claimId, 'C-507');
  assert.match(
    output.result.payload.claimExportStatuses[0].reasons.join(','),
    /unverified_citations/u
  );
});

test('saved Phase 4 connector artifact records visible failure through flow-status', async () => {
  const repeats = await listSavedBenchmarkRepeats('flow-status-connector-failure-visibility');
  const latestRepeat = repeats.at(-1);
  const output = await readRepeatArtifact(
    'flow-status-connector-failure-visibility',
    latestRepeat,
    'output.json'
  );

  assert.equal(output.result.connectors.runtimeInstalled, true);
  assert.equal(output.result.connectors.totalConnectors, 2);
  assert.equal(output.result.connectors.connectors[0].connectorId, 'filesystem-export');
  assert.equal(output.result.connectors.connectors[0].healthStatus, 'degraded');
  assert.match(output.result.connectors.connectors[0].failureMessage, /EXP-404/u);
});

test('saved Phase 4 automation artifacts stay reviewable and visible', async () => {
  const weeklyRepeats = await listSavedBenchmarkRepeats('weekly-digest-reviewable-artifact');
  const staleRepeats = await listSavedBenchmarkRepeats('stale-memory-reminder-reviewable-artifact');
  const exportRepeats = await listSavedBenchmarkRepeats('export-warning-digest-reviewable-artifact');

  const weeklyOutput = await readRepeatArtifact(
    'weekly-digest-reviewable-artifact',
    weeklyRepeats.at(-1),
    'output.json'
  );
  const staleOutput = await readRepeatArtifact(
    'stale-memory-reminder-reviewable-artifact',
    staleRepeats.at(-1),
    'output.json'
  );
  const exportOutput = await readRepeatArtifact(
    'export-warning-digest-reviewable-artifact',
    exportRepeats.at(-1),
    'output.json'
  );

  assert.match(weeklyOutput.result.payload.latestArtifactPath, /weekly-research-digest\/2026-W14\.md/u);
  assert.equal(weeklyOutput.result.payload.status, 'completed');
  assert.match(staleOutput.result.payload.latestArtifactPath, /memory-stale-2026-04-01T08-00-00Z\.md/u);
  assert.match(staleOutput.result.payload.artifactPreview, /STALE/u);
  assert.match(exportOutput.result.payload.latestArtifactPath, /alerts-WALERT-2026-04-04-001-1\.md/u);
  assert.match(exportOutput.result.payload.artifactPreview, /WALERT-2026-04-04-001/u);
});

test('saved Phase 4 domain-pack artifacts prove activation and fallback stay preset-only', async () => {
  const omicsRepeats = await listSavedBenchmarkRepeats('flow-status-domain-pack-omics');
  const fallbackRepeats = await listSavedBenchmarkRepeats('flow-status-domain-pack-fallback');
  const omicsOutput = await readRepeatArtifact(
    'flow-status-domain-pack-omics',
    omicsRepeats.at(-1),
    'output.json'
  );
  const fallbackOutput = await readRepeatArtifact(
    'flow-status-domain-pack-fallback',
    fallbackRepeats.at(-1),
    'output.json'
  );

  assert.equal(omicsOutput.result.domain.activePackId, 'omics');
  assert.equal(omicsOutput.result.domain.authorityBoundary, 'presets-only');
  assert.equal(omicsOutput.result.domain.deliverablePresets.reportTemplate, 'omics-standard');
  assert.ok(omicsOutput.result.domain.workflowPresets.commonConfounders.includes('batch_effect'));

  assert.equal(fallbackOutput.result.domain.activePackId, null);
  assert.equal(fallbackOutput.result.domain.configState, 'invalid');
  assert.equal(fallbackOutput.result.domain.displayName, 'Default Presets');
  assert.match(fallbackOutput.result.domain.warnings.join('\n'), /Ignoring invalid domain config/u);
});

test('saved Phase 5 queue-resume artifact proves queued orchestrator work can be resumed safely', async () => {
  const repeats = await listSavedBenchmarkRepeats('orchestrator-status-queue-resume');
  const latestRepeat = repeats.at(-1);
  const output = await readRepeatArtifact(
    'orchestrator-status-queue-resume',
    latestRepeat,
    'output.json'
  );

  assert.equal(output.result.payload.firstStatus.queueTotal, 1);
  assert.equal(output.result.payload.firstStatus.nextActionKind, 'run-ready-task');
  assert.equal(output.result.payload.resumedRun.laneRunStatus, 'completed');
  assert.equal(output.result.payload.resumedRun.digestId, 'DIGEST-ORCH-SESSION-RESUME');
  assert.equal(output.result.payload.finalStatus.completedCount, 1);
});

test('saved Phase 5 continuity artifact proves profile, query, and full modes remain read-only and helper-backed', async () => {
  const repeats = await listSavedBenchmarkRepeats('orchestrator-continuity-modes');
  const latestRepeat = repeats.at(-1);
  const output = await readRepeatArtifact(
    'orchestrator-continuity-modes',
    latestRepeat,
    'output.json'
  );

  assert.equal(output.result.payload.profileMode.recallCount, 0);
  assert.equal(output.result.payload.queryMode.firstSourceType, 'lane-run');
  assert.equal(output.result.payload.fullMode.firstSourceType, 'lane-run');
  assert.equal(output.result.payload.historyBeforeAssemblyCount, 2);
  assert.equal(output.result.payload.historyAfterAssemblyCount, 2);
  assert.equal(output.result.payload.historyChangedDuringAssembly, false);
});

test('saved Phase 5 lineage artifact proves execution and review share one execution-backed lineage', async () => {
  const repeats = await listSavedBenchmarkRepeats('orchestrator-execution-review-lineage');
  const latestRepeat = repeats.at(-1);
  const output = await readRepeatArtifact(
    'orchestrator-execution-review-lineage',
    latestRepeat,
    'output.json'
  );

  assert.equal(output.result.payload.execution.laneRunStatus, 'completed');
  assert.equal(output.result.payload.execution.digestId, 'DIGEST-ORCH-SESSION-REVIEW');
  // Phase 6.2 FU-6-007 tightening:
  // This saved evidence backs the Phase 5 Gate 3 real-Codex claim, so the
  // artifact must prove provider-specific real evidence, not just "some"
  // review mode. A mock or smoke repeat is useful evidence for other gates,
  // but it must not satisfy this one.
  const review = output.result.payload.review;
  assert.ok(
    ['affirmed', 'challenged', 'inconclusive'].includes(review.verdict),
    `review verdict must be a valid enum value; got "${review.verdict}"`,
  );
  assert.equal(review.executionLineageVisible, true);
  assert.equal(review.providerRef, 'openai/codex');
  assert.equal(review.integrationKind, 'provider-cli');
  assert.equal(review.evidenceMode, 'real-cli-binding-codex');
  assert.match(review.externalReviewId, /^ORCH-REVIEW-/u);
  assert.equal(review.externalReview?.externalReviewId, review.externalReviewId);
  assert.equal(review.externalReview?.reviewLaneRunId, review.reviewLaneRunId);
  assert.equal(review.externalReview?.verdict, review.verdict);
  assert.equal(review.externalReview?.followUpAction, review.followUpAction);
  assert.ok(
    Array.isArray(review.externalReview?.comparedArtifactRefs)
      && review.externalReview.comparedArtifactRefs.length >= 1,
    'saved evidence must include the durable external-review-log record, not only the lane-run summary',
  );
  assert.ok(
    Array.isArray(review.comparedArtifactRefs) && review.comparedArtifactRefs.length >= 1,
    'real-Codex lineage evidence must expose at least one compared artifact ref',
  );
  assert.equal(typeof review.materialMismatch, 'boolean');
  assert.ok(
    ['none', 'reroute', 'escalate', 'revise', 'accept-with-warning'].includes(review.followUpAction),
    `review.followUpAction must be a valid enum value; got "${review.followUpAction}"`,
  );
  // status.completedCount varies with verdict (challenged triggers escalation).
  // Assert queue total instead — lineage is what we're testing.
  assert.ok(output.result.payload.status.queueTotal >= 1);
});

test('saved Phase 5 bounded-failure artifact proves failures stay visible through recovery and status', async () => {
  const repeats = await listSavedBenchmarkRepeats('orchestrator-bounded-failure-recovery');
  const latestRepeat = repeats.at(-1);
  const output = await readRepeatArtifact(
    'orchestrator-bounded-failure-recovery',
    latestRepeat,
    'output.json'
  );

  assert.equal(output.result.payload.run.laneRunStatus, 'escalated');
  assert.equal(output.result.payload.run.failureClass, 'tool-failure');
  assert.equal(output.result.payload.run.recoveryAction, 'escalate-to-user');
  assert.equal(output.result.payload.status.nextActionKind, 'resolve-escalation');
  assert.equal(output.result.payload.status.latestEscalationStatus, 'pending');
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

test('saved Phase 3 operator-validation artifact points to passing evidence repeats', async () => {
  const artifact = await readRepoJson(
    '.vibe-science-environment/operator-validation/artifacts/phase3-operator-validation.json'
  );

  assert.equal(artifact.schemaVersion, 'vibe-env.operator-validation-artifact.v1');
  assert.equal(artifact.artifactId, 'phase3-operator-validation');
  assert.equal(artifact.phase, 3);
  assert.equal(artifact.benchmarkId, 'phase3-writing-deliverables');
  assert.equal(artifact.passed, true);
  assert.equal(typeof artifact.generatedAt, 'string');
  assert.match(artifact.replacesArtifact, /phase3-operator-validation\.pre-5_5\.json/u);
  assertNoNullValues(artifact, 'phase3-operator-validation');
  assert.ok(Array.isArray(artifact.validationClaims) && artifact.validationClaims.length >= 5);
  assert.equal(
    artifact.decisions.profileSafetyDegradedMode,
    'Missing governanceProfileAtCreation metadata stays explicit degraded compatibility, not silent strict equivalence.'
  );
  assert.equal(
    artifact.decisions.exportSnapshotAndReplay,
    'Claim-backed writing always references a frozen snapshot and later drift is surfaced as append-only alerts against that snapshot.'
  );

  for (const key of [
    'positiveExport',
    'defaultModeBlock',
    'snapshotTraceability',
    'advisorPack',
    'rebuttalPack',
    'warningReplay',
    'resultsPolicy',
  ]) {
    const evidence = artifact.evidence[key];
    assert.ok(Array.isArray(evidence.sourceRepeats));
    assert.equal(evidence.sourceRepeats.length, 3);
    assert.ok(Array.isArray(artifact.sourceRepeats[key]));
    assert.equal(artifact.sourceRepeats[key].length, 3);
    for (const [metricName, metricValue] of Object.entries(evidence.metrics)) {
      assertMetricValue(metricValue, `${key}.${metricName}`);
    }
    await assertRepoPathExists(evidence.sourceRepeat.inputPath);
    await assertRepoPathExists(evidence.sourceRepeat.outputPath);
    await assertRepoPathExists(evidence.sourceRepeat.metricsPath);
    await assertRepoPathExists(evidence.sourceRepeat.summaryPath);
    await assertRepoPathExists(evidence.sourceRepeat.transcriptPath);
    for (const repeat of evidence.sourceRepeats) {
      await assertRepoPathExists(repeat.summaryPath);
      await assertRepoPathExists(repeat.transcriptPath);
      const summary = await readRepoJson(repeat.summaryPath);
      assertNoNullValues(summary.metrics, `${key}.${repeat.repeatId}.summary.metrics`);
    }
  }

  await assertRepoPathExists(artifact.replacesArtifact);
});

test('Phase 5 real-cli-binding evidence mode fails closed when no CLI is configured', async () => {
  const previousCodex = process.env.VRE_CODEX_CLI;
  const previousClaude = process.env.VRE_CLAUDE_CLI;
  delete process.env.VRE_CODEX_CLI;
  delete process.env.VRE_CLAUDE_CLI;

  try {
    await assert.rejects(
      () => buildReviewExecutorForMode('real-cli-binding'),
      /requires VRE_CODEX_CLI or VRE_CLAUDE_CLI/u,
    );
  } finally {
    if (previousCodex === undefined) {
      delete process.env.VRE_CODEX_CLI;
    } else {
      process.env.VRE_CODEX_CLI = previousCodex;
    }
    if (previousClaude === undefined) {
      delete process.env.VRE_CLAUDE_CLI;
    } else {
      process.env.VRE_CLAUDE_CLI = previousClaude;
    }
  }
});

test('saved Phase 4 operator-validation artifact points to passing evidence repeats', async () => {
  const artifact = await readRepoJson(
    '.vibe-science-environment/operator-validation/artifacts/phase4-operator-validation.json'
  );

  assert.equal(artifact.artifactId, 'phase4-operator-validation');
  assert.equal(artifact.phase, 4);
  assert.equal(artifact.benchmarkId, 'phase4-external-surfaces');
  assert.equal(artifact.passed, true);
  assert.ok(Array.isArray(artifact.validationClaims) && artifact.validationClaims.length >= 5);
  assert.equal(
    artifact.decisions.connectorFailureVisibility,
    'Connector failures stay observational and become operator-visible through status surfaces without inventing recovery.'
  );
  assert.equal(
    artifact.decisions.domainPackAuthorityBoundary,
    'Domain packs change presets only and invalid activation falls back to neutral defaults instead of altering truth semantics.'
  );

  for (const key of [
    'connectorFailure',
    'weeklyDigest',
    'staleMemoryReminder',
    'exportWarningDigest',
    'domainOmics',
    'domainFallback',
  ]) {
    const evidence = artifact.evidence[key];
    await assertRepoPathExists(evidence.sourceRepeat.inputPath);
    await assertRepoPathExists(evidence.sourceRepeat.outputPath);
    await assertRepoPathExists(evidence.sourceRepeat.metricsPath);
    await assertRepoPathExists(evidence.sourceRepeat.summaryPath);
    await assertRepoPathExists(evidence.sourceRepeat.transcriptPath);
  }
});

test('saved Phase 5 operator-validation artifact points to passing evidence repeats', async () => {
  const artifact = await readRepoJson(
    '.vibe-science-environment/operator-validation/artifacts/phase5-operator-validation.json'
  );

  assert.equal(artifact.artifactId, 'phase5-operator-validation');
  assert.equal(artifact.phase, 5);
  assert.equal(artifact.benchmarkId, 'phase5-orchestrator-mvp');
  assert.equal(artifact.passed, true);
  assert.ok(Array.isArray(artifact.validationClaims) && artifact.validationClaims.length >= 4);
  assert.equal(
    artifact.decisions.continuityUpdatePolicy,
    'Continuity profile changes remain explicit operator actions or explicit confirmed proposals; read paths do not mutate the profile.'
  );
  assert.equal(
    artifact.decisions.publicResumeSurface,
    'Phase 5 resume stays operator-visible through /orchestrator-status plus taskId-based rerun, not hidden background workers.'
  );

  for (const key of [
    'queueResume',
    'continuityModes',
    'executionReview',
    'boundedFailure',
  ]) {
    const evidence = artifact.evidence[key];
    await assertRepoPathExists(evidence.sourceRepeat.inputPath);
    await assertRepoPathExists(evidence.sourceRepeat.outputPath);
    await assertRepoPathExists(evidence.sourceRepeat.metricsPath);
    await assertRepoPathExists(evidence.sourceRepeat.summaryPath);
    await assertRepoPathExists(evidence.sourceRepeat.transcriptPath);
  }
});

test('saved Phase 5 context and cost artifact records an honest continuity and coordinator baseline', async () => {
  const artifact = await readRepoJson(
    '.vibe-science-environment/operator-validation/artifacts/phase5-context-and-cost-baseline.json'
  );

  assert.equal(artifact.artifactId, 'phase5-context-and-cost-baseline');
  assert.equal(artifact.phase, 5);
  assert.equal(artifact.passed, true);
  assert.equal(artifact.scenario.cycleRunCommand, '/orchestrator-run');
  assert.equal(artifact.scenario.cycleStatusCommand, '/orchestrator-status');
  assert.ok(artifact.sources.continuity.profileMode.totalTokens > 0);
  assert.ok(artifact.sources.continuity.fullMode.totalTokens >= artifact.sources.continuity.queryMode.totalTokens);
  assert.equal(artifact.sources.continuity.fullMode.withinSubBudget, true);
  assert.equal(artifact.providerObservations.executionLane.integrationKind, 'local-logic');
  assert.equal(artifact.providerObservations.reviewLane.integrationKind, 'local-cli');
  assert.ok(artifact.totals.coordinatorCycleElapsedSeconds >= 0);
});

test('Phase 2 closeout dossier exists and links to the saved evidence surfaces', { skip: !BLUEPRINTS_PRESENT && 'blueprints/ not present on this checkout' }, async () => {
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

test('Phase 3 closeout dossier exists and links to the saved evidence surfaces', { skip: !BLUEPRINTS_PRESENT && 'blueprints/ not present on this checkout' }, async () => {
  const closeoutPath =
    'blueprints/definitive-spec/implementation-plan/phase3-closeout.md';
  const closeout = await readFile(
    path.join(repoRoot, closeoutPath),
    'utf8'
  );
  await assertRepoPathExists(closeoutPath);
  assert.match(closeout, /phase3-operator-validation\.json/u);
  assert.match(closeout, /flow-writing-warning-replay/u);
  assert.match(closeout, /flow-writing-advisor-pack/u);
  assert.match(closeout, /flow-writing-rebuttal-pack/u);
});

test('Phase 4 closeout dossier exists and links to the saved evidence surfaces', { skip: !BLUEPRINTS_PRESENT && 'blueprints/ not present on this checkout' }, async () => {
  const closeoutPath =
    'blueprints/definitive-spec/implementation-plan/phase4-closeout.md';
  const closeout = await readFile(
    path.join(repoRoot, closeoutPath),
    'utf8'
  );
  await assertRepoPathExists(closeoutPath);
  assert.match(closeout, /phase4-operator-validation\.json/u);
  assert.match(closeout, /flow-status-connector-failure-visibility/u);
  assert.match(closeout, /weekly-digest-reviewable-artifact/u);
  assert.match(closeout, /flow-status-domain-pack-omics/u);
});

test('Phase 5 closeout dossier exists and links to the saved evidence surfaces', { skip: !BLUEPRINTS_PRESENT && 'blueprints/ not present on this checkout' }, async () => {
  const closeoutPath =
    'blueprints/definitive-spec/implementation-plan/phase5-closeout.md';
  const closeout = await readFile(
    path.join(repoRoot, closeoutPath),
    'utf8'
  );
  await assertRepoPathExists(closeoutPath);
  assert.match(closeout, /phase5-operator-validation\.json/u);
  assert.match(closeout, /phase5-context-and-cost-baseline\.json/u);
  assert.match(closeout, /orchestrator-status-queue-resume/u);
  assert.match(closeout, /orchestrator-execution-review-lineage/u);
  assert.match(closeout, /orchestrator-bounded-failure-recovery/u);
});
