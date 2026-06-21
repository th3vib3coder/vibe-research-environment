import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import {
  cleanupCliFixtureProject,
  createCliFixtureProject,
  runVre
} from '../../cli/_fixture.js';
import {
  AUTONOMY_TIER_ENV,
  listAutonomousEntrypoints
} from '../../../autonomous/gate.js';
import { getOperatorStatus } from '../../../control/query.js';
import { getOrchestratorStatus } from '../../../orchestrator/query.js';

function collectAutonomousStateRefs(value, refs = []) {
  if (typeof value === 'string') {
    if (value.includes('.vibe-science-environment/autonomous')) {
      refs.push(value);
    }
    return refs;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectAutonomousStateRefs(item, refs);
    return refs;
  }
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (key.includes('autonomous')) refs.push(key);
      collectAutonomousStateRefs(item, refs);
    }
  }
  return refs;
}

async function writeAutonomousResidue(projectRoot) {
  const residueDir = path.join(projectRoot, '.vibe-science-environment', 'autonomous', 'l0');
  await mkdir(residueDir, { recursive: true });
  await writeFile(
    path.join(residueDir, 'halt-request.json'),
    `${JSON.stringify({
      schemaVersion: 'phase13.autonomous-halt-request.v1',
      operator: 'Carmine',
      reason: 'fixture residue for edition-isolation smoke',
      runtimeOpened: false
    }, null, 2)}\n`,
    'utf8'
  );
}

test('base readers surface zero autonomous records when autonomous residue exists and tier is off', async () => {
  const projectRoot = await createCliFixtureProject('vre-phase13-isolation-smoke-');
  try {
    await writeAutonomousResidue(projectRoot);

    const operatorStatus = await getOperatorStatus(projectRoot);
    const orchestratorStatus = await getOrchestratorStatus(projectRoot);

    assert.deepEqual(collectAutonomousStateRefs(operatorStatus), []);
    assert.deepEqual(collectAutonomousStateRefs(orchestratorStatus), []);

    const capabilities = await runVre(projectRoot, ['capabilities', '--json'], {
      env: { [AUTONOMY_TIER_ENV]: '' }
    });
    assert.equal(capabilities.code, 0, `stderr=${capabilities.stderr}`);
    const capabilitiesPayload = JSON.parse(capabilities.stdout);
    assert.equal(
      capabilitiesPayload.vre.executableCommands.some((command) => command.startsWith('autonomous')),
      false
    );

    for (const entrypoint of await listAutonomousEntrypoints()) {
      const result = await runVre(projectRoot, [...entrypoint.command.split(' '), '--json'], {
        env: { [AUTONOMY_TIER_ENV]: '' }
      });
      assert.equal(result.code, 2, `${entrypoint.command} stdout=${result.stdout} stderr=${result.stderr}`);
      const payload = JSON.parse(result.stdout);
      assert.equal(payload.code, 'E_AUTONOMY_DISABLED');
      assert.equal(payload.runtimeOpened, false);
    }
  } finally {
    await cleanupCliFixtureProject(projectRoot);
  }
});
