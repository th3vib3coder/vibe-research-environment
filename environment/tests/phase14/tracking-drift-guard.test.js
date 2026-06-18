import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  E_PHASE14_TRACKING_DRIFT,
  evaluateTrackingDrift,
} from './tracking-drift-guard.fixture.js';

const fixturePath = path.resolve(
  import.meta.dirname,
  'tracking-drift-guard.fixture.js'
);

function expectTrackingDrift(descriptor, reason) {
  assert.throws(
    () => evaluateTrackingDrift(descriptor),
    (error) => error?.code === E_PHASE14_TRACKING_DRIFT && error?.reason === reason
  );
}

function validDescriptor() {
  return {
    changedSurfaces: [
      {
        path: 'environment/lib/phase14/example.js',
        featureId: 'PH14-EXAMPLE',
        kind: 'code',
      },
    ],
    featureLedgerRows: [
      {
        featureId: 'PH14-EXAMPLE',
        status: 'implemented',
        paths: ['environment/lib/phase14/example.js'],
      },
    ],
    liveSurfaces: [
      {
        featureId: 'PH14-EXAMPLE',
        path: 'environment/lib/phase14/example.js',
      },
    ],
    wikiUpdates: ['environment/lib/phase14/example.js'],
    statusLedgerUpdates: ['W14-TRACKING-BOOTSTRAP'],
    advancedContracts: ['W14-TRACKING-BOOTSTRAP'],
  };
}

test('raises E_PHASE14_TRACKING_DRIFT for a changed code surface without a ledger row', () => {
  const descriptor = validDescriptor();
  descriptor.featureLedgerRows = [];

  expectTrackingDrift(descriptor, 'surface-without-row');
});

test('raises E_PHASE14_TRACKING_DRIFT for an implemented row without a live surface', () => {
  const descriptor = validDescriptor();
  descriptor.liveSurfaces = [];

  expectTrackingDrift(descriptor, 'orphan-row');
});

test('raises E_PHASE14_TRACKING_DRIFT for a live surface without a ledger row', () => {
  const descriptor = validDescriptor();
  descriptor.featureLedgerRows = [];
  descriptor.changedSurfaces = [];

  expectTrackingDrift(descriptor, 'missing-surface');
});

test('raises E_PHASE14_TRACKING_DRIFT when a changed surface lacks a WIKI update', () => {
  const descriptor = validDescriptor();
  descriptor.wikiUpdates = [];

  expectTrackingDrift(descriptor, 'surface-without-wiki');
});

test('raises E_PHASE14_TRACKING_DRIFT when the status ledger is stale', () => {
  const descriptor = validDescriptor();
  descriptor.statusLedgerUpdates = [];

  expectTrackingDrift(descriptor, 'stale-status');
});

test('passes when surface, ledger, status, and WIKI evidence match', () => {
  assert.deepEqual(evaluateTrackingDrift(validDescriptor()), {
    ok: true,
    checked: {
      changedSurfaces: 1,
      featureLedgerRows: 1,
      liveSurfaces: 1,
      wikiUpdates: 1,
      statusLedgerUpdates: 1,
      advancedContracts: 1,
    },
  });
});

test('fixture is a pure descriptor predicate and not a wired filesystem checker', () => {
  const source = fs.readFileSync(fixturePath, 'utf8');

  assert.doesNotMatch(source, /from ['"]node:fs['"]/);
  assert.doesNotMatch(source, /from ['"]fs['"]/);
  assert.doesNotMatch(source, /readFile|readdir|statSync|existsSync/);
  assert.doesNotMatch(source, /process\.cwd|git\s+diff|spawn|exec/);
});
