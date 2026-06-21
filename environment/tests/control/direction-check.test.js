import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  checkDirection,
  DirectionCheckError,
} from '../../directions/check.js';
import {
  DirectionCliError,
  checkDirectionCommand,
  contradictDirectionCommand,
  killDirectionCommand,
  parkDirectionCommand,
  recordDirectionCommand,
  reviveDirectionCommand,
} from '../../directions/cli.js';
import {
  directionsEventsPath,
  readDirectionEvents,
} from '../../directions/store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const checkSourcePath = path.resolve(__dirname, '..', '..', 'directions', 'check.js');
const cliSourcePath = path.resolve(__dirname, '..', '..', 'directions', 'cli.js');

const STARTED_AT = '2026-06-21T13:00:00.000Z';
const NEXT_AT = '2026-06-21T13:10:00.000Z';
const REVIVE_AT = '2026-06-21T13:20:00.000Z';

const DIRECTION = {
  directionId: 'DIR-HGSOC-CXCL13-CD8',
  summary: 'Test CXCL13-positive CD8 T cells in HGSOC',
  reason: 'Initial reviewed research direction.',
  evidenceRefs: ['claim:C-001'],
};

const DATASET_CONDITION = {
  kind: 'new-dataset',
  detail: 'Independent HGSOC cohort with CXCL13/CD8 annotation',
};

const CONTRADICTION_CONDITION = {
  kind: 'contradicting-evidence',
  detail: 'A later R2 review reverses this contradiction',
};

