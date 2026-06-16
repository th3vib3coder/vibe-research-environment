import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { assert, isDirectRun, repoRoot, runValidator } from './_helpers.js';
import { evaluateInterpreterManifestEnvironment } from '../../phase11/interpreter-manifest.js';

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

export default async function validatePhase11InterpreterExecutor() {
  const validPython = evaluateInterpreterManifestEnvironment(
    await readAnalysisManifestFixture('valid-python.json')
  );
  assert(validPython.opensExecutor === true, 'Resolved Python manifests must open executor readiness.');
  assert(validPython.scientificReady === false, 'Executor readiness must not imply scientific readiness.');

  const executionLane = await readFile(path.join(
    repoRoot,
    'environment',
    'orchestrator',
    'execution-lane.js'
  ), 'utf8');
  for (const required of [
    'E_PHASE11_INTERPRETER_EXECUTABLE_OUTSIDE_VENV',
    'E_PHASE11_INTERPRETER_COMMAND_WRAPPER_FORBIDDEN',
    'E_PHASE11_INTERPRETER_EXECUTABLE_MISSING',
    'E_PHASE11_SCIENTIFIC_RUNTIME_CLOSED',
    'shell: false'
  ]) {
    assert(
      executionLane.includes(required),
      `Interpreter executor guardrail missing from execution-lane.js: ${required}`
    );
  }
}

if (isDirectRun(import.meta)) {
  await runValidator('phase11-interpreter-executor', validatePhase11InterpreterExecutor);
}
