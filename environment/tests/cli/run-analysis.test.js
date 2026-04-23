import assert from 'node:assert/strict';
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { readJsonl } from '../../control/_io.js';
import { createManifest } from '../../lib/manifest.js';
import {
  activateObjective,
  createObjectiveStore,
} from '../../objectives/store.js';
import { bindExperimentManifestToObjective } from '../../orchestrator/experiment-binding.js';
import { listPhase9LaneRuns } from '../../orchestrator/ledgers.js';
import {
  cleanupCliFixtureProject,
  createCliFixtureProject,
  repoRoot,
  runVre,
} from './_fixture.js';

const FIXTURE_KERNEL_ENV = {
  VRE_KERNEL_PATH: path.join(
    'environment',
    'tests',
    'fixtures',
    'fake-kernel-sibling',
  ),
};

async function pathExists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

async function readFixtureJson(section, fileName) {
  return JSON.parse(
    await readFile(
      path.join(
        repoRoot,
        'environment',
        'tests',
        'fixtures',
        'phase9',
        section,
        fileName,
      ),
      'utf8',
    ),
  );
}

async function writeProjectFile(projectRoot, repoRelativePath, contents) {
  const absolutePath = path.join(projectRoot, repoRelativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, contents, 'utf8');
  return absolutePath;
}

async function seedObjective(projectRoot, options = {}) {
  const objectiveRecord = await readFixtureJson('objective', 'valid-active.json');
  const merged = {
    ...objectiveRecord,
    objectiveId: options.objectiveId ?? 'OBJ-001',
    artifactsIndex: {
      ...objectiveRecord.artifactsIndex,
      experiments: [],
      ...(options.artifactsIndex ?? {}),
    },
    ...(options.overrides ?? {}),
  };

  if (options.active === false) {
    await createObjectiveStore(projectRoot, merged);
  } else {
    await activateObjective(projectRoot, merged, {
      sessionId: 'sess-run-analysis',
    });
  }

  return merged;
}

async function seedExperimentManifest(projectRoot, objectiveId, experimentId = 'EXP-021') {
  const legacyManifest = await readFixtureJson('experiment-binding', 'legacy-vre-experiment-manifest.json');
  await createManifest(projectRoot, {
    ...legacyManifest,
    experimentId,
    objective: objectiveId,
    status: 'planned',
  });
  return experimentId;
}

function buildManifest({
  objectiveId = 'OBJ-001',
  experimentId = 'EXP-021',
  analysisId = 'ANL-safe-001',
  scriptPath = 'analysis/scripts/safe-analysis.mjs',
  inputPath = 'data/input.csv',
  outputPath = 'artifacts/results.json',
} = {}) {
  return {
    schemaVersion: 'phase9.analysis-manifest.v1',
    objectiveId,
    experimentId,
    analysisId,
    script: {
      path: scriptPath,
      sha256: '3333333333333333333333333333333333333333333333333333333333333333',
      language: 'other',
    },
    inputs: [
      {
        path: inputPath,
        kind: 'dataset',
        sha256: null,
        sizeBytes: null,
      },
    ],
    outputs: [
      {
        path: outputPath,
        kind: 'table',
        sha256: null,
        sizeBytes: null,
      },
    ],
    command: {
      runner: 'other',
      argv: [
        scriptPath,
        '--input',
        inputPath,
        '--output',
        outputPath,
      ],
    },
    budget: {
      maxRuntimeSeconds: 60,
      maxMemoryGb: 1,
      allowNetwork: false,
    },
    safety: {
      destructive: false,
      treeWideWrite: false,
      externalCall: false,
    },
    taskKind: 'analysis-execution-run',
    expectedArtifacts: [
      {
        path: outputPath,
        kind: 'table',
        required: true,
      },
    ],
    humanApproval: {
      approved: false,
      approvedBy: null,
      approvedAt: null,
      reason: null,
    },
    createdAt: '2026-04-23T20:00:00Z',
    createdBy: 'sess-run-analysis',
  };
}

