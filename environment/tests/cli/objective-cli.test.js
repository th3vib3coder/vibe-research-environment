import assert from 'node:assert/strict';
import { access, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import {
  activateObjective,
  createActiveObjectivePointer
} from '../../objectives/store.js';
import { writeObjectiveBlockerFlag } from '../../objectives/blocker-flag.js';
import { writeObjectiveDigest } from '../../objectives/digest-writer.js';
import { readJsonl } from '../../control/_io.js';
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

function buildObjectiveStartArgs({
  mode = 'unattended-batch',
  includeWakePolicy = true
} = {}) {
  const args = [
    'objective',
    'start',
    '--title',
    'demo objective',
    '--question',
    'why-now',
    '--mode',
    mode,
    '--reasoning-mode',
    'rule-only',
    '--budget',
    'maxWallSeconds=600,maxIterations=5,heartbeatIntervalSeconds=60,costCeiling=2.5'
  ];

  if (includeWakePolicy) {
    args.push(
      '--wake-policy',
      'wakeOwner=windows-task-scheduler,leaseTtlSeconds=90,duplicateWakePolicy=no-op'
    );
  }

  return args;
}

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

async function readJson(targetPath) {
  return JSON.parse(await readFile(targetPath, 'utf8'));
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

async function writeResumeSnapshotFixture(projectRoot, objectiveId, fixtureName, overrides = {}) {
  const snapshot = {
    ...await readFixtureJson('resume-snapshot', fixtureName),
    objectiveId,
    ...overrides
  };
  const snapshotPath = path.join(
    projectRoot,
    '.vibe-science-environment',
    'objectives',
    objectiveId,
    'resume-snapshot.json'
  );
  await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  return snapshotPath;
}

async function installBlockedObjective(projectRoot) {
  const record = await readFixtureJson('objective', 'valid-blocked.json');
  await activateObjective(projectRoot, record, {
    sessionId: 'sess-blocked-fixture'
  });
  return record;
}

async function writeBlockerFlag(projectRoot, objectiveId) {
  const relativeSnapshotPath = `.vibe-science-environment/objectives/${objectiveId}/resume-snapshot.json`;
  return writeObjectiveBlockerFlag(projectRoot, objectiveId, {
    code: 'E_LLM_REASONING_REQUIRED',
    message: 'Operator approval is required before the next slice.',
    snapshotPath: relativeSnapshotPath,
    writtenAt: '2026-04-23T08:30:00Z'
  });
}

test('objective start rejects unattended-batch without a wake policy and emits structured JSON', async () => {
  const projectRoot = await createCliFixtureProject('vre-objective-cli-no-wake-');
  try {
    const result = await runVre(projectRoot, buildObjectiveStartArgs({ includeWakePolicy: false }), {
      env: {
        ...FIXTURE_KERNEL_ENV,
        VRE_SESSION_ID: 'sess-missing-wake'
      }
    });
    assert.equal(result.code, 3, `stderr=${result.stderr}`);
    assert.equal(result.stderr, '');

    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, false);
    assert.equal(payload.command, 'objective start');
    assert.equal(payload.code, 'E_WAKE_POLICY_REQUIRED');
    assert.match(payload.message, /requires --wake-policy/u);
    assert.equal(
      await pathExists(
        path.join(projectRoot, '.vibe-science-environment', 'objectives', 'OBJ-001')
      ),
      false
    );
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('objective start uses an explicit manual wake policy for interactive mode', async () => {
  const projectRoot = await createCliFixtureProject('vre-objective-cli-manual-');
  try {
    const result = await runVre(projectRoot, buildObjectiveStartArgs({
      mode: 'interactive',
      includeWakePolicy: false
    }), {
      env: {
        ...FIXTURE_KERNEL_ENV,
        VRE_SESSION_ID: 'sess-interactive'
      }
    });
    assert.equal(result.code, 0, `stderr=${result.stderr}`);

    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.objectiveId, 'OBJ-001');

    const objectiveRecord = await readJson(
      path.join(projectRoot, '.vibe-science-environment', 'objectives', 'OBJ-001', 'objective.json')
    );
    assert.equal(objectiveRecord.runtimeMode, 'interactive');
    assert.deepEqual(objectiveRecord.wakePolicy, {
      wakeOwner: 'manual',
      wakeSourceId: null,
      leaseTtlSeconds: 60,
      duplicateWakePolicy: 'no-op'
    });
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('objective status --json returns the canonical structured summary for the current objective', async () => {
  const projectRoot = await createCliFixtureProject('vre-objective-cli-status-');
  try {
    await runVre(projectRoot, buildObjectiveStartArgs(), {
      env: {
        ...FIXTURE_KERNEL_ENV,
        VRE_SESSION_ID: 'sess-status'
      }
    });
    await runVre(projectRoot, [
      'objective',
      'pause',
      '--objective',
      'OBJ-001',
      '--reason',
      'operator pause'
    ], {
      env: FIXTURE_KERNEL_ENV
    });

    const result = await runVre(projectRoot, [
      'objective',
      'status',
      '--objective',
      'OBJ-001',
      '--json'
    ], {
      env: FIXTURE_KERNEL_ENV
    });
    assert.equal(result.code, 0, `stderr=${result.stderr}`);
    assert.equal(result.stderr, '');

    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.command, 'objective status');
    assert.equal(payload.objectiveId, 'OBJ-001');
    assert.equal(payload.status, 'paused');
    assert.equal(payload.runtimeMode, 'unattended-batch');
    assert.equal(payload.reasoningMode, 'rule-only');
    assert.equal(payload.wakePolicy.wakeOwner, 'windows-task-scheduler');
    assert.equal(payload.wakePolicy.heartbeatIntervalSeconds, 60);
    assert.equal(payload.resumeSnapshotExists, true);
    assert.match(payload.resumeSnapshotPath, /resume-snapshot\.json$/u);
    assert.match(payload.eventLogPath, /events\.jsonl$/u);
    assert.match(payload.handoffLedgerPath, /handoffs\.jsonl$/u);
    assert.equal(typeof payload.capabilitySummary.kernelMode, 'string');
    assert.equal(Array.isArray(payload.capabilitySummary.degradedReasons), true);
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('objective status surfaces wake health and the newest immutable digest for morning review', async () => {
  const projectRoot = await createCliFixtureProject('vre-objective-cli-morning-status-');
  try {
    await runVre(projectRoot, buildObjectiveStartArgs(), {
      env: {
        ...FIXTURE_KERNEL_ENV,
        VRE_SESSION_ID: 'sess-morning-status'
      }
    });

    const objectiveId = 'OBJ-001';
    const objectiveRecordRelativePath = `.vibe-science-environment/objectives/${objectiveId}/objective.json`;
    const wakeLease = {
      wakeId: 'WAKE-MORNING-001',
      leaseAcquiredAt: '2026-04-24T06:30:00Z',
      leaseExpiresAt: '2099-04-24T06:31:30Z',
      acquiredBy: 'windows-task-scheduler',
      previousWakeId: 'WAKE-MORNING-000'
    };
    await createActiveObjectivePointer(projectRoot, {
      objectiveId,
      objectiveRecordPath: objectiveRecordRelativePath,
      lockAcquiredBySession: 'sess-morning-status',
      currentWakeLease: wakeLease
    });

    const digestSummary = {
      wakeId: wakeLease.wakeId,
      status: 'blocked',
      queueCursor: '2',
      lastTaskId: 'analysis-execution-run:ANL-morning-002',
      snapshotPath: `.vibe-science-environment/objectives/${objectiveId}/resume-snapshot.json`,
      eventLogPath: `.vibe-science-environment/objectives/${objectiveId}/events.jsonl`,
      handoffLedgerPath: `.vibe-science-environment/objectives/${objectiveId}/handoffs.jsonl`,
      queuePath: `.vibe-science-environment/objectives/${objectiveId}/queue.jsonl`,
      digestKind: 'morning-blocker',
      stopReason: 'E_LLM_REASONING_REQUIRED',
      notes: null
    };
    const firstDigest = await writeObjectiveDigest(projectRoot, objectiveId, {
      ...digestSummary,
      writtenAt: '2026-04-24T06:31:00Z'
    });
    const secondDigest = await writeObjectiveDigest(projectRoot, objectiveId, {
      ...digestSummary,
      writtenAt: '2026-04-24T06:32:00Z'
    });

    const firstDigestText = await readFile(firstDigest.immutablePath, 'utf8');
    const secondDigestText = await readFile(secondDigest.immutablePath, 'utf8');
    const latestDigestText = await readFile(secondDigest.latestPath, 'utf8');
    assert.notEqual(firstDigestText, secondDigestText);
    assert.equal(latestDigestText, secondDigestText);
    assert.match(latestDigestText, /Snapshot Path: .*resume-snapshot\.json/u);
    assert.match(latestDigestText, /Event Log Path: .*events\.jsonl/u);
    assert.match(latestDigestText, /Handoff Ledger Path: .*handoffs\.jsonl/u);
    assert.match(latestDigestText, /Queue Path: .*queue\.jsonl/u);
    assert.doesNotMatch(latestDigestText, /implementation-complete with saved evidence|verified against documentation|all saved/iu);

    const result = await runVre(projectRoot, [
      'objective',
      'status',
      '--objective',
      objectiveId,
      '--json'
    ], {
      env: FIXTURE_KERNEL_ENV
    });
    assert.equal(result.code, 0, `stderr=${result.stderr}`);
    assert.equal(result.stderr, '');

    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.objectiveId, objectiveId);
    assert.equal(payload.status, 'active');
    assert.equal(payload.wakePolicy.lastWakeId, wakeLease.wakeId);
    assert.equal(payload.wakePolicy.leaseStatus, 'held');
    assert.equal(typeof payload.wakePolicy.nextUnattendedSliceArmed, 'boolean');
    assert.deepEqual(payload.wakePolicy.currentWakeLease, wakeLease);
    assert.equal(payload.latestDigestExists, true);
    assert.equal(payload.latestDigestPath, secondDigest.immutablePath.replaceAll('\\', '/').replace(`${projectRoot.replaceAll('\\', '/')}/`, ''));
    assert.match(payload.latestDigestPath, /digest-2026-04-24T06-32-00Z\.md$/u);
    assert.equal(payload.capabilitySummary.vrePresent, true);
    assert.equal(typeof payload.capabilitySummary.memoryFresh, 'boolean');
    assert.equal(Array.isArray(payload.capabilitySummary.missingSurfaces), true);
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('objective resume reactivates a paused objective, appends a resume event, and refreshes the handshake', async () => {
  const projectRoot = await createCliFixtureProject('vre-objective-cli-resume-');
  try {
    await runVre(projectRoot, buildObjectiveStartArgs(), {
      env: {
        ...FIXTURE_KERNEL_ENV,
        VRE_SESSION_ID: 'sess-resume'
      }
    });
    await runVre(projectRoot, [
      'objective',
      'pause',
      '--objective',
      'OBJ-001',
      '--reason',
      'operator pause'
    ], {
      env: FIXTURE_KERNEL_ENV
    });

    const result = await runVre(projectRoot, [
      'objective',
      'resume',
      '--objective',
      'OBJ-001'
    ], {
      env: FIXTURE_KERNEL_ENV
    });
    assert.equal(result.code, 0, `stderr=${result.stderr}`);

    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.command, 'objective resume');
    assert.equal(payload.status, 'active');
    assert.equal(payload.blockerResolved, false);
    assert.equal(payload.repairSnapshotApplied, false);
    assert.equal(payload.handshakeObjective.status, 'active');

    const objectiveRecord = await readJson(
      path.join(projectRoot, '.vibe-science-environment', 'objectives', 'OBJ-001', 'objective.json')
    );
    assert.equal(objectiveRecord.status, 'active');

    const events = await readJsonl(
      path.join(projectRoot, '.vibe-science-environment', 'objectives', 'OBJ-001', 'events.jsonl')
    );
    assert.equal(events.at(-1)?.kind, 'resume');
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('objective resume clears BLOCKER.flag by writing blocker-resolve before resume', async () => {
  const projectRoot = await createCliFixtureProject('vre-objective-cli-blocker-resolve-');
  try {
    const objectiveRecord = await installBlockedObjective(projectRoot);
    await writeResumeSnapshotFixture(projectRoot, objectiveRecord.objectiveId, 'valid-mid-loop.json', {
      objectiveStatusAtSnapshot: 'blocked',
      runtimeMode: objectiveRecord.runtimeMode,
      reasoningMode: objectiveRecord.reasoningMode
    });
    const blockerPath = await writeBlockerFlag(projectRoot, objectiveRecord.objectiveId);

    const result = await runVre(projectRoot, [
      'objective',
      'resume',
      '--objective',
      objectiveRecord.objectiveId
    ], {
      env: FIXTURE_KERNEL_ENV
    });
    assert.equal(result.code, 0, `stderr=${result.stderr}`);

    const payload = JSON.parse(result.stdout);
    assert.equal(payload.blockerResolved, true);
    assert.equal(await pathExists(blockerPath), false);

    const events = await readJsonl(
      path.join(
        projectRoot,
        '.vibe-science-environment',
        'objectives',
        objectiveRecord.objectiveId,
        'events.jsonl'
      )
    );
    assert.deepEqual(events.map((entry) => entry.kind), ['blocker-resolve', 'resume']);
    assert.equal(events[0].payload.code, 'E_LLM_REASONING_REQUIRED');
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('T4.5.3: objective resume refuses to resolve SEMANTIC_DRIFT_DETECTED without a reviewer-2 verdict', async () => {
  const projectRoot = await createCliFixtureProject('vre-objective-cli-drift-r2-gate-');
  try {
    const objectiveRecord = await installBlockedObjective(projectRoot);
    await writeResumeSnapshotFixture(projectRoot, objectiveRecord.objectiveId, 'valid-mid-loop.json', {
      objectiveStatusAtSnapshot: 'blocked',
      runtimeMode: objectiveRecord.runtimeMode,
      reasoningMode: objectiveRecord.reasoningMode,
      openBlockers: [{
        code: 'SEMANTIC_DRIFT_DETECTED',
        message: 'Strategic drift requires Reviewer-2 before resume.',
        openedAt: '2026-04-25T08:30:00Z',
      }],
    });
    const blockerPath = await writeObjectiveBlockerFlag(projectRoot, objectiveRecord.objectiveId, {
      code: 'SEMANTIC_DRIFT_DETECTED',
      message: 'Strategic drift requires Reviewer-2 before resume.',
      snapshotPath: `.vibe-science-environment/objectives/${objectiveRecord.objectiveId}/resume-snapshot.json`,
      writtenAt: '2026-04-25T08:30:00Z',
    });

    const result = await runVre(projectRoot, [
      'objective',
      'resume',
      '--objective',
      objectiveRecord.objectiveId
    ], {
      env: FIXTURE_KERNEL_ENV
    });
    assert.equal(result.code, 1, `stderr=${result.stderr}`);
    assert.equal(result.stderr, '');

    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, false);
    assert.equal(payload.command, 'objective resume');
    assert.equal(payload.code, 'E_R2_REVIEW_PENDING');
    // namedPhase9ErrorPayload spreads `extra` to the top level (...extra), so
    // requestedReviewer lands at payload.requestedReviewer, not payload.extra.requestedReviewer.
    assert.equal(payload.requestedReviewer, 'reviewer-2');
    assert.equal(await pathExists(blockerPath), true);

    const objectiveAfter = await readJson(
      path.join(
        projectRoot,
        '.vibe-science-environment',
        'objectives',
        objectiveRecord.objectiveId,
        'objective.json'
      )
    );
    assert.equal(objectiveAfter.status, 'blocked');

    const events = await readJsonl(
      path.join(
        projectRoot,
        '.vibe-science-environment',
        'objectives',
        objectiveRecord.objectiveId,
        'events.jsonl'
      )
    );
    assert.equal(events.some((entry) => entry.kind === 'blocker-resolve'), false);
    assert.equal(events.some((entry) => entry.kind === 'resume'), false);
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('objective resume fails with E_REASONING_MODE_DIVERGED when the snapshot diverges and no repair is requested', async () => {
  const projectRoot = await createCliFixtureProject('vre-objective-cli-diverged-');
  try {
    const objectiveRecord = await installBlockedObjective(projectRoot);
    await writeResumeSnapshotFixture(
      projectRoot,
      objectiveRecord.objectiveId,
      'invalid-reasoning-mode-diverged.json'
    );

    const result = await runVre(projectRoot, [
      'objective',
      'resume',
      '--objective',
      objectiveRecord.objectiveId
    ], {
      env: FIXTURE_KERNEL_ENV
    });
    assert.equal(result.code, 1, `stderr=${result.stderr}`);
    assert.equal(result.stderr, '');

    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, false);
    assert.equal(payload.command, 'objective resume');
    assert.equal(payload.code, 'E_REASONING_MODE_DIVERGED');

    const currentObjective = await readJson(
      path.join(
        projectRoot,
        '.vibe-science-environment',
        'objectives',
        objectiveRecord.objectiveId,
        'objective.json'
      )
    );
    assert.equal(currentObjective.reasoningMode, 'rule-only');
    assert.equal(currentObjective.status, 'blocked');
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('objective resume --repair-snapshot rewrites the stale snapshot without mutating objective.reasoningMode', async () => {
  const projectRoot = await createCliFixtureProject('vre-objective-cli-repair-snapshot-');
  try {
    const objectiveRecord = await installBlockedObjective(projectRoot);
    const snapshotPath = await writeResumeSnapshotFixture(
      projectRoot,
      objectiveRecord.objectiveId,
      'invalid-reasoning-mode-diverged.json'
    );

    const result = await runVre(projectRoot, [
      'objective',
      'resume',
      '--objective',
      objectiveRecord.objectiveId,
      '--repair-snapshot'
    ], {
      env: FIXTURE_KERNEL_ENV
    });
    assert.equal(result.code, 0, `stderr=${result.stderr}`);

    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.repairSnapshotApplied, true);
    assert.match(payload.resumeSnapshotPath, /resume-snapshot\.json$/u);

    const repairedSnapshot = await readJson(snapshotPath);
    assert.equal(repairedSnapshot.reasoningMode, 'rule-only');

    const currentObjective = await readJson(
      path.join(
        projectRoot,
        '.vibe-science-environment',
        'objectives',
        objectiveRecord.objectiveId,
        'objective.json'
      )
    );
    assert.equal(currentObjective.reasoningMode, 'rule-only');
    assert.equal(currentObjective.status, 'active');

    const events = await readJsonl(
      path.join(
        projectRoot,
        '.vibe-science-environment',
        'objectives',
        objectiveRecord.objectiveId,
        'events.jsonl'
      )
    );
    assert.deepEqual(events.map((entry) => entry.kind), ['state-repair', 'resume']);
    assert.equal(events[0].payload.repairedLayer, 'snapshot');
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('objective resume blocks when the resume snapshot kernel fingerprint is stale or invalid', async () => {
  const projectRoot = await createCliFixtureProject('vre-objective-cli-resume-stale-fingerprint-');
  try {
    const start = await runVre(projectRoot, buildObjectiveStartArgs(), {
      env: {
        ...FIXTURE_KERNEL_ENV,
        VRE_SESSION_ID: 'sess-stale-fingerprint'
      }
    });
    assert.equal(start.code, 0, `start stderr=${start.stderr}`);
    const startPayload = JSON.parse(start.stdout);

    const pause = await runVre(projectRoot, [
      'objective',
      'pause',
      '--objective',
      startPayload.objectiveId,
      '--reason',
      'prepare stale fingerprint'
    ], {
      env: FIXTURE_KERNEL_ENV
    });
    assert.equal(pause.code, 0, `pause stderr=${pause.stderr}`);
    await writeResumeSnapshotFixture(
      projectRoot,
      startPayload.objectiveId,
      'invalid-stale-fingerprint.json'
    );

    const resume = await runVre(projectRoot, [
      'objective',
      'resume',
      '--objective',
      startPayload.objectiveId
    ], {
      env: FIXTURE_KERNEL_ENV
    });
    assert.equal(resume.code, 1, `resume stderr=${resume.stderr}`);
    assert.equal(resume.stderr, '');

    const payload = JSON.parse(resume.stdout);
    assert.equal(payload.ok, false);
    assert.equal(payload.command, 'objective resume');
    assert.equal(payload.code, 'E_RESUME_SNAPSHOT_INVALID');
    assert.match(payload.message, /must match format "date-time"/u);
    assert.match(payload.resumeSnapshotPath, /resume-snapshot\.json$/u);

    const objectiveRecord = await readJson(
      path.join(projectRoot, '.vibe-science-environment', 'objectives', startPayload.objectiveId, 'objective.json')
    );
    assert.equal(objectiveRecord.status, 'paused');

    const events = await readJsonl(
      path.join(projectRoot, '.vibe-science-environment', 'objectives', startPayload.objectiveId, 'events.jsonl')
    );
    assert.deepEqual(events.map((entry) => entry.kind), []);
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

// Round 48 regression: resume error branches must return structured JSON.
//
// Background: the seq 062 closure claimed "Lifecycle error branches now
// return structured JSON payloads through ObjectiveCliError". That claim
// was accurate for start/pause/stop/status but NOT for resume, because
// `resumeObjectiveCommand` in `environment/objectives/cli.js` used
// `return withLock(...)` instead of `return await withLock(...)`. The
// missing `await` meant the outer try/catch exited synchronously before
// the inner withLock promise rejected, so raw Error objects thrown inside
// the lock body (e.g. "Cannot resume objective in status active",
// "No active objective pointer exists") bypassed
// `coerceObjectiveCliError` and reached bin/vre as plain Error. They then
// fell through the ObjectiveCliError branch of the dispatcher
// (`bin/vre:1117`) and were emitted as plain-text stderr instead of the
// contracted structured JSON. The fix is a single-line
// `return` -> `return await` in `resumeObjectiveCommand`. These two
// regression tests pin both affected branches.

test('objective resume on an active objective returns structured JSON with E_OBJECTIVE_STATE_INVALID', async () => {
  const projectRoot = await createCliFixtureProject('vre-objective-cli-resume-active-');
  try {
    const start = await runVre(projectRoot, buildObjectiveStartArgs(), {
      env: {
        ...FIXTURE_KERNEL_ENV,
        VRE_SESSION_ID: 'sess-resume-when-active'
      }
    });
    assert.equal(start.code, 0, `start stderr=${start.stderr}`);
    const startPayload = JSON.parse(start.stdout);

    const resume = await runVre(projectRoot, [
      'objective',
      'resume',
      '--objective',
      startPayload.objectiveId
    ], {
      env: FIXTURE_KERNEL_ENV
    });
    assert.equal(resume.code, 1, `resume stderr=${resume.stderr}`);
    assert.equal(resume.stderr, '');

    const payload = JSON.parse(resume.stdout);
    assert.equal(payload.ok, false);
    assert.equal(payload.command, 'objective resume');
    assert.equal(payload.code, 'E_OBJECTIVE_STATE_INVALID');
    assert.equal(payload.transition, 'resume');
    assert.equal(payload.status, 'active');
    assert.match(payload.message, /Cannot resume objective in status active/u);
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('objective resume after objective stop returns structured JSON with E_ACTIVE_OBJECTIVE_POINTER_MISSING', async () => {
  const projectRoot = await createCliFixtureProject('vre-objective-cli-resume-terminal-');
  try {
    const start = await runVre(projectRoot, buildObjectiveStartArgs(), {
      env: {
        ...FIXTURE_KERNEL_ENV,
        VRE_SESSION_ID: 'sess-resume-terminal'
      }
    });
    assert.equal(start.code, 0, `start stderr=${start.stderr}`);
    const startPayload = JSON.parse(start.stdout);

    const stop = await runVre(projectRoot, [
      'objective',
      'stop',
      '--objective',
      startPayload.objectiveId,
      '--reason',
      'operator stop'
    ], {
      env: FIXTURE_KERNEL_ENV
    });
    assert.equal(stop.code, 0, `stop stderr=${stop.stderr}`);

    const resume = await runVre(projectRoot, [
      'objective',
      'resume',
      '--objective',
      startPayload.objectiveId
    ], {
      env: FIXTURE_KERNEL_ENV
    });
    assert.equal(resume.code, 1, `resume stderr=${resume.stderr}`);
    assert.equal(resume.stderr, '');

    const payload = JSON.parse(resume.stdout);
    assert.equal(payload.ok, false);
    assert.equal(payload.command, 'objective resume');
    assert.equal(payload.code, 'E_ACTIVE_OBJECTIVE_POINTER_MISSING');
    assert.match(payload.message, /No active objective pointer exists/u);
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});
