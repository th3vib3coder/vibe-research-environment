import { constants as fsConstants } from 'node:fs';
import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getRepoRoot } from './_workspace.js';
import { readJson, writeJson } from './_saved-artifacts.js';
import { savePhase3Artifacts } from './save-phase3-artifacts.js';

const repoRoot = getRepoRoot();
const operatorValidationRoot = path.join(
  repoRoot,
  '.vibe-science-environment',
  'operator-validation',
);
const artifactsRoot = path.join(operatorValidationRoot, 'artifacts');
const benchmarksRoot = path.join(operatorValidationRoot, 'benchmarks');
const artifactPath = path.join(artifactsRoot, 'phase3-operator-validation.json');
const archivedArtifactPath = path.join(
  artifactsRoot,
  'archive',
  'phase3-operator-validation.pre-5_5.json',
);
const benchmarkId = 'phase3-writing-deliverables';

const evidenceMap = Object.freeze({
  positiveExport: {
    taskId: 'flow-writing-export-eligibility-positive',
    claim:
      'Strict promoted claim with verified citations flows into claim-backed writing.',
  },
  defaultModeBlock: {
    taskId: 'flow-writing-default-mode-blocked',
    claim:
      'Default-mode claim remains blocked until a fresh schema-validation artifact exists.',
  },
  snapshotTraceability: {
    taskId: 'flow-writing-snapshot-export',
    claim:
      'Snapshot identifiers remain traceable across snapshot, seed, and export record.',
  },
  advisorPack: {
    taskId: 'flow-writing-advisor-pack',
    claim:
      'Advisor pack assembly writes reviewable files and copied figure evidence.',
  },
  rebuttalPack: {
    taskId: 'flow-writing-rebuttal-pack',
    claim:
      'Rebuttal pack assembly organizes comments and claim status without resolving truth.',
  },
  warningReplay: {
    taskId: 'flow-writing-warning-replay',
    claim:
      'Post-export warning replay appends visible alerts after claim or citation drift.',
  },
  resultsPolicy: {
    taskId: 'flow-results-export-policy',
    claim:
      'Results packaging surfaces claim export-readiness annotations without owning policy.',
  },
});

function sourceRepeat(taskId, repeatId) {
  return {
    taskId,
    repeatId,
    inputPath: `.vibe-science-environment/operator-validation/benchmarks/${taskId}/${repeatId}/input.json`,
    outputPath: `.vibe-science-environment/operator-validation/benchmarks/${taskId}/${repeatId}/output.json`,
    metricsPath: `.vibe-science-environment/operator-validation/benchmarks/${taskId}/${repeatId}/metrics.json`,
    summaryPath: `.vibe-science-environment/operator-validation/benchmarks/${taskId}/${repeatId}/summary.json`,
    transcriptPath: `.vibe-science-environment/operator-validation/benchmarks/${taskId}/${repeatId}/transcript.md`,
  };
}

function notApplicable(reason) {
  return {
    status: 'not-applicable',
    reason,
  };
}

function median(values) {
  const numeric = values
    .filter((value) => typeof value === 'number' && Number.isFinite(value))
    .sort((left, right) => left - right);
  if (numeric.length === 0) {
    throw new Error('Cannot compute median from an empty numeric set.');
  }
  const midpoint = Math.floor(numeric.length / 2);
  return numeric.length % 2 === 1
    ? numeric[midpoint]
    : (numeric[midpoint - 1] + numeric[midpoint]) / 2;
}

function elapsedSeconds(summary) {
  const started = Date.parse(summary.startedAt);
  const ended = Date.parse(summary.endedAt);
  if (!Number.isFinite(started) || !Number.isFinite(ended)) {
    throw new Error(`Repeat ${summary.taskId}/${summary.repeatId} has invalid timestamps.`);
  }
  return Number(((ended - started) / 1000).toFixed(3));
}

function minMetric(summaries, metricName) {
  return Math.min(...summaries.map((summary) => {
    const value = summary.metrics?.[metricName];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`Repeat ${summary.taskId}/${summary.repeatId} lacks numeric ${metricName}.`);
    }
    return value;
  }));
}

function maxMetric(summaries, metricName) {
  return Math.max(...summaries.map((summary) => {
    const value = summary.metrics?.[metricName];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`Repeat ${summary.taskId}/${summary.repeatId} lacks numeric ${metricName}.`);
    }
    return value;
  }));
}

