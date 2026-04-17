import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildExportSnapshot,
  ExportSnapshotAlreadyExistsError,
  ExportSnapshotValidationError,
  resolveExportSnapshotPath,
  writeExportSnapshot,
} from '../../lib/export-snapshot.js';

test('export snapshot helper writes a schema-valid snapshot to the machine-owned path', async () => {
  const projectPath = await createTempProject();

  try {
    const snapshot = await writeExportSnapshot(projectPath, {
      snapshotId: 'WEXP-2026-04-02-001',
      claimIds: ['C-001'],
      claims: [
        {
          claimId: 'C-001',
          statusAtExport: 'PROMOTED',
          confidenceAtExport: 0.91,
          eligible: true,
          reasons: [],
          governanceProfileAtCreation: 'strict',
          hasFreshSchemaValidation: true,
        },
      ],
      citations: [
        {
          claimId: 'C-001',
          citationId: 'CIT-001',
          verificationStatusAtExport: 'VERIFIED',
        },
      ],
      capabilities: {
        governanceProfileAtCreationAvailable: true,
        schemaValidationSurfaceAvailable: true,
      },
      warnings: [],
    }, {
      createdAt: '2026-04-02T13:00:00Z',
    });

    const targetPath = resolveExportSnapshotPath(projectPath, snapshot.snapshotId);
    const persisted = JSON.parse(await readFile(targetPath, 'utf8'));
    assert.deepEqual(persisted, snapshot);
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('export snapshot helper rejects the same snapshot file on rerun', async () => {
  const projectPath = await createTempProject();

  try {
    const basePayload = {
      snapshotId: 'WEXP-2026-04-02-002',
      claims: [
        {
          claimId: 'C-001',
          statusAtExport: 'PROMOTED',
          confidenceAtExport: 0.75,
          eligible: true,
          reasons: [],
          governanceProfileAtCreation: 'strict',
          hasFreshSchemaValidation: true,
        },
      ],
      citations: [],
      capabilities: {
        governanceProfileAtCreationAvailable: true,
        schemaValidationSurfaceAvailable: true,
      },
      warnings: ['initial snapshot'],
    };

    await writeExportSnapshot(projectPath, basePayload, {
      createdAt: '2026-04-02T13:00:00Z',
    });
    await assert.rejects(
      () => writeExportSnapshot(projectPath, {
        ...basePayload,
        claims: [
          {
            ...basePayload.claims[0],
            confidenceAtExport: 0.82,
          },
        ],
        warnings: ['updated snapshot'],
      }, {
        createdAt: '2026-04-02T13:05:00Z',
      }),
      ExportSnapshotAlreadyExistsError,
    );

    const persisted = JSON.parse(await readFile(
      resolveExportSnapshotPath(projectPath, 'WEXP-2026-04-02-002'),
      'utf8',
    ));

    assert.equal(persisted.claims[0].confidenceAtExport, 0.75);
    assert.deepEqual(persisted.warnings, ['initial snapshot']);
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('export snapshot helper derives claimIds from claims and rejects invalid snapshot ids', async () => {
  const snapshot = await buildExportSnapshot({
    snapshotId: 'WEXP-2026-04-02-003',
    claims: [
      {
        claimId: 'C-014',
        statusAtExport: 'PROMOTED',
        confidenceAtExport: null,
        eligible: false,
        reasons: ['missing_governance_profile_metadata'],
        governanceProfileAtCreation: 'unknown',
        hasFreshSchemaValidation: null,
      },
    ],
    citations: [],
    capabilities: {
      governanceProfileAtCreationAvailable: false,
      schemaValidationSurfaceAvailable: false,
    },
    warnings: ['compatibility mode'],
  }, {
    createdAt: '2026-04-02T13:10:00Z',
  });

  assert.deepEqual(snapshot.claimIds, ['C-014']);

  await assert.rejects(
    () => buildExportSnapshot({
      snapshotId: 'snapshot-003',
      claimIds: ['C-014'],
      claims: [],
      citations: [],
      capabilities: {
        governanceProfileAtCreationAvailable: true,
        schemaValidationSurfaceAvailable: true,
      },
      warnings: [],
    }),
    ExportSnapshotValidationError,
  );
});

async function createTempProject() {
  return mkdtemp(path.join(os.tmpdir(), 'vre-export-snapshot-test-'));
}
