import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  ExportSnapshotAlreadyExistsError,
  resolveExportSnapshotPath,
  writeExportSnapshot,
} from '../../lib/export-snapshot.js';

test('F-02: snapshot immutability rejects same-id rerun', async () => {
  const projectPath = await createTempProject();

  try {
    await writeExportSnapshot(projectPath, snapshotPayload('initial'), {
      createdAt: '2026-04-17T10:00:00Z',
    });

    await assert.rejects(
      () => writeExportSnapshot(projectPath, snapshotPayload('second'), {
        createdAt: '2026-04-17T10:05:00Z',
      }),
      ExportSnapshotAlreadyExistsError,
    );

    const persisted = JSON.parse(await readFile(
      resolveExportSnapshotPath(projectPath, 'WEXP-PHASE55-IMMUTABLE'),
      'utf8',
    ));
    assert.deepEqual(persisted.warnings, ['initial']);
    assert.equal(persisted.createdAt, '2026-04-17T10:00:00Z');
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('F-02: concurrent snapshot writes leave exactly one persisted snapshot', async () => {
  const projectPath = await createTempProject();

  try {
    const results = await Promise.allSettled([
      writeExportSnapshot(projectPath, snapshotPayload('left'), {
        createdAt: '2026-04-17T10:10:00Z',
      }),
      writeExportSnapshot(projectPath, snapshotPayload('right'), {
        createdAt: '2026-04-17T10:11:00Z',
      }),
    ]);

    assert.equal(results.filter((entry) => entry.status === 'fulfilled').length, 1);
    assert.equal(results.filter((entry) => entry.status === 'rejected').length, 1);
    assert.ok(
      results.some((entry) => entry.status === 'rejected' && entry.reason instanceof ExportSnapshotAlreadyExistsError),
    );

    const persisted = JSON.parse(await readFile(
      resolveExportSnapshotPath(projectPath, 'WEXP-PHASE55-IMMUTABLE'),
      'utf8',
    ));
    assert.equal(persisted.claims.length, 1);
    assert.match(persisted.warnings[0], /left|right/u);
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

function snapshotPayload(warning) {
  return {
    snapshotId: 'WEXP-PHASE55-IMMUTABLE',
    claimIds: ['C-551'],
    claims: [{
      claimId: 'C-551',
      statusAtExport: 'PROMOTED',
      confidenceAtExport: 0.9,
      eligible: true,
      reasons: [],
      governanceProfileAtCreation: 'strict',
      hasFreshSchemaValidation: true,
    }],
    citations: [],
    capabilities: {
      governanceProfileAtCreationAvailable: true,
      schemaValidationSurfaceAvailable: true,
    },
    warnings: [warning],
  };
}

async function createTempProject() {
  return mkdtemp(path.join(os.tmpdir(), 'vre-phase55-snapshot-'));
}
