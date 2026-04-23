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
