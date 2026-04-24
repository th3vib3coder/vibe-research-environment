import assert from 'node:assert/strict';
import { access, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { readJsonl } from '../../control/_io.js';
import { createManifest } from '../../lib/manifest.js';
import {
  activateObjective,
  createActiveObjectivePointer,
  createObjectiveStore,
  objectiveDir,
  readActiveObjectivePointer,
  readObjectiveRecord
} from '../../objectives/store.js';
import { appendObjectiveEvent, readResumeSnapshot } from '../../objectives/resume-snapshot.js';
import { runResearchLoopCommand } from '../../orchestrator/autonomy-runtime.js';
import { listPhase9LaneRuns } from '../../orchestrator/ledgers.js';
import { bindExperimentManifestToObjective } from '../../orchestrator/experiment-binding.js';
import {
  cleanupCliFixtureProject,
  createCliFixtureProject,
  repoRoot,
  runVre
} from './_fixture.js';

const FIXTURE_KERNEL_ENV = {
  VRE_KERNEL_PATH: path.join(
    'environment',
    'tests',
    'fixtures',
    'fake-kernel-sibling'
  )
};

const HANDSHAKE_STUB = Object.freeze({
  schemaVersion: 'phase9.capability-handshake.v1',
  vrePresent: true,
  kernel: {
    mode: 'full'
  },
  vre: {
    missingSurfaces: [],
    executableCommands: ['research-loop', 'run-analysis']
  }
});

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
        fileName
      ),
      'utf8'
    )
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
  // Round 68 time-dependency fix: autonomy-runtime.js:943-952 computes
  // `wallSecondsConsumed = now - objectiveRecord.createdAt` and blocks the
  // slice when it exceeds `budget.maxWallSeconds` (28800s=8h default). A
  // hard-coded 2026-04-23T20:00:00Z `createdAt` made every test fail with
  // `status: 'blocked'` once the system clock rolled past 2026-04-24T04:00Z.
  // Seed a recent timestamp so tests stay idempotent regardless of wall-clock
  // drift; callers that need a specific createdAt still get it via options.
  const nowMs = Date.now();
  const defaultCreatedAt = new Date(nowMs - 60 * 60 * 1000).toISOString();
  const defaultLastUpdatedAt = new Date(nowMs - 30 * 60 * 1000).toISOString();
  const merged = {
    ...objectiveRecord,
    objectiveId: options.objectiveId ?? 'OBJ-001',
    createdAt: options.createdAt ?? defaultCreatedAt,
    budget: {
      ...objectiveRecord.budget,
      allowedTaskKinds: ['analysis-execution-run'],
      ...(options.budget ?? {})
    },
    stopConditions: {
      ...objectiveRecord.stopConditions,
      ...(options.stopConditions ?? {})
    },
    artifactsIndex: {
      ...objectiveRecord.artifactsIndex,
      experiments: [],
      ...(options.artifactsIndex ?? {})
    },
    lastUpdatedAt: options.lastUpdatedAt ?? defaultLastUpdatedAt,
    ...(options.overrides ?? {})
  };

  if (options.active === false) {
    await createObjectiveStore(projectRoot, merged);
  } else {
    await activateObjective(projectRoot, merged, {
      sessionId: options.sessionId ?? 'sess-research-loop'
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
    status: 'planned'
  });
  return experimentId;
}

function buildManifest({
  objectiveId = 'OBJ-001',
  experimentId = 'EXP-021',
  analysisId = 'ANL-loop-001',
  scriptPath = 'analysis/scripts/safe-loop-analysis.mjs',
  inputPath = 'data/input.csv',
  outputPath = 'artifacts/results.json'
} = {}) {
  return {
    schemaVersion: 'phase9.analysis-manifest.v1',
    objectiveId,
    experimentId,
    analysisId,
    script: {
      path: scriptPath,
      sha256: '4444444444444444444444444444444444444444444444444444444444444444',
      language: 'other'
    },
    inputs: [
      {
        path: inputPath,
        kind: 'dataset',
        sha256: null,
        sizeBytes: null
      }
    ],
    outputs: [
      {
        path: outputPath,
        kind: 'table',
        sha256: null,
        sizeBytes: null
      }
    ],
    command: {
      runner: 'other',
      argv: [
        scriptPath,
        '--input',
        inputPath,
        '--output',
        outputPath
      ]
    },
    budget: {
      maxRuntimeSeconds: 60,
      maxMemoryGb: 1,
      allowNetwork: false
    },
    safety: {
      destructive: false,
      treeWideWrite: false,
      externalCall: false
    },
    taskKind: 'analysis-execution-run',
    expectedArtifacts: [
      {
        path: outputPath,
        kind: 'table',
        required: true
      }
    ],
    humanApproval: {
      approved: false,
      approvedBy: null,
      approvedAt: null,
      reason: null
    },
    createdAt: '2026-04-23T21:00:00Z',
    createdBy: 'sess-research-loop'
  };
}

