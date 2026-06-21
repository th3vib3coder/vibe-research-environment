import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  readDirectionEvents,
  readDirectionProjection,
  recordDirection,
} from '../../directions/store.js';
import {
  DirectionCliError,
  contradictDirectionCommand,
  killDirectionCommand,
  parkDirectionCommand,
  recordDirectionCommand,
  reviveDirectionCommand,
} from '../../directions/cli.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliSourcePath = path.resolve(__dirname, '..', '..', 'directions', 'cli.js');
const storeSourcePath = path.resolve(__dirname, '..', '..', 'directions', 'store.js');

const STARTED_AT = '2026-06-21T12:00:00.000Z';
const NEXT_AT = '2026-06-21T12:10:00.000Z';

const DATASET_CONDITION = {
  kind: 'new-dataset',
  detail: 'Independent HGSOC cohort with CXCL13/CD8 annotation',
};

async function withTempProject(callback) {
  const projectRoot = await mkdtemp(path.join(tmpdir(), 'vre-direction-lifecycle-'));
  try {
    return await callback(projectRoot);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
}

async function seedDirection(projectRoot, overrides = {}) {
  return recordDirectionCommand(projectRoot, {
    directionId: 'DIR-HGSOC-CXCL13-CD8',
    summary: 'Test CXCL13-positive CD8 T cells in HGSOC',
    reason: 'Initial reviewed research direction.',
    evidenceRefs: ['claim:C-001'],
    ...overrides,
  }, {
    now: () => STARTED_AT,
  });
}

async function expectDirectionCliError(promise, expected) {
  await assert.rejects(
    promise,
    (error) => {
      assert.ok(error instanceof DirectionCliError);
      for (const [key, value] of Object.entries(expected)) {
        assert.equal(error[key], value);
      }
      return true;
    },
  );
}

test('direction kill requires a structured doNotRepeatUnless condition', async () => {
  await withTempProject(async (projectRoot) => {
    await seedDirection(projectRoot);

    await expectDirectionCliError(
      killDirectionCommand(projectRoot, {
        directionId: 'DIR-HGSOC-CXCL13-CD8',
        reason: 'Reviewer killed this direction without a no-repeat condition.',
      }),
      {
        command: 'direction kill',
        code: 'E_DIRECTION_DO_NOT_REPEAT_REQUIRED',
      },
    );

    assert.equal((await readDirectionEvents(projectRoot)).length, 1);
  });
});

test('direction kill appends a killed record through the real store', async () => {
  await withTempProject(async (projectRoot) => {
    await seedDirection(projectRoot);

    const result = await killDirectionCommand(projectRoot, {
      directionId: 'DIR-HGSOC-CXCL13-CD8',
      reason: 'Kill until the independent cohort exists.',
      doNotRepeatUnless: DATASET_CONDITION,
    }, {
      now: () => NEXT_AT,
    });
    const projection = await readDirectionProjection(projectRoot);

    assert.equal(result.command, 'direction kill');
    assert.equal(result.record.state, 'killed');
    assert.deepEqual(result.record.doNotRepeatUnless, DATASET_CONDITION);
    assert.equal(projection['DIR-HGSOC-CXCL13-CD8'].state, 'killed');
    assert.equal((await readDirectionEvents(projectRoot)).length, 2);
  });
});

test('direction contradict requires evidence and stores the evidence ref', async () => {
  await withTempProject(async (projectRoot) => {
    await seedDirection(projectRoot);

    await expectDirectionCliError(
      contradictDirectionCommand(projectRoot, {
        directionId: 'DIR-HGSOC-CXCL13-CD8',
        reason: 'Contradicted but no evidence was supplied.',
        doNotRepeatUnless: {
          kind: 'contradicting-evidence',
          detail: 'Independent contradiction review',
        },
      }),
      {
        command: 'direction contradict',
        code: 'E_DIRECTION_EVIDENCE_REQUIRED',
      },
    );

    const result = await contradictDirectionCommand(projectRoot, {
      directionId: 'DIR-HGSOC-CXCL13-CD8',
      reason: 'Contradicted by reviewed R2 evidence.',
      evidenceRef: 'r2:R2-contradiction-001',
      doNotRepeatUnless: {
        kind: 'contradicting-evidence',
        detail: 'A later R2 review reverses this contradiction',
      },
    }, {
      now: () => NEXT_AT,
    });

    assert.equal(result.record.state, 'contradicted');
    assert.deepEqual(result.record.evidenceRefs, [
      'claim:C-001',
      'r2:R2-contradiction-001',
    ]);
  });
});

test('direction park is reversible without a doNotRepeatUnless condition', async () => {
  await withTempProject(async (projectRoot) => {
    await seedDirection(projectRoot);

    const parked = await parkDirectionCommand(projectRoot, {
      directionId: 'DIR-HGSOC-CXCL13-CD8',
      reason: 'Park until Elisa reviews the clinical relevance.',
    }, {
      now: () => NEXT_AT,
    });
    assert.equal(parked.record.state, 'parked');
    assert.equal(parked.record.doNotRepeatUnless, undefined);

    const revived = await reviveDirectionCommand(projectRoot, {
      directionId: 'DIR-HGSOC-CXCL13-CD8',
      reason: 'Elisa approved re-entry after the clinical review.',
    }, {
      now: () => '2026-06-21T12:20:00.000Z',
    });

    assert.equal(revived.record.state, 'revived');
    assert.equal((await readDirectionEvents(projectRoot)).length, 3);
  });
});

test('store rejects revive after killed unless the prior condition is named', async () => {
  await withTempProject(async (projectRoot) => {
    await seedDirection(projectRoot);
    await killDirectionCommand(projectRoot, {
      directionId: 'DIR-HGSOC-CXCL13-CD8',
      reason: 'Kill until the independent cohort exists.',
      doNotRepeatUnless: DATASET_CONDITION,
    }, {
      now: () => NEXT_AT,
    });

    const killedProjection = await readDirectionProjection(projectRoot);
    const killedRecord = killedProjection['DIR-HGSOC-CXCL13-CD8'];

    await assert.rejects(
      recordDirection(projectRoot, {
        ...killedRecord,
        state: 'revived',
        reason: 'Revive because the reviewer changed their mind.',
        doNotRepeatUnless: undefined,
        updatedAt: '2026-06-21T12:20:00.000Z',
        history: [
          ...killedRecord.history,
          {
            state: 'revived',
            reason: 'Revive because the reviewer changed their mind.',
            at: '2026-06-21T12:20:00.000Z',
          },
        ],
      }),
      { code: 'E_DIRECTION_REVIVE_CONDITION_UNSATISFIED' },
    );

    assert.equal((await readDirectionEvents(projectRoot)).length, 2);
  });
});

test('direction revive names the prior condition and appends a revived record', async () => {
  await withTempProject(async (projectRoot) => {
    await seedDirection(projectRoot);
    await killDirectionCommand(projectRoot, {
      directionId: 'DIR-HGSOC-CXCL13-CD8',
      reason: 'Kill until the independent cohort exists.',
      doNotRepeatUnless: DATASET_CONDITION,
    }, {
      now: () => NEXT_AT,
    });

    await expectDirectionCliError(
      reviveDirectionCommand(projectRoot, {
        directionId: 'DIR-HGSOC-CXCL13-CD8',
        reason: 'Revive without naming the condition.',
      }),
      {
        command: 'direction revive',
        code: 'E_DIRECTION_REVIVE_CONDITION_UNSATISFIED',
      },
    );

    const revived = await reviveDirectionCommand(projectRoot, {
      directionId: 'DIR-HGSOC-CXCL13-CD8',
      reason: [
        'Revive because condition satisfied:',
        DATASET_CONDITION.kind,
        DATASET_CONDITION.detail,
      ].join(' '),
    }, {
      now: () => '2026-06-21T12:20:00.000Z',
    });

    assert.equal(revived.record.state, 'revived');
    assert.equal(revived.extra?.previousState, 'killed');
    assert.equal((await readDirectionEvents(projectRoot)).length, 3);
  });
});

test('invalid lifecycle transitions remain store-origin errors', async () => {
  await withTempProject(async (projectRoot) => {
    await seedDirection(projectRoot);
    await killDirectionCommand(projectRoot, {
      directionId: 'DIR-HGSOC-CXCL13-CD8',
      reason: 'Kill until the independent cohort exists.',
      doNotRepeatUnless: DATASET_CONDITION,
    }, {
      now: () => NEXT_AT,
    });

    await assert.rejects(
      parkDirectionCommand(projectRoot, {
        directionId: 'DIR-HGSOC-CXCL13-CD8',
        reason: 'Illegal park from killed without revive.',
      }),
      (error) => {
        assert.ok(error instanceof DirectionCliError);
        assert.equal(error.code, 'E_DIRECTION_TRANSITION_INVALID');
        assert.equal(error.extra.source, 'direction-store');
        return true;
      },
    );
  });
});

test('direction lifecycle helpers fail closed for unknown ids', async () => {
  await withTempProject(async (projectRoot) => {
    await expectDirectionCliError(
      reviveDirectionCommand(projectRoot, {
        directionId: 'DIR-ABSENT',
        reason: 'Cannot revive an unknown direction.',
      }),
      {
        command: 'direction revive',
        code: 'E_DIRECTION_NOT_FOUND',
      },
    );

    assert.equal((await readDirectionEvents(projectRoot)).length, 0);
  });
});

test('direction lifecycle path does not import raw fs, child process, or kernel paths', async () => {
  const cliSource = await readFile(cliSourcePath, 'utf8');
  const storeSource = await readFile(storeSourcePath, 'utf8');

  assert.doesNotMatch(cliSource, /from ['"]node:fs(?:\/promises)?['"]/u);
  assert.doesNotMatch(cliSource, /from ['"]node:child_process['"]/u);
  assert.doesNotMatch(cliSource, /capability-handshake|kernel-bridge/u);
  assert.match(cliSource, /from ['"]\.\/store\.js['"]/u);

  assert.equal((storeSource.match(/from ['"]node:fs\/promises['"]/gu) ?? []).length, 1);
  assert.doesNotMatch(storeSource, /from ['"]node:child_process['"]/u);
  assert.doesNotMatch(storeSource, /capability-handshake|kernel-bridge/u);
});
