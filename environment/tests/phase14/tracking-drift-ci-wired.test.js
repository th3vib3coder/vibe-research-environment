import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { expectedCounts, default as validateCounts } from '../ci/validate-counts.js';
import validatePhase14TrackingDrift from '../ci/phase14-tracking-drift.js';
import { E_PHASE14_TRACKING_DRIFT } from './tracking-drift-guard.fixture.js';

function syncedDescriptor() {
  return {
    changedSurfaces: [
      {
        path: 'environment/tests/phase14/tracking-drift-ci-wired.test.js',
        featureId: 'PH14-TRACKING-DRIFT-CI-WIRING',
        kind: 'code',
      },
    ],
    featureLedgerRows: [
      {
        featureId: 'PH14-TRACKING-DRIFT-CI-WIRING',
        status: 'implemented',
        paths: ['environment/tests/phase14/tracking-drift-ci-wired.test.js'],
      },
    ],
    liveSurfaces: [
      {
        featureId: 'PH14-TRACKING-DRIFT-CI-WIRING',
        path: 'environment/tests/phase14/tracking-drift-ci-wired.test.js',
      },
    ],
    wikiUpdates: ['environment/tests/phase14/tracking-drift-ci-wired.test.js'],
    statusLedgerUpdates: ['W14-GATE-REGISTRY+NORMALIZE'],
    advancedContracts: ['W14-GATE-REGISTRY+NORMALIZE'],
  };
}

test('run-all wires the phase14 tracking-drift validator by stable name', async () => {
  const source = await readFile(
    new URL('../ci/run-all.js', import.meta.url),
    'utf8'
  );

  assert.match(source, /phase14-tracking-drift/u);
  assert.match(source, /validatePhase14TrackingDrift/u);
});

test('phase14 tracking-drift CI validator fails closed on seeded drift', async () => {
  const descriptor = syncedDescriptor();
  descriptor.featureLedgerRows = [];

  await assert.rejects(
    () => validatePhase14TrackingDrift({ descriptor }),
    (error) => error?.code === E_PHASE14_TRACKING_DRIFT
      && error?.reason === 'surface-without-row'
  );
});

test('phase14 tracking-drift CI validator passes a synced descriptor', async () => {
  await validatePhase14TrackingDrift({ descriptor: syncedDescriptor() });
});

test('validate-counts enforces both the CI validator and phase14 test counts', async () => {
  assert.equal(expectedCounts.ciValidators, 70);
  assert.equal(expectedCounts.phase14Tests, 4);

  await validateCounts();
});
