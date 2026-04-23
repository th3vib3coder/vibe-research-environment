import assert from 'node:assert/strict';
import { mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';

import { activateObjective, readObjectiveRecord } from '../../objectives/store.js';
import {
  AUTO_WAKE_ID_SENTINEL,
  INTERNALS as SCHEDULER_INTERNALS,
  objectiveDoctorCommand,
  schedulerDoctorCommand,
  schedulerInstallCommand,
  schedulerRemoveCommand,
  schedulerStatusCommand,
  SchedulerCliError
} from '../../orchestrator/windows-task-scheduler.js';
import {
  cleanupCliFixtureProject,
  createCliFixtureProject,
  repoRoot
} from '../cli/_fixture.js';

async function readFixture(fileName) {
  return JSON.parse(
    await readFile(
      path.join(
        repoRoot,
        'environment',
        'tests',
        'fixtures',
        'phase9',
        'objective',
        fileName
      ),
      'utf8'
    )
  );
}

async function seedActiveObjective(projectRoot, overrides = {}) {
  const objectiveRecord = await readFixture('valid-active.json');
  const merged = {
    ...objectiveRecord,
    objectiveId: overrides.objectiveId ?? 'OBJ-001',
    status: overrides.status ?? 'active',
    runtimeMode: overrides.runtimeMode ?? 'unattended-batch',
    reasoningMode: overrides.reasoningMode ?? 'rule-only',
    wakePolicy: {
      ...objectiveRecord.wakePolicy,
      ...(overrides.wakePolicy ?? {})
    },
    artifactsIndex: {
      ...objectiveRecord.artifactsIndex,
      ...(overrides.artifactsIndex ?? {})
    },
    lastUpdatedAt: overrides.lastUpdatedAt ?? '2026-04-23T21:45:00Z'
  };
  await activateObjective(projectRoot, merged, {
    sessionId: 'sess-scheduler-test'
  });
  return merged;
}

function createFakeSchedulerDeps(projectRoot, options = {}) {
  const tasks = new Map();
  const nextRunTime = options.nextRunTime ?? '2026-04-24T06:00:00.000Z';
  const hostSupport = options.hostSupport ?? {
    supportMode: 'full',
    code: null,
    reason: null,
    platform: 'win32',
    adminConfirmed: true,
    hasS3: true,
    hasS0ix: false,
    wakeTimersEnabled: true,
    acConfirmed: true
  };

  return {
    detectHostSupport: async () => hostSupport,
    registerTask: async (taskDefinition) => {
      tasks.set(taskDefinition.taskName, {
        exists: true,
        taskName: taskDefinition.taskName,
        state: 'Ready',
        lastRunTime: null,
        nextRunTime,
        execute: taskDefinition.execute,
        arguments: taskDefinition.arguments,
        workingDirectory: taskDefinition.workingDirectory,
        wakeToRun: 'true',
        disallowStartIfOnBatteries: 'false',
        stopIfGoingOnBatteries: 'false',
        runLevel: 'Highest',
        userId: 'SYSTEM',
        logonType: 'ServiceAccount'
      });
    },
    readTask: async (taskName) => tasks.get(taskName) ?? { exists: false, taskName },
    removeTask: async (taskName) => {
      const removed = tasks.delete(taskName);
      return { removed };
    },
    runHeartbeatProbe: async () => ({
      ok: true,
      exitCode: 0,
      payload: {
        ok: true,
        probe: 'heartbeat'
      }
    })
  };
}

async function runHeartbeatAction(taskDefinition, projectRoot) {
  return new Promise((resolve, reject) => {
    const child = spawn(taskDefinition.execute, taskDefinition.argv, {
      cwd: taskDefinition.workingDirectory,
      env: {
        ...process.env,
        VRE_HEARTBEAT_PROBE_ONLY: '1',
        VRE_KERNEL_PATH: path.join('environment', 'tests', 'fixtures', 'fake-kernel-sibling')
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ code, stdout, stderr, projectRoot });
    });
  });
}