async function withTempProject(callback) {
  const projectRoot = await mkdtemp(path.join(tmpdir(), 'vre-direction-check-'));
  try {
    return await callback(projectRoot);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
}

async function eventLogText(projectRoot) {
  try {
    return await readFile(directionsEventsPath(projectRoot), 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return '';
    throw error;
  }
}

async function seedTriedDirection(projectRoot, overrides = {}) {
  return recordDirectionCommand(projectRoot, {
    ...DIRECTION,
    ...overrides,
  }, {
    now: () => STARTED_AT,
  });
}

async function seedKilledDirection(projectRoot) {
  await seedTriedDirection(projectRoot);
  return killDirectionCommand(projectRoot, {
    directionId: DIRECTION.directionId,
    reason: 'Kill until the independent cohort exists.',
    doNotRepeatUnless: DATASET_CONDITION,
  }, {
    now: () => NEXT_AT,
  });
}

async function expectNoMutation(projectRoot, callback) {
  const before = await eventLogText(projectRoot);
  const result = await callback();
  const after = await eventLogText(projectRoot);
  assert.equal(after, before);
  assert.equal((await readDirectionEvents(projectRoot)).length, before ? before.trimEnd().split('\n').length : 0);
  return result;
}

test('direction check allows a candidate when no killed or contradicted match exists', async () => {
  await withTempProject(async (projectRoot) => {
    await seedTriedDirection(projectRoot);

    const result = await expectNoMutation(projectRoot, () =>
      checkDirection(projectRoot, {
        summary: 'Test a different HGSOC inflammatory niche',
      })
    );

    assert.equal(result.verdict, 'allow');
    assert.equal(result.written, false);
    assert.equal(result.blockingDirectionId, undefined);
  });
});

test('direction check blocks a killed matching summary with the prior condition', async () => {
  await withTempProject(async (projectRoot) => {
    await seedKilledDirection(projectRoot);

    const result = await expectNoMutation(projectRoot, () =>
      checkDirection(projectRoot, {
        summary: DIRECTION.summary,
      })
    );

    assert.equal(result.verdict, 'block');
    assert.equal(result.blockingDirectionId, DIRECTION.directionId);
    assert.deepEqual(result.doNotRepeatUnless, DATASET_CONDITION);
  });
});

test('direction check blocks a contradicted matching id with evidence refs', async () => {
  await withTempProject(async (projectRoot) => {
    await seedTriedDirection(projectRoot);
    await contradictDirectionCommand(projectRoot, {
      directionId: DIRECTION.directionId,
      reason: 'Contradicted by reviewed R2 evidence.',
      evidenceRef: 'r2:R2-contradiction-001',
      doNotRepeatUnless: CONTRADICTION_CONDITION,
    }, {
      now: () => NEXT_AT,
    });

    const result = await expectNoMutation(projectRoot, () =>
      checkDirection(projectRoot, {
        directionId: DIRECTION.directionId,
      })
    );

    assert.equal(result.verdict, 'block');
    assert.equal(result.blockingDirectionId, DIRECTION.directionId);
    assert.deepEqual(result.doNotRepeatUnless, CONTRADICTION_CONDITION);
    assert.deepEqual(result.evidenceRefs, [
      'claim:C-001',
      'r2:R2-contradiction-001',
    ]);
  });
});

test('direction check returns allow-with-condition when satisfies matches exactly', async () => {
  await withTempProject(async (projectRoot) => {
    await seedKilledDirection(projectRoot);

    const result = await expectNoMutation(projectRoot, () =>
      checkDirection(projectRoot, {
        summary: DIRECTION.summary,
        satisfies: DATASET_CONDITION,
      })
    );

    assert.equal(result.verdict, 'allow-with-condition');
    assert.equal(result.blockingDirectionId, DIRECTION.directionId);
    assert.deepEqual(result.doNotRepeatUnless, DATASET_CONDITION);
    assert.equal(result.written, false);
    assert.equal((await readDirectionEvents(projectRoot)).at(-1).state, 'killed');
  });
});

test('direction check remains blocked when satisfies does not match', async () => {
  await withTempProject(async (projectRoot) => {
    await seedKilledDirection(projectRoot);

    const result = await expectNoMutation(projectRoot, () =>
      checkDirection(projectRoot, {
        summary: DIRECTION.summary,
        satisfies: {
          kind: DATASET_CONDITION.kind,
          detail: 'Different cohort',
        },
      })
    );

    assert.equal(result.verdict, 'block');
  });
});

test('parked and revived directions do not block matching candidates', async () => {
  await withTempProject(async (projectRoot) => {
    await seedTriedDirection(projectRoot);
    await parkDirectionCommand(projectRoot, {
      directionId: DIRECTION.directionId,
      reason: 'Park for clinical review.',
    }, {
      now: () => NEXT_AT,
    });

    const parked = await expectNoMutation(projectRoot, () =>
      checkDirection(projectRoot, { summary: DIRECTION.summary })
    );
    assert.equal(parked.verdict, 'allow');

    await reviveDirectionCommand(projectRoot, {
      directionId: DIRECTION.directionId,
      reason: 'Elisa approved re-entry after the clinical review.',
    }, {
      now: () => REVIVE_AT,
    });

    const revived = await expectNoMutation(projectRoot, () =>
      checkDirection(projectRoot, { directionId: DIRECTION.directionId })
    );
    assert.equal(revived.verdict, 'allow');
  });
});

test('direction check command wrapper returns a command-shaped read-only verdict', async () => {
  await withTempProject(async (projectRoot) => {
    await seedKilledDirection(projectRoot);

    const result = await expectNoMutation(projectRoot, () =>
      checkDirectionCommand(projectRoot, {
        summary: DIRECTION.summary,
        satisfies: DATASET_CONDITION,
      })
    );

    assert.equal(result.command, 'direction check');
    assert.equal(result.verdict, 'allow-with-condition');
    assert.equal(result.ok, true);
    assert.equal(result.written, false);
  });
});

test('direction check fails closed for missing candidate input', async () => {
  await withTempProject(async (projectRoot) => {
    await assert.rejects(
      checkDirection(projectRoot, {}),
      (error) => {
        assert.ok(error instanceof DirectionCheckError);
        assert.equal(error.code, 'E_DIRECTION_CHECK_TARGET_REQUIRED');
        return true;
      },
    );

    await assert.rejects(
      checkDirectionCommand(projectRoot, {}),
      (error) => {
        assert.ok(error instanceof DirectionCliError);
        assert.equal(error.command, 'direction check');
        assert.equal(error.code, 'E_DIRECTION_CHECK_TARGET_REQUIRED');
        return true;
      },
    );

    assert.equal(await eventLogText(projectRoot), '');
  });
});

test('direction check source stays read-only and avoids kernel/provider paths', async () => {
  const checkSource = await readFile(checkSourcePath, 'utf8');
  const cliSource = await readFile(cliSourcePath, 'utf8');

  assert.doesNotMatch(checkSource, /recordDirection|writeFile|appendFile|withLock/u);
  assert.doesNotMatch(checkSource, /from ['"]node:fs(?:\/promises)?['"]/u);
  assert.doesNotMatch(checkSource, /from ['"]node:child_process['"]/u);
  assert.doesNotMatch(checkSource, /capability-handshake|kernel-bridge|provider/u);
  assert.match(checkSource, /readDirectionProjection/u);

  assert.doesNotMatch(cliSource, /from ['"]node:fs(?:\/promises)?['"]/u);
  assert.doesNotMatch(cliSource, /from ['"]node:child_process['"]/u);
  assert.doesNotMatch(cliSource, /capability-handshake|kernel-bridge|provider/u);
});