async function seedBoundResearchContext(projectRoot, options = {}) {
  const objectiveId = options.objectiveId ?? 'OBJ-001';
  const experimentId = options.experimentId ?? 'EXP-021';
  await seedObjective(projectRoot, {
    objectiveId,
    active: options.active,
    sessionId: 'sess-research-loop',
    budget: options.budget,
    stopConditions: options.stopConditions,
    overrides: options.objectiveOverrides
  });
  await seedExperimentManifest(projectRoot, objectiveId, experimentId);
  await bindExperimentManifestToObjective(projectRoot, objectiveId, experimentId, {
    updatedAt: '2026-04-23T21:01:00Z'
  });

  const manifest = buildManifest({
    objectiveId,
    experimentId,
    analysisId: options.analysisId,
    scriptPath: options.scriptPath,
    inputPath: options.inputPath,
    outputPath: options.outputPath
  });
  if (typeof options.mutateManifest === 'function') {
    options.mutateManifest(manifest);
  }

  await writeProjectFile(projectRoot, manifest.inputs[0].path, 'gene,value\n');
  await writeProjectFile(projectRoot, manifest.script.path, options.scriptContents);
  const manifestPath = options.manifestPath ?? 'analysis/manifests/research-loop.json';
  await writeProjectFile(projectRoot, manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  return {
    objectiveId,
    experimentId,
    manifest,
    manifestPath,
    queuePath: path.join(projectRoot, '.vibe-science-environment', 'objectives', objectiveId, 'queue.jsonl'),
    snapshotPath: path.join(projectRoot, '.vibe-science-environment', 'objectives', objectiveId, 'resume-snapshot.json'),
    blockerPath: path.join(projectRoot, '.vibe-science-environment', 'objectives', objectiveId, 'BLOCKER.flag'),
    handoffsPath: path.join(projectRoot, '.vibe-science-environment', 'objectives', objectiveId, 'handoffs.jsonl'),
    digestLatestPath: path.join(projectRoot, '.vibe-science-environment', 'objectives', objectiveId, 'digest-latest.md'),
    digestsDir: path.join(projectRoot, '.vibe-science-environment', 'objectives', objectiveId, 'digests')
  };
}

async function readQueueRecords(projectRoot, objectiveId = 'OBJ-001') {
  return readJsonl(path.join(projectRoot, '.vibe-science-environment', 'objectives', objectiveId, 'queue.jsonl'));
}

async function readObjectiveEvents(projectRoot, objectiveId = 'OBJ-001') {
  return readJsonl(path.join(projectRoot, '.vibe-science-environment', 'objectives', objectiveId, 'events.jsonl'));
}

async function readObjectiveHandoffs(projectRoot, objectiveId = 'OBJ-001') {
  return readJsonl(path.join(projectRoot, '.vibe-science-environment', 'objectives', objectiveId, 'handoffs.jsonl'));
}

async function readBlockerText(projectRoot, objectiveId = 'OBJ-001') {
  return readFile(path.join(projectRoot, '.vibe-science-environment', 'objectives', objectiveId, 'BLOCKER.flag'), 'utf8');
}

async function listObjectiveDigestFiles(projectRoot, objectiveId = 'OBJ-001') {
  return readdir(path.join(projectRoot, '.vibe-science-environment', 'objectives', objectiveId, 'digests'));
}

async function setPointerWakeLease(projectRoot, objectiveId, lease) {
  const pointer = await readActiveObjectivePointer(projectRoot);
  await createActiveObjectivePointer(projectRoot, {
    objectiveId,
    objectiveRecordPath: pointer.objectiveRecordPath,
    lockAcquiredAt: pointer.lockAcquiredAt,
    lockAcquiredBySession: pointer.lockAcquiredBySession,
    currentWakeLease: lease
  });
}

const SAFE_SCRIPT = `
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const input = args[args.indexOf('--input') + 1];
const output = args[args.indexOf('--output') + 1];
const raw = await readFile(input, 'utf8');
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, JSON.stringify({ ok: true, bytes: raw.length }) + '\\n', 'utf8');
process.stdout.write('research loop safe analysis complete\\n');
`;

const SLOW_SCRIPT = `
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const output = args[args.indexOf('--output') + 1];
await new Promise((resolve) => setTimeout(resolve, 500));
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, JSON.stringify({ ok: true }) + '\\n', 'utf8');
`;

test('research-loop returns a structured failure when no active objective pointer exists', async () => {
  const projectRoot = await createCliFixtureProject('vre-research-loop-no-pointer-');
  try {
    const result = await runVre(projectRoot, [
      'research-loop',
      '--objective',
      'OBJ-001'
    ], {
      env: FIXTURE_KERNEL_ENV
    });

    assert.equal(result.code, 1, `stderr=${result.stderr}`);
    assert.equal(result.stderr, '');
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, false);
    assert.equal(payload.code, 'E_ACTIVE_OBJECTIVE_POINTER_MISSING');
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

// T4.2: human-started CLI path in stored interactive mode. The command may be
// invoked directly by an operator, and `--mode interactive` must match the
// durable objective mode instead of being a silent parse-and-drop flag.
test('research-loop executes a bounded slice in interactive mode when --mode matches the stored runtimeMode', async () => {
  const projectRoot = await createCliFixtureProject('vre-research-loop-interactive-');
  try {
    const context = await seedBoundResearchContext(projectRoot, {
      analysisId: 'ANL-loop-interactive-001',
      scriptContents: SAFE_SCRIPT,
      objectiveOverrides: {
        runtimeMode: 'interactive',
        wakePolicy: {
          wakeOwner: 'manual',
          wakeSourceId: null,
          leaseTtlSeconds: 900,
          duplicateWakePolicy: 'no-op'
        }
      }
    });

    const result = await runVre(projectRoot, [
      'research-loop',
      '--objective',
      context.objectiveId,
      '--max-iterations',
      '1',
      '--mode',
      'interactive'
    ], {
      env: FIXTURE_KERNEL_ENV
    });

    assert.equal(result.code, 0, `stderr=${result.stderr}`);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.status, 'slice-complete');

    const queueRecords = await readQueueRecords(projectRoot, context.objectiveId);
    assert.deepEqual(queueRecords.map((record) => record.status), ['running', 'completed']);
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('research-loop blocks with E_LLM_REASONING_REQUIRED in unattended-batch mode when no sanctioned next slice is derivable', async () => {
  const projectRoot = await createCliFixtureProject('vre-research-loop-empty-queue-');
  try {
    await seedObjective(projectRoot, {
      objectiveId: 'OBJ-001',
      active: true,
      sessionId: 'sess-research-loop'
    });

    const result = await runVre(projectRoot, [
      'research-loop',
      '--objective',
      'OBJ-001',
      '--mode',
      'unattended-batch'
    ], {
      env: FIXTURE_KERNEL_ENV
    });

    assert.equal(result.code, 0, `stderr=${result.stderr}`);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.status, 'blocked');
    assert.equal(payload.stopReason, 'E_LLM_REASONING_REQUIRED');

    const blockerText = await readBlockerText(projectRoot, 'OBJ-001');
    assert.match(blockerText, /E_LLM_REASONING_REQUIRED/u);
    assert.match(String(payload.digestPath ?? ''), /digest-latest\.md$/u);

    const digestFiles = await listObjectiveDigestFiles(projectRoot, 'OBJ-001');
    assert.equal(digestFiles.length, 1);
    const latestDigest = await readFile(
      path.join(projectRoot, '.vibe-science-environment', 'objectives', 'OBJ-001', 'digest-latest.md'),
      'utf8'
    );
    const immutableDigest = await readFile(
      path.join(projectRoot, '.vibe-science-environment', 'objectives', 'OBJ-001', 'digests', digestFiles[0]),
      'utf8'
    );
    assert.equal(latestDigest, immutableDigest);
    assert.match(latestDigest, /Snapshot Path: .*resume-snapshot\.json/u);
    assert.match(latestDigest, /Event Log Path: .*events\.jsonl/u);
    assert.match(latestDigest, /Handoff Ledger Path: .*handoffs\.jsonl/u);
    assert.match(latestDigest, /Queue Path: .*queue\.jsonl/u);
    assert.doesNotMatch(latestDigest, /implementation-complete with saved evidence|verified against documentation|all saved/iu);

    const events = await readObjectiveEvents(projectRoot, 'OBJ-001');
    assert.equal(
      events.some((entry) => entry.kind === 'blocker-open' && entry.payload?.code === 'E_LLM_REASONING_REQUIRED'),
      true
    );

    const objectiveRecord = await readObjectiveRecord(projectRoot, 'OBJ-001');
    assert.equal(objectiveRecord.status, 'blocked');
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('research-loop blocks with E_TASK_KIND_NOT_ALLOWED when the objective budget disallows analysis-execution-run', async () => {
  const projectRoot = await createCliFixtureProject('vre-research-loop-task-kind-block-');
  try {
    const context = await seedBoundResearchContext(projectRoot, {
      analysisId: 'ANL-loop-task-kind-block-001',
      scriptContents: SAFE_SCRIPT,
      budget: {
        allowedTaskKinds: ['package-results']
      }
    });

    const result = await runVre(projectRoot, [
      'research-loop',
      '--objective',
      context.objectiveId,
      '--mode',
      'unattended-batch'
    ], {
      env: FIXTURE_KERNEL_ENV
    });

    assert.equal(result.code, 0, `stderr=${result.stderr}`);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.status, 'blocked');
    assert.equal(payload.stopReason, 'E_TASK_KIND_NOT_ALLOWED');

    const queueRecords = await readQueueRecords(projectRoot, context.objectiveId);
    assert.deepEqual(queueRecords, []);
    assert.match(await readBlockerText(projectRoot, context.objectiveId), /E_TASK_KIND_NOT_ALLOWED/u);
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

// T4.2 drift closure: prior to this pass, bin/vre parsed `--mode` but the
// runtime never used or validated it. That created an operator-deceptive CLI
// surface where `--mode interactive|unattended-batch` looked meaningful but
// was silently ignored. Pin the durable-state rule explicitly: mode is stored
// objective state, and a non-resume invocation may only assert that same mode.
test('research-loop fails closed when --mode disagrees with the stored objective.runtimeMode', async () => {
  const projectRoot = await createCliFixtureProject('vre-research-loop-mode-mismatch-');
  try {
    const context = await seedBoundResearchContext(projectRoot, {
      analysisId: 'ANL-loop-mode-mismatch-001',
      scriptContents: SAFE_SCRIPT,
      objectiveOverrides: {
        runtimeMode: 'interactive',
        wakePolicy: {
          wakeOwner: 'manual',
          wakeSourceId: null,
          leaseTtlSeconds: 900,
          duplicateWakePolicy: 'no-op'
        }
      }
    });

    const result = await runVre(projectRoot, [
      'research-loop',
      '--objective',
      context.objectiveId,
      '--mode',
      'unattended-batch'
    ], {
      env: FIXTURE_KERNEL_ENV
    });

    assert.equal(result.code, 3, `stderr=${result.stderr}`);
    assert.equal(result.stderr, '');
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, false);
    assert.equal(payload.code, 'PHASE9_USAGE');
    assert.match(payload.message, /does not match stored objective\.runtimeMode interactive/u);

    const queueRecords = await readQueueRecords(projectRoot, context.objectiveId);
    assert.deepEqual(queueRecords, []);
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

// T4.2: `research-loop --resume` must read the stored runtimeMode and must
// not let the caller smuggle a different mode through CLI flags or chat mood.
// A stored `resume-only` objective therefore still refuses execution even when
// the caller passes `--mode unattended-batch`.
test('research-loop --resume reads the stored runtimeMode and refuses execution for resume-only objectives', async () => {
  const projectRoot = await createCliFixtureProject('vre-research-loop-resume-only-');
  try {
    const context = await seedBoundResearchContext(projectRoot, {
      analysisId: 'ANL-loop-resume-only-001',
      scriptContents: SAFE_SCRIPT,
      objectiveOverrides: {
        runtimeMode: 'resume-only'
      }
    });

    const result = await runVre(projectRoot, [
      'research-loop',
      '--resume',
      '--objective',
      context.objectiveId,
      '--mode',
      'unattended-batch'
    ], {
      env: FIXTURE_KERNEL_ENV
    });

    assert.equal(result.code, 1, `stderr=${result.stderr}`);
    assert.equal(result.stderr, '');
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, false);
    assert.equal(payload.code, 'E_RUNTIME_MODE_EXECUTION_FORBIDDEN');

    const queueRecords = await readQueueRecords(projectRoot, context.objectiveId);
    assert.deepEqual(queueRecords, []);
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('research-loop executes one bounded safe slice, writes queue/event/snapshot artifacts, and stops after one slice', async () => {
  const projectRoot = await createCliFixtureProject('vre-research-loop-slice-');
  try {
    const context = await seedBoundResearchContext(projectRoot, {
      analysisId: 'ANL-loop-safe-001',
      scriptContents: SAFE_SCRIPT
    });

    const result = await runVre(projectRoot, [
      'research-loop',
      '--objective',
      context.objectiveId,
      '--heartbeat',
      '--wake-id',
      'WAKE-001'
    ], {
      env: FIXTURE_KERNEL_ENV
    });

    assert.equal(result.code, 0, `stderr=${result.stderr}`);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.status, 'slice-complete');
    assert.equal(payload.taskKind, 'analysis-execution-run');
    assert.match(payload.digestPath, /digest-latest\.md$/u);

    const queueRecords = await readQueueRecords(projectRoot, context.objectiveId);
    assert.deepEqual(queueRecords.map((record) => record.status), ['running', 'completed']);
    assert.equal(queueRecords.length, 2);
    const [runningRecord, completedRecord] = queueRecords;
    assert.equal(runningRecord.objectiveId, context.objectiveId);
    assert.equal(completedRecord.objectiveId, context.objectiveId);
    assert.equal(runningRecord.taskId, 'analysis-execution-run:ANL-loop-safe-001');
    assert.equal(completedRecord.taskId, runningRecord.taskId);
    assert.equal(runningRecord.taskKind, 'analysis-execution-run');
    assert.equal(completedRecord.taskKind, 'analysis-execution-run');
    assert.equal(runningRecord.analysisId, 'ANL-loop-safe-001');
    assert.equal(completedRecord.analysisId, 'ANL-loop-safe-001');
    assert.match(String(runningRecord.taskAttemptId), /^TASK-ANL-loop-safe-001-/u);
    assert.equal(completedRecord.taskAttemptId, runningRecord.taskAttemptId);
    assert.match(String(runningRecord.sessionId), /^sess-/u);
    assert.equal(completedRecord.sessionId, runningRecord.sessionId);
    assert.equal(runningRecord.wakeId, 'WAKE-001');
    assert.equal(completedRecord.wakeId, 'WAKE-001');
    assert.equal(runningRecord.handoffId, null);
    assert.equal(completedRecord.handoffId, null);
    assert.equal(Array.isArray(runningRecord.sourceArtifactPaths), true);
    assert.equal(Array.isArray(completedRecord.sourceArtifactPaths), true);
    assert.equal(Array.isArray(runningRecord.resultArtifactPaths), true);
    assert.equal(Array.isArray(completedRecord.resultArtifactPaths), true);
    assert.deepEqual(runningRecord.sourceArtifactPaths, [
      context.manifestPath,
      context.manifest.inputs[0].path
    ]);
    assert.deepEqual(completedRecord.sourceArtifactPaths, runningRecord.sourceArtifactPaths);
    assert.deepEqual(runningRecord.resultArtifactPaths, []);
    assert.deepEqual(completedRecord.resultArtifactPaths, [
      context.manifest.outputs[0].path
    ]);
    assert.deepEqual(runningRecord.resumeCursor, {
      manifestPath: context.manifestPath,
      queueRecordSeq: null
    });
    assert.deepEqual(completedRecord.resumeCursor, {
      manifestPath: context.manifestPath,
      queueRecordSeq: runningRecord.recordSeq
    });
    assert.match(String(runningRecord.createdAt), /^\d{4}-\d{2}-\d{2}T/u);
    assert.match(String(runningRecord.updatedAt), /^\d{4}-\d{2}-\d{2}T/u);
    assert.match(String(completedRecord.createdAt), /^\d{4}-\d{2}-\d{2}T/u);
    assert.match(String(completedRecord.updatedAt), /^\d{4}-\d{2}-\d{2}T/u);
    assert.equal(await pathExists(context.snapshotPath), true);

    const snapshotState = await readResumeSnapshot(projectRoot, context.objectiveId);
    assert.equal(snapshotState.exists, true);
    assert.equal(snapshotState.snapshot.writtenReason, 'loop-iteration');
    assert.equal(snapshotState.snapshot.queueVisibility.queueCursor, '2');
    assert.equal(snapshotState.snapshot.queueVisibility.pendingCount, 0);
    assert.equal(snapshotState.snapshot.queueVisibility.runningCount, 0);
    assert.equal(snapshotState.snapshot.queueVisibility.lastTaskId, 'analysis-execution-run:ANL-loop-safe-001');
    assert.equal(snapshotState.snapshot.wakeLease.wakeId, 'WAKE-001');
    assert.equal(await pathExists(context.digestLatestPath), true);
    const digestFiles = await listObjectiveDigestFiles(projectRoot, context.objectiveId);
    assert.equal(digestFiles.length, 1);
    assert.match(digestFiles[0], /^digest-.*\.md$/u);
    const latestDigest = await readFile(context.digestLatestPath, 'utf8');
    const immutableDigest = await readFile(path.join(context.digestsDir, digestFiles[0]), 'utf8');
    assert.equal(latestDigest, immutableDigest);
    assert.match(latestDigest, /Analysis Id: ANL-loop-safe-001/u);
    assert.match(latestDigest, /Queue Cursor: 2/u);
    assert.match(latestDigest, /Snapshot Path: .*resume-snapshot\.json/u);
    assert.match(latestDigest, /Event Log Path: .*events\.jsonl/u);
    assert.match(latestDigest, /Handoff Ledger Path: .*handoffs\.jsonl/u);
    assert.match(latestDigest, /Queue Path: .*queue\.jsonl/u);

    const events = await readObjectiveEvents(projectRoot, context.objectiveId);
    assert.equal(events.some((entry) => entry.kind === 'loop-iteration'), true);
    assert.equal(events.some((entry) => entry.kind === 'analysis-run' && entry.payload.phase === 'started'), true);
    const loopEvent = events.find((entry) => entry.kind === 'loop-iteration');
    assert.equal(loopEvent.payload.memorySync.status, 'synced');
    // Round 72 symmetry coverage: the failed-case test below at
    // `loopEvent.payload.status === 'failed'` pinned the result-status field
    // for the non-success branch. The happy-path success case implicitly
    // relied on schema validation at write time + the CLI-level
    // `payload.status === 'slice-complete'` assertion above. Pin the
    // event-level success status explicitly so a future silent regression
    // that drops the `'complete'` result field from `loop-iteration`
    // payload is caught at test time rather than via downstream failure.
    assert.equal(loopEvent.payload.status, 'complete');
    assert.equal(loopEvent.payload.resultCode, null);
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('research-loop persists a failed terminal queue result, loop event, and digest when bounded execution fails', async () => {
  const projectRoot = await createCliFixtureProject('vre-research-loop-failed-result-');
  try {
    const context = await seedBoundResearchContext(projectRoot, {
      analysisId: 'ANL-loop-failed-001',
      scriptContents: SAFE_SCRIPT
    });

    await assert.rejects(
      runResearchLoopCommand(projectRoot, {
        objectiveId: context.objectiveId,
        heartbeat: true,
        wakeId: 'WAKE-FAIL',
        sessionId: 'sess-fail'
      }, {
        generateCapabilityHandshake: async () => HANDSHAKE_STUB,
        runAnalysisCommand: async () => ({
          ok: false,
          code: 'E_ANALYSIS_CHILD_FAILED',
          status: 'failed',
          message: 'fixture child failed',
          outputPaths: []
        })
      }),
      (error) => {
        assert.equal(error.code, 'E_ANALYSIS_CHILD_FAILED');
        assert.equal(error.extra.status, 'failed');
        return true;
      }
    );

    const queueRecords = await readQueueRecords(projectRoot, context.objectiveId);
    assert.deepEqual(queueRecords.map((record) => record.status), ['running', 'failed']);
    assert.equal(queueRecords[0].wakeId, 'WAKE-FAIL');
    assert.equal(queueRecords[1].wakeId, 'WAKE-FAIL');
    assert.equal(queueRecords[1].resumeCursor.queueRecordSeq, queueRecords[0].recordSeq);
    assert.deepEqual(queueRecords[1].resultArtifactPaths, []);

    const events = await readObjectiveEvents(projectRoot, context.objectiveId);
    const loopEvent = events.find((entry) => entry.kind === 'loop-iteration');
    assert.ok(loopEvent);
    assert.equal(loopEvent.payload.status, 'failed');
    assert.equal(loopEvent.payload.resultCode, 'E_ANALYSIS_CHILD_FAILED');

    const snapshotState = await readResumeSnapshot(projectRoot, context.objectiveId);
    assert.equal(snapshotState.exists, true);
    assert.equal(snapshotState.snapshot.queueVisibility.queueCursor, '2');
    assert.equal(snapshotState.snapshot.queueVisibility.pendingCount, 0);
    assert.equal(snapshotState.snapshot.queueVisibility.runningCount, 0);
    assert.equal(snapshotState.snapshot.queueVisibility.lastTaskId, 'analysis-execution-run:ANL-loop-failed-001');

    const digestFiles = await listObjectiveDigestFiles(projectRoot, context.objectiveId);
    assert.equal(digestFiles.length, 1);
    const latestDigest = await readFile(context.digestLatestPath, 'utf8');
    const immutableDigest = await readFile(path.join(context.digestsDir, digestFiles[0]), 'utf8');
    assert.equal(latestDigest, immutableDigest);
    assert.match(latestDigest, /Stop Reason: E_ANALYSIS_CHILD_FAILED/u);
    assert.match(latestDigest, /Runtime Status: failed/u);
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('research-loop replaces the heartbeat auto sentinel with a generated wake id before claiming the lease', async () => {
  const projectRoot = await createCliFixtureProject('vre-research-loop-auto-wake-');
  try {
    const context = await seedBoundResearchContext(projectRoot, {
      analysisId: 'ANL-loop-auto-wake-001',
      scriptContents: SAFE_SCRIPT
    });

    const result = await runVre(projectRoot, [
      'research-loop',
      '--objective',
      context.objectiveId,
      '--heartbeat',
      '--wake-id',
      'auto'
    ], {
      env: FIXTURE_KERNEL_ENV
    });

    assert.equal(result.code, 0, `stderr=${result.stderr}`);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.status, 'slice-complete');
    assert.equal(payload.wakeCaller, 'windows-task-scheduler');
    assert.notEqual(payload.wakeId, 'auto');
    assert.match(payload.wakeId, /^wake-/u);

    const activePointer = await readActiveObjectivePointer(projectRoot);
    assert.ok(activePointer);
    assert.equal(activePointer.currentWakeLease.wakeId, payload.wakeId);
    assert.equal(activePointer.currentWakeLease.acquiredBy, 'windows-task-scheduler');

    const snapshotState = await readResumeSnapshot(projectRoot, context.objectiveId);
    assert.equal(snapshotState.exists, true);
    assert.equal(snapshotState.snapshot.wakeLease.wakeId, payload.wakeId);
    assert.equal(snapshotState.snapshot.wakeLease.acquiredBy, 'windows-task-scheduler');
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('research-loop records an explicit external wake caller identity when a compatibility adapter invokes the heartbeat', async () => {
  const projectRoot = await createCliFixtureProject('vre-research-loop-plugin-wake-caller-');
  try {
    const context = await seedBoundResearchContext(projectRoot, {
      analysisId: 'ANL-loop-plugin-wake-001',
      scriptContents: SAFE_SCRIPT
    });

    const result = await runVre(projectRoot, [
      'research-loop',
      '--objective',
      context.objectiveId,
      '--heartbeat',
      '--wake-id',
      'WAKE-PLUGIN'
    ], {
      env: {
        ...FIXTURE_KERNEL_ENV,
        VRE_EXTERNAL_WAKE_CALLER: 'plugin-loop-wake'
      }
    });

    assert.equal(result.code, 0, `stderr=${result.stderr}`);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.status, 'slice-complete');
    assert.equal(payload.wakeCaller, 'plugin-loop-wake');
    assert.equal(payload.wakeId, 'WAKE-PLUGIN');

    const activePointer = await readActiveObjectivePointer(projectRoot);
    assert.ok(activePointer);
    assert.equal(activePointer.currentWakeLease.wakeId, 'WAKE-PLUGIN');
    assert.equal(activePointer.currentWakeLease.acquiredBy, 'plugin-loop-wake');

    const snapshotState = await readResumeSnapshot(projectRoot, context.objectiveId);
    assert.equal(snapshotState.exists, true);
    assert.equal(snapshotState.snapshot.wakeLease.wakeId, 'WAKE-PLUGIN');
    assert.equal(snapshotState.snapshot.wakeLease.acquiredBy, 'plugin-loop-wake');
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('research-loop respects stopConditions.onBudgetExhausted by pausing instead of executing another slice', async () => {
  const projectRoot = await createCliFixtureProject('vre-research-loop-budget-');
  try {
    const context = await seedBoundResearchContext(projectRoot, {
      scriptContents: SAFE_SCRIPT,
      budget: {
        maxIterations: 1
      },
      stopConditions: {
        onBudgetExhausted: 'pause'
      }
    });
    await appendObjectiveEvent(projectRoot, context.objectiveId, 'loop-iteration', {
      seeded: true
    }, '2026-04-23T21:05:00Z');

    const result = await runVre(projectRoot, [
      'research-loop',
      '--objective',
      context.objectiveId,
      '--heartbeat',
      '--wake-id',
      'WAKE-BUDGET'
    ], {
      env: FIXTURE_KERNEL_ENV
    });

    assert.equal(result.code, 0, `stderr=${result.stderr}`);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.status, 'paused');

    const objectiveRecord = await readObjectiveRecord(projectRoot, context.objectiveId);
    assert.equal(objectiveRecord.status, 'paused');
    const queueRecords = await readQueueRecords(projectRoot, context.objectiveId);
    assert.deepEqual(queueRecords, []);
    const events = await readObjectiveEvents(projectRoot, context.objectiveId);
    const pauseEvent = events.find(
      (entry) => entry.kind === 'stop' && entry.payload.disposition === 'pause'
    );
    assert.ok(pauseEvent, 'stop event with disposition=pause must be appended on pause branch');
    assert.equal(pauseEvent.payload.wakeId, 'WAKE-BUDGET');
    assert.equal(pauseEvent.payload.wakeCaller, 'windows-task-scheduler');
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('research-loop treats duplicate wake ids as a no-op, records a heartbeat event, and refreshes the snapshot', async () => {
  const projectRoot = await createCliFixtureProject('vre-research-loop-duplicate-');
  try {
    const context = await seedBoundResearchContext(projectRoot, {
      analysisId: 'ANL-loop-dup-001',
      scriptContents: SAFE_SCRIPT
    });
    await setPointerWakeLease(projectRoot, context.objectiveId, {
      wakeId: 'WAKE-DUP',
      leaseAcquiredAt: '2026-04-22T21:00:00Z',
      leaseExpiresAt: '2026-04-22T22:00:00Z',
      acquiredBy: 'sess-dup',
      previousWakeId: null
    });

    const result = await runVre(projectRoot, [
      'research-loop',
      '--objective',
      context.objectiveId,
      '--heartbeat',
      '--wake-id',
      'WAKE-DUP'
    ], {
      env: FIXTURE_KERNEL_ENV
    });

    assert.equal(result.code, 0, `stderr=${result.stderr}`);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.status, 'no-op');
    assert.equal(payload.reason, 'duplicate-wake-id');
    assert.equal(payload.wakeCaller, 'windows-task-scheduler');

    assert.equal(await pathExists(context.snapshotPath), true);
    const queueRecords = await readQueueRecords(projectRoot, context.objectiveId);
    assert.deepEqual(queueRecords, []);
    const snapshotState = await readResumeSnapshot(projectRoot, context.objectiveId);
    assert.equal(snapshotState.exists, true);
    assert.match(snapshotState.snapshot.notes, /Heartbeat WAKE-DUP produced no new slice/u);
    assert.equal(snapshotState.snapshot.wakeLease.acquiredBy, 'sess-dup');
    assert.equal(snapshotState.snapshot.nextAction.params.wakeId, 'WAKE-DUP');
    assert.equal(snapshotState.snapshot.nextAction.params.wakeCaller, 'windows-task-scheduler');
    const events = await readObjectiveEvents(projectRoot, context.objectiveId);
    const heartbeatEvent = events.find(
      (entry) => entry.kind === 'heartbeat' && entry.payload.reason === 'duplicate-wake-id'
    );
    assert.ok(heartbeatEvent, 'duplicate wake no-op must append a heartbeat event');
    assert.equal(heartbeatEvent.payload.wakeId, 'WAKE-DUP');
    assert.equal(heartbeatEvent.payload.wakeCaller, 'windows-task-scheduler');
    assert.equal(heartbeatEvent.payload.activeLeaseWakeId, 'WAKE-DUP');
    assert.equal(heartbeatEvent.payload.activeLeaseAcquiredBy, 'sess-dup');
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('research-loop reclaims an expired wake lease, records the stale event, and continues with one slice', async () => {
  const projectRoot = await createCliFixtureProject('vre-research-loop-stale-');
  try {
    const context = await seedBoundResearchContext(projectRoot, {
      analysisId: 'ANL-loop-stale-001',
      scriptContents: SAFE_SCRIPT
    });
    await setPointerWakeLease(projectRoot, context.objectiveId, {
      wakeId: 'WAKE-OLD',
      leaseAcquiredAt: '2026-04-22T19:00:00Z',
      leaseExpiresAt: '2026-04-22T19:05:00Z',
      acquiredBy: 'sess-old',
      previousWakeId: null
    });

    const result = await runVre(projectRoot, [
      'research-loop',
      '--objective',
      context.objectiveId,
      '--heartbeat',
      '--wake-id',
      'WAKE-NEW'
    ], {
      env: FIXTURE_KERNEL_ENV
    });

    assert.equal(result.code, 0, `stderr=${result.stderr}`);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.staleLeaseRecovered, true);

    const events = await readObjectiveEvents(projectRoot, context.objectiveId);
    const staleEvent = events.find((entry) => entry.kind === 'stale-wake-lease-reclaimed');
    assert.ok(staleEvent, 'stale lease reclaim must append an objective event');
    assert.equal(staleEvent.payload.wakeId, 'WAKE-NEW');
    assert.equal(staleEvent.payload.reclaimedByWakeId, 'WAKE-NEW');
    assert.equal(staleEvent.payload.wakeCaller, 'windows-task-scheduler');
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('research-loop can repair a missing final resume snapshot from durable queue and event evidence without rerunning the analysis', async () => {
  const projectRoot = await createCliFixtureProject('vre-research-loop-recover-');
  try {
    const context = await seedBoundResearchContext(projectRoot, {
      analysisId: 'ANL-loop-recover-001',
      scriptContents: SAFE_SCRIPT
    });

    await assert.rejects(
      runResearchLoopCommand(projectRoot, {
        objectiveId: context.objectiveId,
      heartbeat: true,
      wakeId: 'WAKE-CRASH',
      sessionId: 'sess-crash'
    }, {
      generateCapabilityHandshake: async () => HANDSHAKE_STUB,
      afterLoopEventPersisted: async () => {
        throw new Error('simulated crash before final resume snapshot');
      }
    }),
      /simulated crash before final resume snapshot/u
    );

    assert.equal(await pathExists(context.snapshotPath), false);
    await setPointerWakeLease(projectRoot, context.objectiveId, {
      wakeId: 'WAKE-CRASH',
      leaseAcquiredAt: '2026-04-22T19:00:00Z',
      leaseExpiresAt: '2026-04-22T19:01:00Z',
      acquiredBy: 'sess-crash',
      previousWakeId: null
    });

    const repaired = await runResearchLoopCommand(projectRoot, {
      objectiveId: context.objectiveId,
      heartbeat: true,
      wakeId: 'WAKE-REPAIR',
      sessionId: 'sess-repair'
    }, {
      generateCapabilityHandshake: async () => HANDSHAKE_STUB
    });

    assert.equal(repaired.ok, true);
    assert.equal(repaired.status, 'recovered');
    assert.equal(await pathExists(context.snapshotPath), true);

    const queueRecords = await readQueueRecords(projectRoot, context.objectiveId);
    assert.deepEqual(queueRecords.map((record) => record.status), ['running', 'completed']);
    const laneRuns = await listPhase9LaneRuns(projectRoot, {
      objectiveId: context.objectiveId,
      analysisId: 'ANL-loop-recover-001'
    });
    assert.deepEqual(laneRuns.map((record) => record.recordSeq), [2, 1]);

    const events = await readObjectiveEvents(projectRoot, context.objectiveId);
    const repairEvent = events.find((entry) => entry.kind === 'state-repair');
    assert.ok(repairEvent, 'state repair must append a repair event');
    assert.equal(repairEvent.payload.wakeId, 'WAKE-REPAIR');
    assert.equal(repairEvent.payload.wakeCaller, 'windows-task-scheduler');
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('research-loop blocks with E_QUEUE_TERMINAL_WITHOUT_EVENT when a prior wake crashed after the terminal queue line but before the terminal objective event', async () => {
  const projectRoot = await createCliFixtureProject('vre-research-loop-terminal-without-event-');
  try {
    const context = await seedBoundResearchContext(projectRoot, {
      analysisId: 'ANL-loop-terminal-without-event-001',
      scriptContents: SAFE_SCRIPT
    });

    await assert.rejects(
      runResearchLoopCommand(projectRoot, {
        objectiveId: context.objectiveId,
        heartbeat: true,
        wakeId: 'WAKE-QWOE-CRASH',
        sessionId: 'sess-qwoe-crash'
      }, {
        generateCapabilityHandshake: async () => HANDSHAKE_STUB,
        afterQueueResultPersisted: async () => {
          throw new Error('simulated crash after terminal queue line');
        }
      }),
      /simulated crash after terminal queue line/u
    );

    await setPointerWakeLease(projectRoot, context.objectiveId, {
      wakeId: 'WAKE-QWOE-CRASH',
      leaseAcquiredAt: '2026-04-22T19:00:00Z',
      leaseExpiresAt: '2026-04-22T19:01:00Z',
      acquiredBy: 'sess-qwoe-crash',
      previousWakeId: null
    });

    const result = await runResearchLoopCommand(projectRoot, {
      objectiveId: context.objectiveId,
      heartbeat: true,
      wakeId: 'WAKE-QWOE-RESUME',
      sessionId: 'sess-qwoe-resume'
    }, {
      generateCapabilityHandshake: async () => HANDSHAKE_STUB
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, 'blocked');
    assert.equal(result.stopReason, 'queue-terminal-without-event');
    assert.match(await readBlockerText(projectRoot, context.objectiveId), /E_QUEUE_TERMINAL_WITHOUT_EVENT/u);

    const queueRecords = await readQueueRecords(projectRoot, context.objectiveId);
    assert.deepEqual(queueRecords.map((record) => record.status), ['running', 'completed']);
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('research-loop reports incomplete-at-crash, writes a handoff with objective id, and does not duplicate a non-idempotent running task automatically', async () => {
  const projectRoot = await createCliFixtureProject('vre-research-loop-incomplete-at-crash-');
  try {
    const context = await seedBoundResearchContext(projectRoot, {
      analysisId: 'ANL-loop-incomplete-at-crash-001',
      scriptContents: SAFE_SCRIPT
    });

    await assert.rejects(
      runResearchLoopCommand(projectRoot, {
        objectiveId: context.objectiveId,
        heartbeat: true,
        wakeId: 'WAKE-INCOMPLETE-CRASH',
        sessionId: 'sess-incomplete-crash'
      }, {
        generateCapabilityHandshake: async () => HANDSHAKE_STUB,
        afterTaskIntentPersisted: async () => {
          throw new Error('simulated crash after task-intent');
        }
      }),
      /simulated crash after task-intent/u
    );

    const crashedQueue = await readQueueRecords(projectRoot, context.objectiveId);
    assert.deepEqual(crashedQueue.map((record) => record.status), ['running']);

    await setPointerWakeLease(projectRoot, context.objectiveId, {
      wakeId: 'WAKE-INCOMPLETE-CRASH',
      leaseAcquiredAt: '2026-04-22T19:00:00Z',
      leaseExpiresAt: '2026-04-22T19:01:00Z',
      acquiredBy: 'sess-incomplete-crash',
      previousWakeId: null
    });

    const resumed = await runResearchLoopCommand(projectRoot, {
      objectiveId: context.objectiveId,
      heartbeat: true,
      wakeId: 'WAKE-INCOMPLETE-RESUME',
      sessionId: 'sess-incomplete-resume'
    }, {
      generateCapabilityHandshake: async () => HANDSHAKE_STUB
    });

    assert.equal(resumed.ok, true);
    assert.equal(resumed.status, 'blocked');
    assert.equal(resumed.stopReason, 'incomplete-at-crash');
    assert.match(String(resumed.digestPath ?? ''), /digest-latest\.md$/u);
    assert.match(String(resumed.handoffId ?? ''), /^H-/u);
    assert.equal(await pathExists(context.digestLatestPath), true);

    const queueRecords = await readQueueRecords(projectRoot, context.objectiveId);
    assert.deepEqual(queueRecords.map((record) => record.status), ['running']);
    assert.equal(new Set(queueRecords.map((record) => record.taskAttemptId)).size, 1);
    const events = await readObjectiveEvents(projectRoot, context.objectiveId);
    const blockerEvent = events.find((entry) => entry.kind === 'blocker-open');
    assert.ok(blockerEvent, 'incomplete-at-crash recovery must append blocker-open');
    assert.equal(blockerEvent.payload.wakeId, 'WAKE-INCOMPLETE-RESUME');
    assert.equal(blockerEvent.payload.wakeCaller, 'windows-task-scheduler');

    // Round 71: spec-side row 95 cites that the incomplete-at-crash path keeps
    // the original objectiveId / sessionId / wakeId lineage rather than
    // duplicating under the resume wake. Before Round 71 this was implicit:
    // the queue only contained the pre-crash 'running' record, so the
    // invariant held trivially, but no assertion pinned the sessionId/wakeId
    // fields. Pin them explicitly so a future regression that silently
    // re-issues a running row under the resume wake is caught at test time.
    assert.equal(queueRecords[0].sessionId, 'sess-incomplete-crash');
    assert.equal(queueRecords[0].wakeId, 'WAKE-INCOMPLETE-CRASH');
    assert.equal(queueRecords[0].objectiveId, context.objectiveId);

    const handoffs = await readObjectiveHandoffs(projectRoot, context.objectiveId);
    assert.equal(handoffs.length, 1);
    assert.equal(handoffs[0].objectiveId, context.objectiveId);
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('research-loop pauses with SEMANTIC_DRIFT_DETECTED when the strategic checkpoint marks the unattended slice as drifted', async () => {
  const projectRoot = await createCliFixtureProject('vre-research-loop-drift-');
  try {
    const context = await seedBoundResearchContext(projectRoot, {
      analysisId: 'ANL-loop-drift-001',
      scriptContents: SLOW_SCRIPT
    });

    const result = await runResearchLoopCommand(projectRoot, {
      objectiveId: context.objectiveId,
      heartbeat: true,
      wakeId: 'WAKE-DRIFT',
      sessionId: 'sess-drift'
    }, {
      generateCapabilityHandshake: async () => HANDSHAKE_STUB,
      strategicCheckpoint: async () => ({
        status: 'drifted',
        message: 'Objective drifted away from the sanctioned scope.'
      })
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, 'paused');
    assert.equal(result.stopReason, 'semantic-drift');
    assert.equal(await pathExists(context.blockerPath), true);
    assert.match(await readBlockerText(projectRoot, context.objectiveId), /SEMANTIC_DRIFT_DETECTED/u);

    const objectiveRecord = await readObjectiveRecord(projectRoot, context.objectiveId);
    assert.equal(objectiveRecord.status, 'paused');
    const events = await readObjectiveEvents(projectRoot, context.objectiveId);
    const driftEvent = events.find((entry) => entry.kind === 'semantic-drift-detected');
    assert.ok(driftEvent, 'semantic drift must append a drift event');
    assert.equal(driftEvent.payload.wakeId, 'WAKE-DRIFT');
    assert.equal(driftEvent.payload.wakeCaller, 'windows-task-scheduler');

    // Round 74 T4.4 drift closure: `handleSemanticDrift` previously wrote
    // `BLOCKER.flag` but bypassed `writeObjectiveDigest`, so the morning
    // operator had no digest for strategic-drift pauses. Pin digest presence
    // + morning-digest pointers explicitly.
    assert.match(String(result.digestPath ?? ''), /digest-latest\.md$/u);
    assert.equal(await pathExists(context.digestLatestPath), true);
    const driftDigest = await readFile(context.digestLatestPath, 'utf8');
    assert.match(driftDigest, /Digest Kind: semantic-drift/u);
    assert.match(driftDigest, /Stop Reason: semantic-drift/u);
    assert.match(driftDigest, /Snapshot Path:/u);
    assert.match(driftDigest, /Event Log Path:/u);
    assert.match(driftDigest, /Handoff Ledger Path:/u);
    assert.match(driftDigest, /Queue Path:/u);
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

// Round 62 regression: seq 075 ledger row claims "budget exhausted ->
// blocked/paused per stopConditions", and the runtime `applyBudgetStopCondition`
// has three branches (pause, stop, block) but only the `pause` branch was
// pinned. The default fixture ships with `onBudgetExhausted: 'block'` so the
// current default runtime path was entirely untested. This test forces the
// `block` branch and asserts that objective status becomes `blocked`, a
// BLOCKER.flag is written with `E_BUDGET_EXHAUSTED`, and a `blocker-open`
// objective event is appended.
test('research-loop blocks the objective and writes BLOCKER.flag when stopConditions.onBudgetExhausted=block is exhausted', async () => {
  const projectRoot = await createCliFixtureProject('vre-research-loop-budget-block-');
  try {
    const context = await seedBoundResearchContext(projectRoot, {
      scriptContents: SAFE_SCRIPT,
      budget: {
        maxIterations: 1
      },
      stopConditions: {
        onBudgetExhausted: 'block'
      }
    });
    await appendObjectiveEvent(projectRoot, context.objectiveId, 'loop-iteration', {
      seeded: true
    }, '2026-04-23T21:05:00Z');

    const result = await runVre(projectRoot, [
      'research-loop',
      '--objective',
      context.objectiveId,
      '--heartbeat',
      '--wake-id',
      'WAKE-BUDGET-BLOCK'
    ], {
      env: FIXTURE_KERNEL_ENV
    });

    assert.equal(result.code, 0, `stderr=${result.stderr}`);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.status, 'blocked');
    assert.equal(payload.stopReason, 'budget-exhausted');

    const objectiveRecord = await readObjectiveRecord(projectRoot, context.objectiveId);
    assert.equal(objectiveRecord.status, 'blocked');

    // BLOCKER.flag MUST exist with the budget code
    const blockerText = await readBlockerText(projectRoot, context.objectiveId);
    assert.match(blockerText, /E_BUDGET_EXHAUSTED/u);

    const events = await readObjectiveEvents(projectRoot, context.objectiveId);
    const blockerOpen = events.find((entry) => entry.kind === 'blocker-open');
    assert.ok(blockerOpen, 'blocker-open event must be appended on block branch');
    assert.equal(blockerOpen.payload.code, 'E_BUDGET_EXHAUSTED');
    assert.equal(blockerOpen.payload.wakeId, 'WAKE-BUDGET-BLOCK');
    assert.equal(blockerOpen.payload.wakeCaller, 'windows-task-scheduler');

    // Round 74 T4.4 drift closure: `applyBudgetStopCondition` blocked branch
    // previously wrote `BLOCKER.flag` but bypassed `writeObjectiveDigest`,
    // so the budget-exhausted morning-operator had no digest summary. Pin
    // digest presence + morning-digest pointers explicitly.
    assert.match(String(payload.digestPath ?? ''), /digest-latest\.md$/u);
    assert.equal(await pathExists(context.digestLatestPath), true);
    const budgetDigest = await readFile(context.digestLatestPath, 'utf8');
    assert.match(budgetDigest, /Digest Kind: budget-exhausted/u);
    assert.match(budgetDigest, /Stop Reason: budget-exhausted/u);
    assert.match(budgetDigest, /Snapshot Path:/u);
    assert.match(budgetDigest, /Event Log Path:/u);
    assert.match(budgetDigest, /Handoff Ledger Path:/u);
    assert.match(budgetDigest, /Queue Path:/u);
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

// Round 62 regression: the `applyBudgetStopCondition` stop branch is TERMINAL
// (stopObjective releases the active pointer) while pause/block are
// reversible. Without a regression test, a silent refactor could conflate
// stop with pause and never actually terminate objectives that operators
// configured to stop on budget exhaustion. This pins terminal transition.
test('research-loop stops the objective terminally when stopConditions.onBudgetExhausted=stop is exhausted', async () => {
  const projectRoot = await createCliFixtureProject('vre-research-loop-budget-stop-');
  try {
    const context = await seedBoundResearchContext(projectRoot, {
      scriptContents: SAFE_SCRIPT,
      budget: {
        maxIterations: 1
      },
      stopConditions: {
        onBudgetExhausted: 'stop'
      }
    });
    await appendObjectiveEvent(projectRoot, context.objectiveId, 'loop-iteration', {
      seeded: true
    }, '2026-04-23T21:05:00Z');

    const result = await runVre(projectRoot, [
      'research-loop',
      '--objective',
      context.objectiveId,
      '--heartbeat',
      '--wake-id',
      'WAKE-BUDGET-STOP'
    ], {
      env: FIXTURE_KERNEL_ENV
    });

    assert.equal(result.code, 0, `stderr=${result.stderr}`);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.status, 'stopped');
    assert.equal(payload.stopReason, 'budget-exhausted');

    const objectiveRecord = await readObjectiveRecord(projectRoot, context.objectiveId);
    // Terminal status: stopObjective moves to completed or abandoned-like
    assert.notEqual(objectiveRecord.status, 'active');
    assert.notEqual(objectiveRecord.status, 'paused');
    assert.notEqual(objectiveRecord.status, 'blocked');

    const events = await readObjectiveEvents(projectRoot, context.objectiveId);
    const stopEvent = events.find(
      (entry) => entry.kind === 'stop' && entry.payload.disposition === 'stop'
    );
    assert.ok(stopEvent, 'stop event with disposition=stop must be appended on terminal stop branch');
    assert.equal(stopEvent.payload.wakeId, 'WAKE-BUDGET-STOP');
    assert.equal(stopEvent.payload.wakeCaller, 'windows-task-scheduler');
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

// Round 62 regression: the wake-lease resolver has TWO no-op reasons:
// `duplicate-wake-id` (same wakeId; already tested) and
// `wake-lease-still-active` (DIFFERENT wakeId but current lease still
// unexpired). The second branch was implemented but no test covered the
// wake-lease protection semantic: a fresh wake id cannot steal an
// unexpired lease owned by another session.
test('research-loop refuses to acquire the lease when a different wake owns an unexpired lease', async () => {
  const projectRoot = await createCliFixtureProject('vre-research-loop-wake-unexpired-');
  try {
    const context = await seedBoundResearchContext(projectRoot, {
      analysisId: 'ANL-loop-unexpired-001',
      scriptContents: SAFE_SCRIPT
    });
    // Pre-seed an unexpired lease owned by a DIFFERENT wake id.
    const futureExpiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await setPointerWakeLease(projectRoot, context.objectiveId, {
      wakeId: 'WAKE-OWNED-BY-OTHER',
      leaseAcquiredAt: new Date(Date.now() - 60 * 1000).toISOString(),
      leaseExpiresAt: futureExpiry,
      acquiredBy: 'sess-other',
      previousWakeId: null
    });

    const result = await runVre(projectRoot, [
      'research-loop',
      '--objective',
      context.objectiveId,
      '--heartbeat',
      '--wake-id',
      'WAKE-CONTENDER'
    ], {
      env: FIXTURE_KERNEL_ENV
    });

    assert.equal(result.code, 0, `stderr=${result.stderr}`);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.status, 'no-op');
    assert.equal(payload.reason, 'wake-lease-still-active');
    assert.equal(payload.wakeCaller, 'windows-task-scheduler');

    // Queue and snapshot should NOT have been mutated by slice execution.
    const queueRecords = await readQueueRecords(projectRoot, context.objectiveId);
    assert.deepEqual(queueRecords, []);
    const snapshotState = await readResumeSnapshot(projectRoot, context.objectiveId);
    assert.equal(snapshotState.exists, true);
    assert.equal(snapshotState.snapshot.nextAction.params.wakeId, 'WAKE-CONTENDER');
    assert.equal(snapshotState.snapshot.nextAction.params.wakeCaller, 'windows-task-scheduler');
    const events = await readObjectiveEvents(projectRoot, context.objectiveId);
    const heartbeatEvent = events.find(
      (entry) => entry.kind === 'heartbeat' && entry.payload.reason === 'wake-lease-still-active'
    );
    assert.ok(heartbeatEvent, 'contended wake no-op must append a heartbeat event');
    assert.equal(heartbeatEvent.payload.wakeId, 'WAKE-CONTENDER');
    assert.equal(heartbeatEvent.payload.wakeCaller, 'windows-task-scheduler');
    assert.equal(heartbeatEvent.payload.activeLeaseWakeId, 'WAKE-OWNED-BY-OTHER');
    assert.equal(heartbeatEvent.payload.activeLeaseAcquiredBy, 'sess-other');
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

// Round 62 regression: E_OBJECTIVE_ID_MISMATCH is defensively checked at
// two layers of autonomy-runtime.js (the outer entry at runResearchLoopCommand
// and again inside the wake-lease `withLock` block). This pins the outer
// guard so a silent refactor cannot erode the cross-objective safety net
// that prevents one session from driving slices on the wrong objective.
test('research-loop fails closed with E_OBJECTIVE_ID_MISMATCH when the requested objective is not the active one', async () => {
  const projectRoot = await createCliFixtureProject('vre-research-loop-id-mismatch-');
  try {
    await seedBoundResearchContext(projectRoot, {
      objectiveId: 'OBJ-001',
      analysisId: 'ANL-loop-idmm-001',
      scriptContents: SAFE_SCRIPT
    });

    const result = await runVre(projectRoot, [
      'research-loop',
      '--objective',
      'OBJ-999-DIFFERENT',
      '--heartbeat',
      '--wake-id',
      'WAKE-IDMM'
    ], {
      env: FIXTURE_KERNEL_ENV
    });

    assert.equal(result.code, 1, `stderr=${result.stderr}`);
    assert.equal(result.stderr, '');
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, false);
    assert.equal(payload.code, 'E_OBJECTIVE_ID_MISMATCH');
    // namedPhase9ErrorPayload spreads `extra` into the top-level payload.
    assert.equal(payload.activeObjectiveId, 'OBJ-001');
    assert.equal(payload.objectiveId, 'OBJ-999-DIFFERENT');
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

// Round 61 regression: seq 075 ledger row explicitly claims the strategic
// relevance checkpoint runs "before every unattended slice AND before
// spending the final 25% of the iteration budget". The first trigger is
// pinned by the semantic-drift test above, but the final-quarter trigger
// (autonomy-runtime.js line 958: `(iterationsCompleted + 1) > floor(maxIter * 0.75)`)
// was implemented without a dedicated test. This test exercises the
// final-quarter phase alone (pre-slice returns aligned) and asserts the
// loop still pauses with SEMANTIC_DRIFT_DETECTED.
test('research-loop pauses when the final-quarter strategic checkpoint phase returns drifted even if pre-slice is aligned', async () => {
  const projectRoot = await createCliFixtureProject('vre-research-loop-final-quarter-');
  try {
    const context = await seedBoundResearchContext(projectRoot, {
      analysisId: 'ANL-fq-001',
      scriptContents: SAFE_SCRIPT,
      budget: {
        maxIterations: 1
      }
    });

    const phaseLog = [];
    const result = await runResearchLoopCommand(projectRoot, {
      objectiveId: context.objectiveId,
      heartbeat: true,
      wakeId: 'WAKE-FQ-001',
      sessionId: 'sess-fq'
    }, {
      generateCapabilityHandshake: async () => ({
        vre: { missingSurfaces: [] },
        kernel: { mode: 'full' }
      }),
      strategicCheckpoint: async (ctx) => {
        phaseLog.push(ctx.phase);
        if (ctx.phase === 'final-quarter') {
          return {
            status: 'drifted',
            message: 'final-quarter relevance drifted: one iteration left, no sanctioned plan'
          };
        }
        return { status: 'aligned' };
      }
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, 'paused');
    assert.equal(result.stopReason, 'semantic-drift');
    // pre-slice must run BEFORE final-quarter, and final-quarter must be
    // reached only because pre-slice was aligned.
    assert.deepEqual(phaseLog, ['pre-slice', 'final-quarter']);
    assert.match(
      await readBlockerText(projectRoot, context.objectiveId),
      /SEMANTIC_DRIFT_DETECTED/u
    );
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

// Round 61 regression: seq 075 ledger row explicitly claims memory sync
// runs "after task result/event append and before the final resume
// snapshot; if memory sync is unavailable, record the skipped reason in
// the objective event payload and snapshot notes". The happy path uses
// the real syncMemory silently. This test injects a failing syncMemory
// and asserts the skipped reason is recorded in BOTH the loop-iteration
// event payload AND the final resume snapshot notes.
test('research-loop records the memory-sync skipped reason in the loop-iteration event payload and the final resume snapshot notes', async () => {
  const projectRoot = await createCliFixtureProject('vre-research-loop-memsync-skipped-');
  try {
    const context = await seedBoundResearchContext(projectRoot, {
      analysisId: 'ANL-memsync-skipped-001',
      scriptContents: SAFE_SCRIPT
    });

    const result = await runResearchLoopCommand(projectRoot, {
      objectiveId: context.objectiveId,
      heartbeat: true,
      wakeId: 'WAKE-MS-001',
      sessionId: 'sess-ms'
    }, {
      generateCapabilityHandshake: async () => ({
        vre: { missingSurfaces: [] },
        kernel: { mode: 'full' }
      }),
      syncMemory: async () => {
        throw new Error('memory store unavailable for fixture');
      }
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, 'slice-complete');

    const events = await readObjectiveEvents(projectRoot, context.objectiveId);
    const loopEvent = events.find((entry) => entry.kind === 'loop-iteration');
    assert.ok(loopEvent, 'loop-iteration event must be appended after the slice');
    assert.equal(loopEvent.payload.memorySync.status, 'skipped');
    assert.equal(
      loopEvent.payload.memorySync.reason,
      'memory store unavailable for fixture'
    );

    const snapshotState = await readResumeSnapshot(projectRoot, context.objectiveId);
    assert.equal(snapshotState.exists, true);
    assert.match(
      String(snapshotState.snapshot.notes ?? ''),
      /Memory sync skipped: memory store unavailable for fixture/u
    );
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});