test('scheduler install emits deterministic task definition and scheduler status returns structured JSON', async () => {
  const projectRoot = await createCliFixtureProject('vre-scheduler-install-');
  try {
    await seedActiveObjective(projectRoot);
    const deps = createFakeSchedulerDeps(projectRoot);
    const preInstallStatus = await schedulerStatusCommand(projectRoot, {
      objectiveId: 'OBJ-001'
    }, deps);

    const installPayload = await schedulerInstallCommand(projectRoot, {
      objectiveId: 'OBJ-001'
    }, deps);
    const persistedObjective = await readObjectiveRecord(projectRoot, 'OBJ-001');
    const expectedTaskName = SCHEDULER_INTERNALS.deterministicTaskName(projectRoot, 'OBJ-001');

    assert.equal(preInstallStatus.taskInstalled, false);
    assert.equal(preInstallStatus.boundObjectiveId, null);
    assert.equal(installPayload.ok, true);
    assert.equal(installPayload.supportMode, 'full');
    assert.equal(installPayload.taskName, expectedTaskName);
    assert.equal(installPayload.taskDefinition.execute, process.execPath);
    assert.deepEqual(
      installPayload.taskDefinition.argv.slice(-7),
      ['research-loop', '--objective', 'OBJ-001', '--heartbeat', '--wake-id', AUTO_WAKE_ID_SENTINEL, '--json']
    );
    assert.equal(
      installPayload.taskDefinition.arguments.includes('--objective OBJ-001'),
      true
    );
    assert.equal(
      installPayload.taskDefinition.arguments.includes(`--wake-id ${AUTO_WAKE_ID_SENTINEL}`),
      true
    );
    assert.equal(
      installPayload.taskDefinition.arguments.includes('--json'),
      true
    );
    assert.equal(persistedObjective.wakePolicy.wakeSourceId, expectedTaskName);

    const statusPayload = await schedulerStatusCommand(projectRoot, {
      objectiveId: 'OBJ-001'
    }, deps);
    assert.equal(statusPayload.ok, true);
    assert.equal(statusPayload.taskInstalled, true);
    assert.equal(statusPayload.supportMode, 'full');
    assert.equal(statusPayload.boundObjectiveId, 'OBJ-001');
    assert.equal(statusPayload.nextRunAt, '2026-04-24T06:00:00.000Z');
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('scheduler doctor reports conditional support with a concrete reason and scheduler remove is idempotent', async () => {
  const projectRoot = await createCliFixtureProject('vre-scheduler-doctor-');
  try {
    await seedActiveObjective(projectRoot);
    const deps = createFakeSchedulerDeps(projectRoot, {
      hostSupport: {
        supportMode: 'conditional',
        code: null,
        reason: 'S0ix/Modern Standby is available with wake timers enabled on AC, but this remains conditional rather than acceptance-grade.',
        platform: 'win32',
        adminConfirmed: true,
        hasS3: false,
        hasS0ix: true,
        wakeTimersEnabled: true,
        acConfirmed: true
      }
    });

    await schedulerInstallCommand(projectRoot, {
      objectiveId: 'OBJ-001'
    }, deps);

    const doctorPayload = await schedulerDoctorCommand(projectRoot, {
      objectiveId: 'OBJ-001'
    }, deps);
    assert.equal(doctorPayload.ok, true);
    assert.equal(doctorPayload.supportMode, 'conditional');
    assert.match(doctorPayload.reason, /conditional/u);

    const firstRemove = await schedulerRemoveCommand(projectRoot, {
      objectiveId: 'OBJ-001'
    }, deps);
    const secondRemove = await schedulerRemoveCommand(projectRoot, {
      objectiveId: 'OBJ-001'
    }, deps);

    assert.equal(firstRemove.removed, true);
    assert.equal(firstRemove.alreadyAbsent, false);
    assert.equal(secondRemove.removed, false);
    assert.equal(secondRemove.alreadyAbsent, true);
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('manual schtasks /Run-style invocation reaches the VRE CLI through the heartbeat probe path', async () => {
  const projectRoot = await createCliFixtureProject('vre-scheduler-manual-run-');
  try {
    const objectiveRecord = await seedActiveObjective(projectRoot);
    const taskDefinition = SCHEDULER_INTERNALS.expectedTaskDefinition(projectRoot, objectiveRecord);
    const firstResult = await runHeartbeatAction(taskDefinition, projectRoot);
    const secondResult = await runHeartbeatAction(taskDefinition, projectRoot);

    assert.equal(firstResult.code, 0, `stderr=${firstResult.stderr}`);
    assert.equal(secondResult.code, 0, `stderr=${secondResult.stderr}`);
    assert.equal(firstResult.stderr, '');
    assert.equal(secondResult.stderr, '');
    const firstPayload = JSON.parse(firstResult.stdout);
    const secondPayload = JSON.parse(secondResult.stdout);
    assert.equal(firstPayload.ok, true);
    assert.equal(secondPayload.ok, true);
    assert.equal(firstPayload.command, 'research-loop');
    assert.equal(secondPayload.command, 'research-loop');
    assert.equal(firstPayload.probe, 'heartbeat');
    assert.equal(secondPayload.probe, 'heartbeat');
    assert.equal(firstPayload.objectiveId, 'OBJ-001');
    assert.equal(secondPayload.objectiveId, 'OBJ-001');
    assert.notEqual(firstPayload.wakeId, AUTO_WAKE_ID_SENTINEL);
    assert.notEqual(secondPayload.wakeId, AUTO_WAKE_ID_SENTINEL);
    assert.notEqual(firstPayload.wakeId, taskDefinition.taskName);
    assert.notEqual(secondPayload.wakeId, taskDefinition.taskName);
    assert.notEqual(firstPayload.wakeId, secondPayload.wakeId);
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('scheduler install preserves objective wakeSourceId and removes the task when post-registration contract validation fails', async () => {
  const projectRoot = await createCliFixtureProject('vre-scheduler-install-contract-fail-');
  try {
    const seeded = await seedActiveObjective(projectRoot, {
      wakePolicy: {
        wakeSourceId: null
      }
    });
    const deps = createFakeSchedulerDeps(projectRoot);
    const realReadTask = deps.readTask;
    const realRemoveTask = deps.removeTask;
    let cleanupRemoved = false;
    deps.readTask = async (...args) => {
      const task = await realReadTask(...args);
      if (!task.exists) {
        return task;
      }
      return {
        ...task,
        arguments: 'research-loop --objective OBJ-999 --heartbeat --wake-id wrong --json'
      };
    };
    deps.removeTask = async (...args) => {
      const result = await realRemoveTask(...args);
      cleanupRemoved = Boolean(result?.removed);
      return result;
    };

    await assert.rejects(
      () => schedulerInstallCommand(projectRoot, { objectiveId: 'OBJ-001' }, deps),
      (error) => {
        assert.equal(error instanceof SchedulerCliError, true);
        assert.equal(error.command, 'scheduler install');
        assert.equal(error.code, 'E_SCHEDULER_CREDENTIAL_MODE_UNSUPPORTED');
        assert.equal(error.extra.cleanupRemoved, true);
        return true;
      }
    );

    const persistedObjective = await readObjectiveRecord(projectRoot, 'OBJ-001');
    const expectedTaskName = SCHEDULER_INTERNALS.deterministicTaskName(projectRoot, 'OBJ-001');
    const taskAfterFailure = await deps.readTask(expectedTaskName);
    assert.equal(cleanupRemoved, true);
    assert.equal(taskAfterFailure.exists, false);
    assert.equal(persistedObjective.wakePolicy.wakeSourceId, seeded.wakePolicy.wakeSourceId);
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('objective doctor fails when scheduler doctor reports unsupported', async () => {
  const projectRoot = await createCliFixtureProject('vre-objective-doctor-scheduler-');
  try {
    await seedActiveObjective(projectRoot);
    const deps = createFakeSchedulerDeps(projectRoot, {
      hostSupport: {
        supportMode: 'unsupported',
        code: 'E_WAKE_TIMERS_DISABLED',
        reason: 'Windows power policy currently prevents timer-based wake for the active power plan.',
        platform: 'win32',
        adminConfirmed: true,
        hasS3: true,
        hasS0ix: false,
        wakeTimersEnabled: false,
        acConfirmed: true
      }
    });

    await assert.rejects(
      () => objectiveDoctorCommand(projectRoot, { objectiveId: 'OBJ-001' }, deps),
      (error) => {
        assert.equal(error instanceof SchedulerCliError, true);
        assert.equal(error.command, 'objective doctor');
        assert.equal(error.code, 'E_WAKE_TIMERS_DISABLED');
        return true;
      }
    );
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

// Round 67 regression coverage: close the seq-080 / seq-081 claim-without-pin
// gap. `objectiveDoctorCommand` has eight guard branches before it delegates to
// `schedulerDoctorCommand`, but only the delegation happy-path was pinned by
// the seq-080 test suite (test 'objective doctor fails when scheduler doctor
// reports unsupported' above). Deep adversarial review enumerated each code
// raised in `windows-task-scheduler.js` and cross-checked against every test
// file in the suite; eight error codes raised from the objective-doctor path
// had zero dedicated test. Round 67 adds one regression per guard branch so a
// future refactor cannot silently drop any of them. No runtime change.

test('objective doctor fails closed with E_OBJECTIVE_NOT_FOUND when the objective record is absent', async () => {
  const projectRoot = await createCliFixtureProject('vre-obj-doctor-not-found-');
  try {
    const deps = createFakeSchedulerDeps(projectRoot);

    await assert.rejects(
      () => objectiveDoctorCommand(projectRoot, { objectiveId: 'OBJ-DOES-NOT-EXIST' }, deps),
      (error) => {
        assert.equal(error instanceof SchedulerCliError, true);
        assert.equal(error.command, 'objective doctor');
        assert.equal(error.code, 'E_OBJECTIVE_NOT_FOUND');
        return true;
      }
    );
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('objective doctor fails closed with E_ACTIVE_OBJECTIVE_POINTER_MISSING when no active pointer exists', async () => {
  const projectRoot = await createCliFixtureProject('vre-obj-doctor-no-pointer-');
  try {
    const raw = await readFixture('valid-active.json');
    const injectedRecord = { ...raw, objectiveId: 'OBJ-001' };
    const deps = createFakeSchedulerDeps(projectRoot);
    deps.readObjectiveRecord = async () => injectedRecord;
    deps.validateObjectiveRecord = async () => {};
    deps.readActiveObjectivePointer = async () => null;

    await assert.rejects(
      () => objectiveDoctorCommand(projectRoot, { objectiveId: 'OBJ-001' }, deps),
      (error) => {
        assert.equal(error instanceof SchedulerCliError, true);
        assert.equal(error.command, 'objective doctor');
        assert.equal(error.code, 'E_ACTIVE_OBJECTIVE_POINTER_MISSING');
        return true;
      }
    );
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('objective doctor fails closed with E_OBJECTIVE_ID_MISMATCH when the active pointer targets a different objective', async () => {
  const projectRoot = await createCliFixtureProject('vre-obj-doctor-id-mismatch-');
  try {
    await seedActiveObjective(projectRoot, { objectiveId: 'OBJ-001' });
    const raw = await readFixture('valid-active.json');
    const secondRecord = { ...raw, objectiveId: 'OBJ-002' };
    const deps = createFakeSchedulerDeps(projectRoot);
    deps.readObjectiveRecord = async (_root, objectiveId) => {
      if (objectiveId === 'OBJ-002') return secondRecord;
      throw new Error(`Unexpected objectiveId: ${objectiveId}`);
    };
    deps.validateObjectiveRecord = async () => {};

    await assert.rejects(
      () => objectiveDoctorCommand(projectRoot, { objectiveId: 'OBJ-002' }, deps),
      (error) => {
        assert.equal(error instanceof SchedulerCliError, true);
        assert.equal(error.command, 'objective doctor');
        assert.equal(error.code, 'E_OBJECTIVE_ID_MISMATCH');
        assert.equal(error.extra.activeObjectiveId, 'OBJ-001');
        assert.equal(error.extra.objectiveId, 'OBJ-002');
        return true;
      }
    );
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('objective doctor fails closed with E_OBJECTIVE_STATE_INVALID when the objective status is not active', async () => {
  const projectRoot = await createCliFixtureProject('vre-obj-doctor-state-invalid-');
  try {
    await seedActiveObjective(projectRoot, { objectiveId: 'OBJ-001' });
    const raw = await readFixture('valid-active.json');
    const pausedRecord = { ...raw, objectiveId: 'OBJ-001', status: 'paused' };
    const deps = createFakeSchedulerDeps(projectRoot);
    deps.readObjectiveRecord = async () => pausedRecord;
    deps.validateObjectiveRecord = async () => {};

    await assert.rejects(
      () => objectiveDoctorCommand(projectRoot, { objectiveId: 'OBJ-001' }, deps),
      (error) => {
        assert.equal(error instanceof SchedulerCliError, true);
        assert.equal(error.command, 'objective doctor');
        assert.equal(error.code, 'E_OBJECTIVE_STATE_INVALID');
        assert.equal(error.extra.status, 'paused');
        assert.equal(error.extra.objectiveId, 'OBJ-001');
        return true;
      }
    );
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('objective doctor fails closed with E_RUNTIME_MODE_UNSUPPORTED when the persisted runtimeMode falls outside the reviewed set', async () => {
  const projectRoot = await createCliFixtureProject('vre-obj-doctor-runtime-mode-');
  try {
    await seedActiveObjective(projectRoot, { objectiveId: 'OBJ-001' });
    const raw = await readFixture('valid-active.json');
    const tamperedRecord = { ...raw, objectiveId: 'OBJ-001', runtimeMode: 'reviewed-api-preview' };
    const deps = createFakeSchedulerDeps(projectRoot);
    deps.readObjectiveRecord = async () => tamperedRecord;
    deps.validateObjectiveRecord = async () => {};

    await assert.rejects(
      () => objectiveDoctorCommand(projectRoot, { objectiveId: 'OBJ-001' }, deps),
      (error) => {
        assert.equal(error instanceof SchedulerCliError, true);
        assert.equal(error.command, 'objective doctor');
        assert.equal(error.code, 'E_RUNTIME_MODE_UNSUPPORTED');
        assert.equal(error.extra.runtimeMode, 'reviewed-api-preview');
        assert.equal(error.extra.objectiveId, 'OBJ-001');
        return true;
      }
    );
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('objective doctor fails closed with E_REASONING_MODE_UNSUPPORTED when the persisted reasoningMode is not rule-only', async () => {
  const projectRoot = await createCliFixtureProject('vre-obj-doctor-reasoning-mode-');
  try {
    await seedActiveObjective(projectRoot, { objectiveId: 'OBJ-001' });
    const raw = await readFixture('valid-active.json');
    const tamperedRecord = { ...raw, objectiveId: 'OBJ-001', reasoningMode: 'reviewed-api' };
    const deps = createFakeSchedulerDeps(projectRoot);
    deps.readObjectiveRecord = async () => tamperedRecord;
    deps.validateObjectiveRecord = async () => {};

    await assert.rejects(
      () => objectiveDoctorCommand(projectRoot, { objectiveId: 'OBJ-001' }, deps),
      (error) => {
        assert.equal(error instanceof SchedulerCliError, true);
        assert.equal(error.command, 'objective doctor');
        assert.equal(error.code, 'E_REASONING_MODE_UNSUPPORTED');
        assert.equal(error.extra.reasoningMode, 'reviewed-api');
        assert.equal(error.extra.objectiveId, 'OBJ-001');
        return true;
      }
    );
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('objective doctor fails closed with E_OBJECTIVE_ARTIFACT_PATH_MISSING when artifactsIndex references missing files', async () => {
  const projectRoot = await createCliFixtureProject('vre-obj-doctor-missing-artifact-');
  try {
    await seedActiveObjective(projectRoot, {
      objectiveId: 'OBJ-001',
      artifactsIndex: {
        experiments: ['EXP-001', 'results/never-written-artifact.json']
      }
    });
    const deps = createFakeSchedulerDeps(projectRoot);

    await assert.rejects(
      () => objectiveDoctorCommand(projectRoot, { objectiveId: 'OBJ-001' }, deps),
      (error) => {
        assert.equal(error instanceof SchedulerCliError, true);
        assert.equal(error.command, 'objective doctor');
        assert.equal(error.code, 'E_OBJECTIVE_ARTIFACT_PATH_MISSING');
        assert.ok(Array.isArray(error.extra.missingArtifactPaths));
        assert.ok(
          error.extra.missingArtifactPaths.includes('results/never-written-artifact.json'),
          `expected missingArtifactPaths to include the seeded missing path, got ${JSON.stringify(error.extra.missingArtifactPaths)}`
        );
        assert.equal(error.extra.objectiveId, 'OBJ-001');
        return true;
      }
    );
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('objective doctor fails closed with E_STATE_CONFLICT when events.jsonl carries an unresolved E_STATE_CONFLICT blocker', async () => {
  const projectRoot = await createCliFixtureProject('vre-obj-doctor-state-conflict-');
  try {
    await seedActiveObjective(projectRoot, { objectiveId: 'OBJ-001' });
    const deps = createFakeSchedulerDeps(projectRoot);
    deps.readObjectiveEvents = async () => [
      { kind: 'blocker-open', payload: { code: 'E_STATE_CONFLICT' } }
    ];

    await assert.rejects(
      () => objectiveDoctorCommand(projectRoot, { objectiveId: 'OBJ-001' }, deps),
      (error) => {
        assert.equal(error instanceof SchedulerCliError, true);
        assert.equal(error.command, 'objective doctor');
        assert.equal(error.code, 'E_STATE_CONFLICT');
        assert.equal(error.extra.objectiveId, 'OBJ-001');
        return true;
      }
    );
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});
