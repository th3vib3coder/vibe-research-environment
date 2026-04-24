import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { activateObjective } from '../../objectives/store.js';
import {
  cleanupCliFixtureProject,
  createCliFixtureProject,
  repoRoot,
  runVre
} from './_fixture.js';

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
    wakePolicy: {
      ...objectiveRecord.wakePolicy,
      ...(overrides.wakePolicy ?? {})
    },
    lastUpdatedAt: '2026-04-23T21:45:00Z'
  };
  await activateObjective(projectRoot, merged, {
    sessionId: 'sess-scheduler-cli'
  });
  return merged;
}

const WINDOWS_ONLY_SKIP_MESSAGE = 'deterministic unsupported-path coverage runs only on non-Windows CI';

test('scheduler status returns structured unsupported JSON on non-Windows hosts', { skip: process.platform === 'win32' ? WINDOWS_ONLY_SKIP_MESSAGE : false }, async () => {
  const projectRoot = await createCliFixtureProject('vre-scheduler-status-cli-');
  try {
    await seedActiveObjective(projectRoot);
    const result = await runVre(projectRoot, ['scheduler', 'status', '--objective', 'OBJ-001']);
    assert.equal(result.code, 0, `stderr=${result.stderr}`);
    assert.equal(result.stderr, '');

    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.command, 'scheduler status');
    assert.equal(payload.supportMode, 'unsupported');
    assert.equal(payload.code, 'E_PLATFORM_SLEEP_MODE_UNSUPPORTED');
    assert.equal(payload.objectiveId, 'OBJ-001');
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('scheduler install fails closed with structured PHASE9_USAGE when --objective is omitted', async () => {
  const projectRoot = await createCliFixtureProject('vre-scheduler-install-usage-');
  try {
    const result = await runVre(projectRoot, ['scheduler', 'install']);
    assert.equal(result.code, 3, `stderr=${result.stderr}`);
    assert.equal(result.stderr, '');

    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, false);
    assert.equal(payload.command, 'scheduler install');
    assert.equal(payload.code, 'PHASE9_USAGE');
    assert.match(payload.message, /requires --objective/u);
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('scheduler install fails closed with named unsupported code on non-Windows hosts', { skip: process.platform === 'win32' ? WINDOWS_ONLY_SKIP_MESSAGE : false }, async () => {
  const projectRoot = await createCliFixtureProject('vre-scheduler-install-cli-');
  try {
    await seedActiveObjective(projectRoot);
    const result = await runVre(projectRoot, ['scheduler', 'install', '--objective', 'OBJ-001']);
    assert.equal(result.code, 1, `stderr=${result.stderr}`);
    assert.equal(result.stderr, '');

    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, false);
    assert.equal(payload.command, 'scheduler install');
    assert.equal(payload.code, 'E_PLATFORM_SLEEP_MODE_UNSUPPORTED');
    assert.equal(payload.supportMode, 'unsupported');
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('scheduler doctor fails closed with named unsupported code on non-Windows hosts', { skip: process.platform === 'win32' ? WINDOWS_ONLY_SKIP_MESSAGE : false }, async () => {
  const projectRoot = await createCliFixtureProject('vre-scheduler-doctor-cli-');
  try {
    await seedActiveObjective(projectRoot);
    const result = await runVre(projectRoot, ['scheduler', 'doctor', '--objective', 'OBJ-001']);
    assert.equal(result.code, 1, `stderr=${result.stderr}`);
    assert.equal(result.stderr, '');

    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, false);
    assert.equal(payload.command, 'scheduler doctor');
    assert.equal(payload.code, 'E_PLATFORM_SLEEP_MODE_UNSUPPORTED');
    assert.equal(payload.supportMode, 'unsupported');
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('objective doctor delegates to scheduler doctor and fails on unsupported scheduler hosts', { skip: process.platform === 'win32' ? WINDOWS_ONLY_SKIP_MESSAGE : false }, async () => {
  const projectRoot = await createCliFixtureProject('vre-objective-doctor-cli-');
  try {
    await seedActiveObjective(projectRoot, {
      wakePolicy: {
        wakeOwner: 'windows-task-scheduler'
      }
    });
    const result = await runVre(projectRoot, ['objective', 'doctor', '--objective', 'OBJ-001']);
    assert.equal(result.code, 1, `stderr=${result.stderr}`);
    assert.equal(result.stderr, '');

    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, false);
    assert.equal(payload.command, 'objective doctor');
    assert.equal(payload.code, 'E_PLATFORM_SLEEP_MODE_UNSUPPORTED');
    assert.equal(payload.supportMode, 'unsupported');
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

// Round 68 CLI symmetry: close the --objective-missing and positional-argument
// claim-without-pin gaps. Round 67 left `scheduler install fails closed with
// structured PHASE9_USAGE when --objective is omitted` as the ONLY CLI usage
// regression; the symmetric paths for status/doctor/remove and the positional
// arguments check (bin/vre:978, 1004, 1030, 1056) were not pinned. Round 68
// adds one regression per call-site so the outer try/catch contract + the
// positional-args fast-path guard cannot silently regress per command.

test('scheduler status fails closed with structured PHASE9_USAGE when --objective is omitted', async () => {
  const projectRoot = await createCliFixtureProject('vre-scheduler-status-usage-');
  try {
    const result = await runVre(projectRoot, ['scheduler', 'status']);
    assert.equal(result.code, 3, `stderr=${result.stderr}`);
    assert.equal(result.stderr, '');

    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, false);
    assert.equal(payload.command, 'scheduler status');
    assert.equal(payload.code, 'PHASE9_USAGE');
    assert.match(payload.message, /requires --objective/u);
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('scheduler doctor fails closed with structured PHASE9_USAGE when --objective is omitted', async () => {
  const projectRoot = await createCliFixtureProject('vre-scheduler-doctor-usage-');
  try {
    const result = await runVre(projectRoot, ['scheduler', 'doctor']);
    assert.equal(result.code, 3, `stderr=${result.stderr}`);
    assert.equal(result.stderr, '');

    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, false);
    assert.equal(payload.command, 'scheduler doctor');
    assert.equal(payload.code, 'PHASE9_USAGE');
    assert.match(payload.message, /requires --objective/u);
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('scheduler remove fails closed with structured PHASE9_USAGE when --objective is omitted', async () => {
  const projectRoot = await createCliFixtureProject('vre-scheduler-remove-usage-');
  try {
    const result = await runVre(projectRoot, ['scheduler', 'remove']);
    assert.equal(result.code, 3, `stderr=${result.stderr}`);
    assert.equal(result.stderr, '');

    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, false);
    assert.equal(payload.command, 'scheduler remove');
    assert.equal(payload.code, 'PHASE9_USAGE');
    assert.match(payload.message, /requires --objective/u);
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('scheduler install fails closed with structured PHASE9_USAGE when unexpected positional arguments are supplied', async () => {
  const projectRoot = await createCliFixtureProject('vre-scheduler-install-positional-');
  try {
    const result = await runVre(projectRoot, ['scheduler', 'install', 'unexpected-positional-arg', '--objective', 'OBJ-001']);
    assert.equal(result.code, 3, `stderr=${result.stderr}`);
    assert.equal(result.stderr, '');

    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, false);
    assert.equal(payload.command, 'scheduler install');
    assert.equal(payload.code, 'PHASE9_USAGE');
    assert.match(payload.message, /does not accept positional arguments/u);
    assert.match(payload.message, /unexpected-positional-arg/u);
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('scheduler status fails closed with structured PHASE9_USAGE when unexpected positional arguments are supplied', async () => {
  const projectRoot = await createCliFixtureProject('vre-scheduler-status-positional-');
  try {
    const result = await runVre(projectRoot, ['scheduler', 'status', 'unexpected-positional-arg', '--objective', 'OBJ-001']);
    assert.equal(result.code, 3, `stderr=${result.stderr}`);
    assert.equal(result.stderr, '');

    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, false);
    assert.equal(payload.command, 'scheduler status');
    assert.equal(payload.code, 'PHASE9_USAGE');
    assert.match(payload.message, /does not accept positional arguments/u);
    assert.match(payload.message, /unexpected-positional-arg/u);
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('scheduler doctor fails closed with structured PHASE9_USAGE when unexpected positional arguments are supplied', async () => {
  const projectRoot = await createCliFixtureProject('vre-scheduler-doctor-positional-');
  try {
    const result = await runVre(projectRoot, ['scheduler', 'doctor', 'unexpected-positional-arg', '--objective', 'OBJ-001']);
    assert.equal(result.code, 3, `stderr=${result.stderr}`);
    assert.equal(result.stderr, '');

    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, false);
    assert.equal(payload.command, 'scheduler doctor');
    assert.equal(payload.code, 'PHASE9_USAGE');
    assert.match(payload.message, /does not accept positional arguments/u);
    assert.match(payload.message, /unexpected-positional-arg/u);
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('scheduler remove fails closed with structured PHASE9_USAGE when unexpected positional arguments are supplied', async () => {
  const projectRoot = await createCliFixtureProject('vre-scheduler-remove-positional-');
  try {
    const result = await runVre(projectRoot, ['scheduler', 'remove', 'unexpected-positional-arg', '--objective', 'OBJ-001']);
    assert.equal(result.code, 3, `stderr=${result.stderr}`);
    assert.equal(result.stderr, '');

    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, false);
    assert.equal(payload.command, 'scheduler remove');
    assert.equal(payload.code, 'PHASE9_USAGE');
    assert.match(payload.message, /does not accept positional arguments/u);
    assert.match(payload.message, /unexpected-positional-arg/u);
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});
