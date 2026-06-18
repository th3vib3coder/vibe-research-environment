import assert from 'node:assert/strict';
import test from 'node:test';

import {
  cleanupCliFixtureProject,
  createCliFixtureProject,
  runVre
} from '../../cli/_fixture.js';
import {
  AUTONOMY_TIER_ENV,
  isAutonomyEnabled,
  listAutonomousEntrypoints,
  readAutonomyTier
} from '../../../autonomous/gate.js';
import { getTaskRegistry } from '../../../orchestrator/task-registry.js';

test('Phase 13 autonomy tier is disabled by default', () => {
  assert.equal(readAutonomyTier({}), 'base');
  assert.equal(isAutonomyEnabled({}), false);
});

test('every reviewed autonomous entrypoint fails closed while the tier is off', async () => {
  const projectRoot = await createCliFixtureProject('vre-phase13-autonomy-off-');
  try {
    for (const entrypoint of await listAutonomousEntrypoints()) {
      const argv = [
        ...entrypoint.command.split(' '),
        '--json'
      ];
      const result = await runVre(projectRoot, argv, {
        env: { [AUTONOMY_TIER_ENV]: '' }
      });
      assert.equal(result.code, 2, `${entrypoint.command} stdout=${result.stdout} stderr=${result.stderr}`);
      assert.equal(result.stderr, '');

      const payload = JSON.parse(result.stdout);
      assert.equal(payload.ok, false);
      assert.equal(payload.code, 'E_AUTONOMY_DISABLED');
      assert.equal(payload.phase13, true);
      assert.equal(payload.runtimeOpened, false);
      assert.equal(payload.command, entrypoint.command);
      assert.equal(payload.autonomyTier, 'base');
    }
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});

test('capabilities and task registry expose no autonomous runtime while tier is off', async () => {
  const projectRoot = await createCliFixtureProject('vre-phase13-capabilities-off-');
  try {
    const result = await runVre(projectRoot, ['capabilities', '--json'], {
      env: { [AUTONOMY_TIER_ENV]: '' }
    });
    assert.equal(result.code, 0, `stderr=${result.stderr}`);
    const payload = JSON.parse(result.stdout);
    assert.equal(
      payload.vre.executableCommands.some((command) => command.startsWith('autonomous')),
      false
    );
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }

  const registry = await getTaskRegistry();
  assert.deepEqual(
    [...registry.keys()].filter((taskKind) => taskKind.includes('autonomous')),
    []
  );
});
