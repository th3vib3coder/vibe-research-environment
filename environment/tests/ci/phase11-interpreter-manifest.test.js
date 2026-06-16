import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { repoRoot } from './_helpers.js';
import {
  assertInterpreterManifestEnvironment,
  evaluateInterpreterManifestEnvironment
} from '../../phase11/interpreter-manifest.js';

async function readAnalysisManifestFixture(fileName) {
  return JSON.parse(await readFile(path.join(
    repoRoot,
    'environment',
    'tests',
    'fixtures',
    'phase9',
    'analysis-manifest',
    fileName
  ), 'utf8'));
}

test('interpreter manifest accepts pinned Python and opens only executor readiness', async () => {
  const manifest = await readAnalysisManifestFixture('valid-python.json');

  const result = evaluateInterpreterManifestEnvironment(manifest);

  assert.equal(result.ok, true);
  assert.equal(result.runnable, true);
  assert.equal(result.scientificReady, false);
  assert.equal(result.opensExecutor, true);
  assert.deepEqual(result.issues, []);
});

test('interpreter manifest rejects Python 3.14 heavy stack resolved false-green', async () => {
  const manifest = await readAnalysisManifestFixture('invalid-python314-resolved-heavy-stack.json');

  const result = evaluateInterpreterManifestEnvironment(manifest);

  assert.equal(result.ok, false);
  assert.equal(result.runnable, false);
  assert.equal(
    result.issues.some((issue) => issue.code === 'E_PHASE11_INTERPRETER_PY314_HEAVY_STACK_BLOCKED'),
    true
  );
  assert.throws(
    () => assertInterpreterManifestEnvironment(manifest),
    /E_PHASE11_INTERPRETER_PY314_HEAVY_STACK_BLOCKED/u
  );
});

test('interpreter manifest rejects runnable state when environment is blocked', async () => {
  const manifest = await readAnalysisManifestFixture('valid-python.json');
  manifest.environment.resolutionStatus = 'blocked';
  manifest.environment.resolutionReason = 'Pinned interpreter unavailable on this host.';

  const result = evaluateInterpreterManifestEnvironment(manifest);

  assert.equal(result.ok, false);
  assert.equal(result.runnable, false);
  assert.equal(
    result.issues.some((issue) => issue.code === 'E_PHASE11_INTERPRETER_ENV_BLOCKED'),
    true
  );
});

test('interpreter manifest keeps Node script manifests outside the new environment requirement', () => {
  const manifest = {
    schemaVersion: 'phase9.analysis-manifest.v1',
    script: {
      language: 'other'
    },
    command: {
      runner: 'other'
    }
  };

  const result = evaluateInterpreterManifestEnvironment(manifest);

  assert.equal(result.ok, true);
  assert.equal(result.runnable, false);
  assert.equal(result.opensExecutor, false);
});
