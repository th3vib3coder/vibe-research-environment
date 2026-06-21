import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertBaseReaderStateNamespaceSplit,
  assertNoAutonomousStateNamespaceRead,
  BASE_STATE_READER_FILES
} from '../../ci/validate-edition-isolation.js';

test('reviewed base readers do not read the autonomous state namespace', async () => {
  assert.ok(BASE_STATE_READER_FILES.includes('environment/control/query.js'));
  assert.ok(BASE_STATE_READER_FILES.includes('environment/orchestrator/query.js'));
  assert.ok(BASE_STATE_READER_FILES.includes('environment/objectives/store.js'));

  await assertBaseReaderStateNamespaceSplit();
});

test('state namespace guard rejects direct autonomous state literals', () => {
  assert.throws(
    () => assertNoAutonomousStateNamespaceRead(
      'environment/control/query.js',
      "const leak = '.vibe-science-environment/autonomous/l0/halt-request.json';\n"
    ),
    /E_PHASE13_BASE_READER_AUTONOMOUS_STATE environment\/control\/query\.js/u
  );
});

test('state namespace guard rejects path.join autonomous state construction', () => {
  assert.throws(
    () => assertNoAutonomousStateNamespaceRead(
      'environment/orchestrator/query.js',
      "const leak = path.join('.vibe-science-environment', 'autonomous', 'l0');\n"
    ),
    /E_PHASE13_BASE_READER_AUTONOMOUS_STATE environment\/orchestrator\/query\.js/u
  );
});

test('state namespace guard rejects resolveInside autonomous state construction', () => {
  assert.throws(
    () => assertNoAutonomousStateNamespaceRead(
      'environment/objectives/store.js',
      "const leak = resolveInside(root, '.vibe-science-environment', 'autonomous');\n"
    ),
    /E_PHASE13_BASE_READER_AUTONOMOUS_STATE environment\/objectives\/store\.js/u
  );
});

test('state namespace guard rejects unreviewed base reader paths', () => {
  assert.throws(
    () => assertNoAutonomousStateNamespaceRead(
      'environment/control/unreviewed-reader.js',
      "const safe = '.vibe-science-environment/control/events.jsonl';\n"
    ),
    /E_PHASE13_BASE_READER_UNREVIEWED environment\/control\/unreviewed-reader\.js/u
  );
});
