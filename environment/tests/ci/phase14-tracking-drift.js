import { assert, isDirectRun } from './_helpers.js';
import {
  evaluateTrackingDrift,
} from '../phase14/tracking-drift-guard.fixture.js';

function defaultSyncedDescriptor() {
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

export default async function validatePhase14TrackingDrift(options = {}) {
  const descriptor = options.descriptor ?? defaultSyncedDescriptor();
  const result = evaluateTrackingDrift(descriptor);

  assert(result?.ok === true, 'phase14 tracking-drift descriptor did not validate');
}

if (isDirectRun(import.meta)) {
  const { runValidator } = await import('./_helpers.js');
  await runValidator('phase14-tracking-drift', validatePhase14TrackingDrift);
}