async function seedBoundAnalysisContext(projectRoot, options = {}) {
  const objectiveId = options.objectiveId ?? 'OBJ-001';
  const experimentId = options.experimentId ?? 'EXP-021';
  await seedObjective(projectRoot, {
    objectiveId,
    active: options.active,
    overrides: options.objectiveOverrides,
    artifactsIndex: {
      experiments: [],
    },
  });
  await seedExperimentManifest(projectRoot, objectiveId, experimentId);
  await bindExperimentManifestToObjective(projectRoot, objectiveId, experimentId, {
    updatedAt: '2026-04-23T20:01:00Z',
  });

  const manifest = buildManifest({
    objectiveId,
    experimentId,
    analysisId: options.analysisId,
    scriptPath: options.scriptPath,
    inputPath: options.inputPath,
    outputPath: options.outputPath,
  });
  if (typeof options.mutateManifest === 'function') {
    options.mutateManifest(manifest);
  }

  await writeProjectFile(projectRoot, manifest.inputs[0].path, 'input,data\n');
  await writeProjectFile(projectRoot, manifest.script.path, options.scriptContents);
  const manifestPath = options.manifestPath ?? 'analysis/manifests/run-analysis.json';
  await writeProjectFile(projectRoot, manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  return {
    manifest,
    manifestPath,
    absoluteOutputPath: path.join(projectRoot, manifest.outputs[0].path),
    laneRunsPath: path.join(projectRoot, '.vibe-science-environment', 'orchestrator', 'lane-runs.jsonl'),
    eventsPath: path.join(projectRoot, '.vibe-science-environment', 'objectives', objectiveId, 'events.jsonl'),
  };
}

async function readPhase9LaneRuns(projectRoot) {
  const laneRunsPath = path.join(projectRoot, '.vibe-science-environment', 'orchestrator', 'lane-runs.jsonl');
  const records = await readJsonl(laneRunsPath);
  return records.filter((record) => record.schemaVersion === 'phase9.lane-run-record.v1');
}

async function readObjectiveEvents(projectRoot, objectiveId = 'OBJ-001') {
  return readJsonl(
    path.join(projectRoot, '.vibe-science-environment', 'objectives', objectiveId, 'events.jsonl'),
  );
}

const SAFE_SCRIPT = `
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const input = args[args.indexOf('--input') + 1];
const output = args[args.indexOf('--output') + 1];
const raw = await readFile(input, 'utf8');
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, JSON.stringify({ ok: true, inputBytes: raw.length }) + '\\n', 'utf8');
process.stdout.write('safe analysis complete\\n');
`;

const FAILING_SCRIPT = `
process.stderr.write('intentional failure\\n');
process.exit(7);
`;

const MISSING_OUTPUT_SCRIPT = `
process.stdout.write('completed without writing output\\n');
`;

test('run-analysis --dry-run validates the manifest and returns a preview without writing lane runs or events', async () => {
  const projectRoot = await createCliFixtureProject('vre-run-analysis-dry-run-');
  try {
    const context = await seedBoundAnalysisContext(projectRoot, {
      analysisId: 'ANL-dry-001',
      scriptPath: 'analysis/scripts/safe-analysis.mjs',
      inputPath: 'data/input.csv',
      outputPath: 'artifacts/results.json',
      scriptContents: SAFE_SCRIPT,
    });

    const result = await runVre(projectRoot, [
      'run-analysis',
      '--manifest',
      context.manifestPath,
      '--dry-run',
    ], {
      env: FIXTURE_KERNEL_ENV,
    });

    assert.equal(result.code, 0, `stderr=${result.stderr}`);
    assert.equal(result.stderr, '');
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.dryRun, true);
    assert.equal(payload.analysisId, 'ANL-dry-001');
    assert.equal(await pathExists(context.laneRunsPath), false);
    assert.deepEqual(await readObjectiveEvents(projectRoot), []);
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('run-analysis executes a safe script, writes stdout/stderr logs, appends lane runs, and records an objective event', async () => {
  const projectRoot = await createCliFixtureProject('vre-run-analysis-success-');
  try {
    const context = await seedBoundAnalysisContext(projectRoot, {
      analysisId: 'ANL-safe-001',
      scriptPath: 'analysis/scripts/safe-analysis.mjs',
      inputPath: 'data/input.csv',
      outputPath: 'artifacts/results.json',
      scriptContents: SAFE_SCRIPT,
    });

    const result = await runVre(projectRoot, [
      'run-analysis',
      '--manifest',
      context.manifestPath,
    ], {
      env: FIXTURE_KERNEL_ENV,
    });

    assert.equal(result.code, 0, `stderr=${result.stderr}`);
    assert.equal(result.stderr, '');
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.status, 'complete');
    assert.equal(payload.exitCode, 0);
    assert.equal(await pathExists(context.absoluteOutputPath), true);

    const laneRuns = await readPhase9LaneRuns(projectRoot);
    assert.deepEqual(laneRuns.map((record) => record.status), ['running', 'complete']);
    assert.equal(laneRuns.at(-1)?.analysisId, 'ANL-safe-001');
    assert.match(laneRuns.at(-1)?.stdoutPath ?? '', /\.stdout\.log$/u);
    assert.match(laneRuns.at(-1)?.stderrPath ?? '', /\.stderr\.log$/u);
    const sortedPhase9Runs = await listPhase9LaneRuns(projectRoot, {
      objectiveId: 'OBJ-001',
      analysisId: 'ANL-safe-001',
    });
    assert.deepEqual(sortedPhase9Runs.map((record) => record.recordSeq), [2, 1]);

    const objectiveEvents = await readObjectiveEvents(projectRoot);
    assert.equal(objectiveEvents.at(-1)?.kind, 'analysis-run');
    assert.equal(objectiveEvents.at(-1)?.payload.status, 'complete');
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('run-analysis records a failing script as a failed lane run and structured JSON error', async () => {
  const projectRoot = await createCliFixtureProject('vre-run-analysis-failure-');
  try {
    const context = await seedBoundAnalysisContext(projectRoot, {
      analysisId: 'ANL-fail-001',
      scriptPath: 'analysis/scripts/failing-analysis.mjs',
      inputPath: 'data/input.csv',
      outputPath: 'artifacts/results.json',
      scriptContents: FAILING_SCRIPT,
    });

    const result = await runVre(projectRoot, [
      'run-analysis',
      '--manifest',
      context.manifestPath,
    ], {
      env: FIXTURE_KERNEL_ENV,
    });

    assert.equal(result.code, 1, `stderr=${result.stderr}`);
    assert.equal(result.stderr, '');
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, false);
    assert.equal(payload.code, 'E_ANALYSIS_RUN_FAILED');
    assert.equal(payload.status, 'failed');
    assert.equal(payload.exitCode, 7);

    const laneRuns = await readPhase9LaneRuns(projectRoot);
    assert.deepEqual(laneRuns.map((record) => record.status), ['running', 'failed']);
    assert.equal(laneRuns.at(-1)?.exitCode, 7);

    const objectiveEvents = await readObjectiveEvents(projectRoot);
    assert.equal(objectiveEvents.at(-1)?.kind, 'analysis-run');
    assert.equal(objectiveEvents.at(-1)?.payload.status, 'failed');
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('run-analysis marks missing required outputs as a failed recorded run even when the script exits zero', async () => {
  const projectRoot = await createCliFixtureProject('vre-run-analysis-missing-output-');
  try {
    const context = await seedBoundAnalysisContext(projectRoot, {
      analysisId: 'ANL-missing-001',
      scriptPath: 'analysis/scripts/missing-output-analysis.mjs',
      inputPath: 'data/input.csv',
      outputPath: 'artifacts/results.json',
      scriptContents: MISSING_OUTPUT_SCRIPT,
    });

    const result = await runVre(projectRoot, [
      'run-analysis',
      '--manifest',
      context.manifestPath,
    ], {
      env: FIXTURE_KERNEL_ENV,
    });

    assert.equal(result.code, 1, `stderr=${result.stderr}`);
    assert.equal(result.stderr, '');
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, false);
    assert.equal(payload.code, 'E_EXPECTED_OUTPUT_MISSING');
    assert.deepEqual(payload.missingOutputs, ['artifacts/results.json']);
    assert.equal(payload.exitCode, 0);

    const laneRuns = await readPhase9LaneRuns(projectRoot);
    assert.deepEqual(laneRuns.map((record) => record.status), ['running', 'failed']);
    assert.equal(laneRuns.at(-1)?.exitCode, 0);

    const objectiveEvents = await readObjectiveEvents(projectRoot);
    assert.equal(objectiveEvents.at(-1)?.payload.status, 'failed');
    assert.deepEqual(objectiveEvents.at(-1)?.payload.missingOutputs, ['artifacts/results.json']);
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('run-analysis fails closed when no active objective pointer exists', async () => {
  const projectRoot = await createCliFixtureProject('vre-run-analysis-no-lock-');
  try {
    const context = await seedBoundAnalysisContext(projectRoot, {
      analysisId: 'ANL-no-lock-001',
      scriptPath: 'analysis/scripts/safe-analysis.mjs',
      inputPath: 'data/input.csv',
      outputPath: 'artifacts/results.json',
      scriptContents: SAFE_SCRIPT,
      active: false,
    });

    const result = await runVre(projectRoot, [
      'run-analysis',
      '--manifest',
      context.manifestPath,
    ], {
      env: FIXTURE_KERNEL_ENV,
    });

    assert.equal(result.code, 1, `stderr=${result.stderr}`);
    assert.equal(result.stderr, '');
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, false);
    assert.equal(payload.code, 'E_ACTIVE_OBJECTIVE_POINTER_MISSING');
    assert.equal(await pathExists(context.laneRunsPath), false);
    assert.deepEqual(await readObjectiveEvents(projectRoot), []);
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

// Round 59 regression: seq 073 ledger row claims `VRE_RUN_ANALYSIS_TIMEOUT_MS`
// as a feature flag but the runtime never honoured it. This test pins the
// operator-level timeout cap: a slow script with a generous manifest budget
// (60s) must be killed when VRE_RUN_ANALYSIS_TIMEOUT_MS is set to a much
// shorter value (400ms), producing a recorded `interrupted` final record.
const SLOW_SCRIPT = `
await new Promise((resolve) => setTimeout(resolve, 5000));
process.stdout.write('should have been killed\\n');
`;

test('run-analysis honours VRE_RUN_ANALYSIS_TIMEOUT_MS as an operator-level cap on the manifest budget', async () => {
  const projectRoot = await createCliFixtureProject('vre-run-analysis-env-timeout-');
  try {
    const context = await seedBoundAnalysisContext(projectRoot, {
      analysisId: 'ANL-env-timeout-001',
      scriptPath: 'analysis/scripts/slow-analysis.mjs',
      inputPath: 'data/input.csv',
      outputPath: 'artifacts/results.json',
      scriptContents: SLOW_SCRIPT,
    });

    const result = await runVre(projectRoot, [
      'run-analysis',
      '--manifest',
      context.manifestPath,
    ], {
      env: {
        ...FIXTURE_KERNEL_ENV,
        VRE_RUN_ANALYSIS_TIMEOUT_MS: '400',
      },
    });

    assert.equal(result.code, 1, `stderr=${result.stderr}`);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, false);
    assert.equal(payload.status, 'interrupted');

    const laneRuns = await readPhase9LaneRuns(projectRoot);
    assert.deepEqual(laneRuns.map((record) => record.status), ['running', 'interrupted']);
    assert.equal(laneRuns.at(-1)?.exitCode, null);
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});
