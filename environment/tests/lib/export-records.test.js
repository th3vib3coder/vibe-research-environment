import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  appendExportAlert,
  appendExportRecord,
  buildExportAlertReplayKey,
  ExportRecordsValidationError,
} from '../../lib/export-records.js';

test('export records helper appends validated export records to the machine-owned log', async () => {
  const projectPath = await createTempProject();

  try {
    await appendExportRecord(projectPath, {
      claimId: 'C-001',
      snapshotId: 'WEXP-2026-04-02-001',
      exportedToFlow: 'writing',
      governanceProfileAtExport: 'default',
      profileSafetyMode: 'full',
      artifactPath: '.vibe-science-environment/writing/exports/seeds/WEXP-2026-04-02-001/C-001.md',
    }, {
      exportedAt: '2026-04-02T13:15:00Z',
    });

    await appendExportRecord(projectPath, {
      claimId: 'C-002',
      snapshotId: 'WEXP-2026-04-02-001',
      exportedToFlow: 'writing',
      governanceProfileAtExport: 'strict',
      profileSafetyMode: 'full',
      artifactPath: '.vibe-science-environment/writing/exports/seeds/WEXP-2026-04-02-001/C-002.md',
      notes: null,
    }, {
      exportedAt: '2026-04-02T13:16:00Z',
    });

    const logPath = path.join(
      projectPath,
      '.vibe-science-environment',
      'writing',
      'exports',
      'export-log.jsonl',
    );
    const lines = (await readFile(logPath, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));

    assert.equal(lines.length, 2);
    assert.equal(lines[0].claimId, 'C-001');
    assert.equal(lines[1].claimId, 'C-002');
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('export records helper appends alerts and builds a stable replay key', async () => {
  const projectPath = await createTempProject();

  try {
    const alert = await appendExportAlert(projectPath, {
      alertId: 'WALERT-2026-04-02-001',
      claimId: 'C-001',
      snapshotId: 'WEXP-2026-04-02-001',
      kind: 'citation_invalidated',
      severity: 'warning',
      message: 'Citation in C-001 was invalidated after export.',
      citationId: 'CIT-001',
      snapshotStatus: 'PROMOTED',
      currentStatus: 'PROMOTED',
      snapshotConfidence: 0.91,
      currentConfidence: 0.91,
    }, {
      detectedAt: '2026-04-02T13:20:00Z',
    });

    const replayKey = buildExportAlertReplayKey(alert);
    assert.equal(
      replayKey,
      'WEXP-2026-04-02-001::C-001::citation_invalidated::CIT-001',
    );
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
});

test('export records helper rejects invalid record payloads', async () => {
  await assert.rejects(
    () => appendExportRecord('.', {
      claimId: 'CLAIM-001',
      snapshotId: 'WEXP-2026-04-02-001',
      exportedToFlow: 'writing',
      governanceProfileAtExport: 'strict',
      profileSafetyMode: 'full',
      artifactPath: '',
    }),
    ExportRecordsValidationError,
  );
});

async function createTempProject() {
  return mkdtemp(path.join(os.tmpdir(), 'vre-export-records-test-'));
}