async function archivePreviousArtifact() {
  await mkdir(path.dirname(archivedArtifactPath), { recursive: true });
  try {
    await copyFile(artifactPath, archivedArtifactPath, fsConstants.COPYFILE_EXCL);
  } catch (error) {
    if (error?.code !== 'ENOENT' && error?.code !== 'EEXIST') {
      throw error;
    }
  }
}

async function loadSummary(taskId, repeatId) {
  return readJson(path.join(benchmarksRoot, taskId, repeatId, 'summary.json'));
}

async function buildEvidenceEntry(key, config, repeatIds) {
  const summaries = await Promise.all(
    repeatIds.map((repeatId) => loadSummary(config.taskId, repeatId)),
  );
  const latestRepeatId = repeatIds.at(-1);
  const repeats = repeatIds.map((repeatId) => sourceRepeat(config.taskId, repeatId));

  return [
    key,
    {
      claim: config.claim,
      sourceRepeat: sourceRepeat(config.taskId, latestRepeatId),
      sourceRepeats: repeats,
      metrics: {
        resumeLatencySeconds: median(summaries.map(elapsedSeconds)),
        degradedHonestyScore: notApplicable(
          'Phase 3 writing deliverable scenarios run kernel-backed; degraded mode is covered by Phase 1 degraded-kernel-mode evidence.',
        ),
        stateWriteScopeViolations: maxMetric(summaries, 'stateWriteScopeViolations'),
        attemptLifecycleCompleteness: minMetric(summaries, 'attemptLifecycleCompleteness'),
        snapshotPublishSuccess: minMetric(summaries, 'snapshotPublishSuccess'),
        repeatCount: summaries.length,
      },
    },
  ];
}

async function regenerateArtifact() {
  await archivePreviousArtifact();
  const saved = await savePhase3Artifacts({ repeatCount: 3 });
  const repeatIdsByTask = new Map();

  for (const entry of saved) {
    if (!repeatIdsByTask.has(entry.taskId)) {
      repeatIdsByTask.set(entry.taskId, []);
    }
    repeatIdsByTask.get(entry.taskId).push(entry.repeatId);
  }

  const evidenceEntries = await Promise.all(
    Object.entries(evidenceMap).map(([key, config]) => {
      const repeatIds = repeatIdsByTask.get(config.taskId) ?? [];
      if (repeatIds.length < 3) {
        throw new Error(`Expected at least 3 regenerated repeats for ${config.taskId}.`);
      }
      return buildEvidenceEntry(key, config, repeatIds);
    }),
  );
  const evidence = Object.fromEntries(evidenceEntries);
  const sourceRepeats = Object.fromEntries(
    Object.entries(evidence).map(([key, value]) => [key, value.sourceRepeats]),
  );

  const artifact = {
    schemaVersion: 'vibe-env.operator-validation-artifact.v1',
    artifactId: 'phase3-operator-validation',
    phase: 3,
    benchmarkId,
    generatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    passed: true,
    replacesArtifact:
      '.vibe-science-environment/operator-validation/artifacts/archive/phase3-operator-validation.pre-5_5.json',
    validationClaims: [
      evidenceMap.positiveExport.claim,
      evidenceMap.defaultModeBlock.claim,
      evidenceMap.snapshotTraceability.claim,
      evidenceMap.advisorPack.claim,
      evidenceMap.rebuttalPack.claim,
      evidenceMap.warningReplay.claim,
      evidenceMap.resultsPolicy.claim,
    ],
    decisions: {
      profileSafetyDegradedMode:
        'Missing governanceProfileAtCreation metadata stays explicit degraded compatibility, not silent strict equivalence.',
      exportSnapshotAndReplay:
        'Claim-backed writing always references a frozen snapshot and later drift is surfaced as append-only alerts against that snapshot.',
      metricRegeneration:
        'Phase 5.5 regenerates three live repeats per Phase 3 task; non-exercised degradation metrics are recorded as structured not-applicable objects, never null.',
    },
    sourceRepeats,
    evidence,
  };

  await writeJson(artifactPath, artifact);
  return artifact;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const artifact = await regenerateArtifact();
    console.log(
      'saved .vibe-science-environment/operator-validation/artifacts/phase3-operator-validation.json',
    );
    console.log(`evidence keys ${Object.keys(artifact.evidence).length}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

export { regenerateArtifact as savePhase3OperatorValidationArtifact };
