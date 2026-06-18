import assert from 'node:assert/strict';
import test from 'node:test';

import validateEditionIsolation, {
  assertNoAutonomousTreeImport
} from './validate-edition-isolation.js';

test('Phase 13 edition-isolation validator accepts the reviewed default-off boundary', async () => {
  await validateEditionIsolation();
  assert.equal(true, true);
});

test('Phase 13 edition-isolation validator rejects base imports of autonomous tree', () => {
  assert.throws(
    () => assertNoAutonomousTreeImport(
      'environment/orchestrator/provider-gateway.js',
      "import { runAutonomousEntrypoint } from '../autonomous/gate.js';\n"
    ),
    /E_PHASE13_BASE_IMPORTS_AUTONOMOUS environment\/orchestrator\/provider-gateway\.js/u
  );
});
