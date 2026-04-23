import assert from 'node:assert/strict';
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
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
  const merged = {
    ...objectiveRecord,
    objectiveId: options.objectiveId ?? 'OBJ-001',
    createdAt: options.createdAt ?? '2026-04-23T20:00:00Z',
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
    lastUpdatedAt: options.lastUpdatedAt ?? '2026-04-23T20:15:00Z',
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
    blockerPath: path.join(projectRoot, '.vibe-science-environment', 'objectives', objectiveId, 'BLOCKER.flag')
  };
}

async function readQueueRecords(projectRoot, objectiveId = 'OBJ-001') {
  return readJsonl(path.join(projectRoot, '.vibe-science-environment', 'objectives', objectiveId, 'queue.jsonl'));
}

async function readObjectiveEvents(projectRoot, objectiveId = 'OBJ-001') {
  return readJsonl(path.join(projectRoot, '.vibe-science-environment', 'objectives', objectiveId, 'events.jsonl'));
}

async function readBlockerText(projectRoot, objectiveId = 'OBJ-001') {
  return readFile(path.join(projectRoot, '.vibe-science-environment', 'objectives', objectiveId, 'BLOCKER.flag'), 'utf8');
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

test('research-loop blocks with E_LLM_REASONING_REQUIRED when no sanctioned next slice is derivable', async () => {
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
      'OBJ-001'
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

    const queueRecords = await readQueueRecords(projectRoot, context.objectiveId);
    assert.deepEqual(queueRecords.map((record) => record.status), ['running', 'completed']);
    assert.equal(await pathExists(context.snapshotPath), true);

    const snapshotState = await readResumeSnapshot(projectRoot, context.objectiveId);
    assert.equal(snapshotState.exists, true);
    assert.equal(snapshotState.snapshot.writtenReason, 'loop-iteration');
    assert.equal(snapshotState.snapshot.queueVisibility.queueCursor, '2');
    assert.equal(snapshotState.snapshot.wakeLease.wakeId, 'WAKE-001');

    const events = await readObjectiveEvents(projectRoot, context.objectiveId);
    assert.equal(events.some((entry) => entry.kind === 'loop-iteration'), true);
    assert.equal(events.some((entry) => entry.kind === 'analysis-run' && entry.payload.phase === 'started'), true);
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
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('research-loop treats duplicate wake ids as a no-op and only refreshes the snapshot', async () => {
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

    assert.equal(await pathExists(context.snapshotPath), true);
    const queueRecords = await readQueueRecords(projectRoot, context.objectiveId);
    assert.deepEqual(queueRecords, []);
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
    assert.equal(events.some((entry) => entry.kind === 'stale-wake-lease-reclaimed'), true);
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
        afterQueueResultPersisted: async () => {
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
    assert.equal(events.some((entry) => entry.kind === 'state-repair'), true);
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
    assert.equal(events.some((entry) => entry.kind === 'semantic-drift-detected'), true);
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
