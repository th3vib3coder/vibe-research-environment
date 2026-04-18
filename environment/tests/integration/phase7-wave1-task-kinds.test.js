import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import {
  getTaskEntry,
  getTaskRegistry,
  validateTaskInput,
  resetTaskRegistryCache,
} from '../../orchestrator/task-registry.js';
import { getTaskAdapter, listAdapterTaskKinds } from '../../orchestrator/task-adapters.js';
import { finalizeExportDeliverable } from '../../flows/writing.js';

const NEW_EXECUTION_KINDS = [
  'experiment-flow-register',
  'writing-export-finalize',
  'results-bundle-discover',
];

test('Phase 7 Wave 1 — all three new execution kinds appear in both registry and adapter map', async () => {
  await resetTaskRegistryCache();
  const registry = await getTaskRegistry();
  const registryKinds = [...registry.keys()];
  const adapterKinds = listAdapterTaskKinds();
  for (const kind of NEW_EXECUTION_KINDS) {
    assert.ok(registryKinds.includes(kind), `registry missing ${kind}`);
    assert.ok(adapterKinds.includes(kind), `adapter map missing ${kind}`);
    assert.equal(typeof getTaskAdapter(kind), 'function', `adapter for ${kind} is not a function`);
  }
});

test('Phase 7 Wave 1 — each registry entry has correct lane and helper binding', async () => {
  const expectations = {
    'experiment-flow-register': {
      lane: 'execution',
      helperModule: 'environment/flows/experiment.js',
      helperExport: 'registerExperiment',
    },
    'writing-export-finalize': {
      lane: 'execution',
      helperModule: 'environment/flows/writing.js',
      helperExport: 'finalizeExportDeliverable',
    },
    'results-bundle-discover': {
      lane: 'execution',
      helperModule: 'environment/flows/results-discovery.js',
      helperExport: 'discoverBundlesByExperiment',
    },
  };
  for (const [kind, expected] of Object.entries(expectations)) {
    const entry = await getTaskEntry(kind);
    assert.ok(entry, `task entry missing: ${kind}`);
    assert.equal(entry.lane, expected.lane, `${kind} lane mismatch`);
    assert.equal(entry.helperModule, expected.helperModule, `${kind} helperModule mismatch`);
    assert.equal(entry.helperExport, expected.helperExport, `${kind} helperExport mismatch`);
  }
});

test('Phase 7 Wave 1 — validateTaskInput accepts valid input and rejects invalid input per schema', async () => {
  // experiment-flow-register: title + objective required
  await validateTaskInput('experiment-flow-register', {
    title: 'Cell-QC tuning',
    objective: 'Tune cell QC thresholds on pbmc3k',
  });
  await assert.rejects(
    () => validateTaskInput('experiment-flow-register', { title: 'no objective' }),
    /objective|required/iu,
  );

  // writing-export-finalize: exportSnapshotId + deliverableType required, type enum-bounded
  await validateTaskInput('writing-export-finalize', {
    exportSnapshotId: 'WEXP-2026-04-18-abc',
    deliverableType: 'draft',
  });
  await assert.rejects(
    () => validateTaskInput('writing-export-finalize', {
      exportSnapshotId: 'WEXP-ok',
      deliverableType: 'poster',
    }),
    /enum|deliverableType/iu,
  );

  // results-bundle-discover: all optional; additionalProperties:false
  await validateTaskInput('results-bundle-discover', {});
  await validateTaskInput('results-bundle-discover', { experimentId: 'EXP-001' });
  await assert.rejects(
    () => validateTaskInput('results-bundle-discover', { bogus: 'value' }),
    /additional|bogus/iu,
  );
});

test('Phase 7 Wave 1 — finalizeExportDeliverable writes markdown once and fails on re-invocation', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vre-phase7-wave1-'));
  try {
    const snapshotId = 'WEXP-2026-04-18-testdeliver';
    const snapshotsDir = path.join(root, '.vibe-science-environment', 'writing', 'exports', 'snapshots');
    await mkdir(snapshotsDir, { recursive: true });
    const snapshot = {
      schemaVersion: 'vibe-env.export-snapshot.v1',
      snapshotId,
      createdAt: '2026-04-18T12:00:00.000Z',
      claimIds: ['C-001'],
      claims: [{
        claimId: 'C-001',
        statusAtExport: 'PROMOTED',
        confidenceAtExport: 0.9,
        eligible: true,
        reasons: ['EXPORT_ELIGIBLE'],
        governanceProfileAtCreation: 'default',
        hasFreshSchemaValidation: true,
      }],
      citations: [],
      capabilities: {
        governanceProfileAtCreationAvailable: true,
        schemaValidationSurfaceAvailable: true,
      },
      warnings: [],
    };
    await writeFile(path.join(snapshotsDir, `${snapshotId}.json`), JSON.stringify(snapshot));

    const first = await finalizeExportDeliverable(root, {
      exportSnapshotId: snapshotId,
      deliverableType: 'draft',
    });
    assert.equal(first.snapshotId, snapshotId);
    assert.equal(first.deliverableType, 'draft');
    assert.ok(first.deliverablePath.endsWith('deliverable.md'));

    const deliverableAbs = path.join(root, ...first.deliverablePath.split('/'));
    const content = await readFile(deliverableAbs, 'utf8');
    assert.match(content, /snapshotId: WEXP-/u);
    assert.match(content, /# draft deliverable for WEXP-/u);
    assert.match(content, /### C-001/u);

    // Second invocation is rejected (fail-closed idempotency).
    await assert.rejects(
      () => finalizeExportDeliverable(root, {
        exportSnapshotId: snapshotId,
        deliverableType: 'draft',
      }),
      /already exists|refusing/iu,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('Phase 7 Wave 1 — finalizeExportDeliverable rejects missing snapshot and invalid deliverableType', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vre-phase7-wave1-err-'));
  try {
    await assert.rejects(
      () => finalizeExportDeliverable(root, {
        exportSnapshotId: 'WEXP-does-not-exist',
        deliverableType: 'draft',
      }),
      /not found|ENOENT/iu,
    );
    await assert.rejects(
      () => finalizeExportDeliverable(root, {
        exportSnapshotId: 'WEXP-abc',
        deliverableType: 'zine',
      }),
      /deliverableType/iu,
    );
    await assert.rejects(
      () => finalizeExportDeliverable(root, {
        exportSnapshotId: 'bad-id',
        deliverableType: 'draft',
      }),
      /exportSnapshotId|WEXP/iu,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('Phase 7 Wave 1 — results-bundle-discover adapter is a callable function with correct name', async () => {
  // Full end-to-end behavior requires a real project fixture (the helper
  // loads validators via environment/schemas resolved from projectPath).
  // Adapter-level contract is covered by the registry + schema tests above;
  // lane-level behavior lands in a later wave once the execution-lane
  // fixture scaffold handles absent schema roots without ENOENT.
  const adapter = getTaskAdapter('results-bundle-discover');
  assert.equal(typeof adapter, 'function');
  assert.equal(adapter.name, 'runResultsBundleDiscover');
});
