import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { readDirectionProjection } from '../../directions/store.js';
import {
  DirectionCliError,
  listDirectionsCommand,
  recordDirectionCommand,
} from '../../directions/cli.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliSourcePath = path.resolve(__dirname, '..', '..', 'directions', 'cli.js');

async function withTempProject(callback) {
  const projectRoot = await mkdtemp(path.join(tmpdir(), 'vre-direction-cli-'));
  try {
    return await callback(projectRoot);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
}

test('direction CLI record creates a tried direction through the real store', async () => {
  await withTempProject(async (projectRoot) => {
    const result = await recordDirectionCommand(projectRoot, {
      summary: 'Test CXCL13-positive CD8 T cells in HGSOC',
      reason: 'Initial reviewed research direction.',
      evidenceRefs: ['claim:C-001'],
    }, {
      now: () => '2026-06-21T12:00:00.000Z',
    });

    const projection = await readDirectionProjection(projectRoot);

    assert.equal(result.ok, true);
    assert.equal(result.command, 'direction record');
    assert.equal(result.record.state, 'tried');
    assert.equal(result.record.directionId, 'DIR-TEST-CXCL13-POSITIVE-CD8-T-CELLS-IN-HGSOC');
    assert.deepEqual(result.projection, projection);
    assert.equal(
      projection['DIR-TEST-CXCL13-POSITIVE-CD8-T-CELLS-IN-HGSOC'].summary,
      'Test CXCL13-positive CD8 T cells in HGSOC',
    );
  });
});

test('direction CLI list returns the replay-derived store projection', async () => {
  await withTempProject(async (projectRoot) => {
    await recordDirectionCommand(projectRoot, {
      directionId: 'DIR-ENDOMETRIOSIS-INFLAMMATION',
      summary: 'Check inflammatory bridge between endometriosis and ovarian cancer',
      reason: 'Reviewed hypothesis backlog item.',
      evidenceRefs: ['wiki:domain/endometriosis'],
    }, {
      now: () => '2026-06-21T12:10:00.000Z',
    });

    const listed = await listDirectionsCommand(projectRoot);
    const projection = await readDirectionProjection(projectRoot);

    assert.equal(listed.ok, true);
    assert.equal(listed.command, 'direction list');
    assert.deepEqual(listed.projection, projection);
    assert.deepEqual(listed.directions.map((record) => record.directionId), [
      'DIR-ENDOMETRIOSIS-INFLAMMATION',
    ]);
  });
});

test('direction CLI rejects missing summaries with a typed usage error', async () => {
  await withTempProject(async (projectRoot) => {
    await assert.rejects(
      recordDirectionCommand(projectRoot, { summary: '   ' }),
      (error) => {
        assert.ok(error instanceof DirectionCliError);
        assert.equal(error.command, 'direction record');
        assert.equal(error.code, 'E_DIRECTION_SUMMARY_REQUIRED');
        assert.equal(error.exitCode, 3);
        return true;
      },
    );
  });
});

test('direction CLI leaves explicit unsafe direction ids to the store guard', async () => {
  await withTempProject(async (projectRoot) => {
    await assert.rejects(
      recordDirectionCommand(projectRoot, {
        directionId: '../escape',
        summary: 'Unsafe explicit id should fail in the store',
        reason: 'Regression for store-delegated id safety.',
      }),
      (error) => {
        assert.ok(error instanceof DirectionCliError);
        assert.equal(error.code, 'E_DIRECTION_ID_UNSAFE');
        assert.equal(error.extra.source, 'direction-store');
        assert.equal(error.extra.storeErrorName, 'DirectionStoreError');
        return true;
      },
    );
  });
});

test('direction CLI module does not import raw fs, child process, or kernel paths', async () => {
  const source = await readFile(cliSourcePath, 'utf8');

  assert.doesNotMatch(source, /from ['"]node:fs(?:\/promises)?['"]/u);
  assert.doesNotMatch(source, /from ['"]node:child_process['"]/u);
  assert.doesNotMatch(source, /capability-handshake|kernel-bridge/u);
  assert.match(source, /from ['"]\.\/store\.js['"]/u);
});
