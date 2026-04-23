import assert from 'node:assert/strict';
import { access, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { activateObjective } from '../../objectives/store.js';
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
  const blockerPath = path.join(
    projectRoot,
    '.vibe-science-environment',
    'objectives',
    objectiveId,
    'BLOCKER.flag'
  );
  await writeFile(
    blockerPath,
    [
      'BLOCKER_CODE=E_LLM_REASONING_REQUIRED',
      'BLOCKER_MESSAGE=Operator approval is required before the next slice.',
      `OBJECTIVE_ID=${objectiveId}`,
      `SNAPSHOT_PATH=${relativeSnapshotPath}`,
      'WRITTEN_AT=2026-04-23T08:30:00Z',
      ''
    ].join('\n'),
    'utf8'
  );
  return blockerPath;
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
