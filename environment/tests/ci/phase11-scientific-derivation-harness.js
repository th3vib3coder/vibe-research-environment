import { assert, isDirectRun, runValidator } from './_helpers.js';

import {
  evaluateScientificDerivationHarness,
  makeReadyScientificDerivationHarnessFixture,
  makeScientificDerivationHarnessFixture
} from '../../phase11/scientific-derivation-harness.js';

export default async function validatePhase11ScientificDerivationHarness() {
  const blocked = evaluateScientificDerivationHarness(makeScientificDerivationHarnessFixture());
  assert(blocked.ok, `Blocked scientific harness fixture failed: ${JSON.stringify(blocked.issues)}`);
  assert(blocked.readyForQuantitativeRun === false, 'Blocked fixture must not be ready');
  assert(blocked.promotesClaim === false, 'Harness validator must not promote claims');
  assert(blocked.computesFraction === false, 'Harness validator must not compute a fraction');

  const ready = evaluateScientificDerivationHarness(makeReadyScientificDerivationHarnessFixture());
  assert(ready.ok, `Ready scientific harness fixture failed: ${JSON.stringify(ready.issues)}`);
  assert(ready.readyForQuantitativeRun === true, 'Ready fixture must require all gates');
  assert(ready.promotesClaim === false, 'Ready harness still must not promote a claim');
  assert(ready.computesFraction === false, 'Ready harness still must not compute a fraction');
}

if (isDirectRun(import.meta)) {
  await runValidator(
    'phase11-scientific-derivation-harness',
    validatePhase11ScientificDerivationHarness
  );
}
