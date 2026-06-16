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

export default async function validatePhase11InterpreterManifest() {
  const validPython = evaluateInterpreterManifestEnvironment(
    await readAnalysisManifestFixture('valid-python.json')
  );
  const python314 = evaluateInterpreterManifestEnvironment(
    await readAnalysisManifestFixture('invalid-python314-resolved-heavy-stack.json')
  );

  assert(validPython.ok, `Valid pinned Python manifest failed: ${JSON.stringify(validPython.issues)}`);
  assert(validPython.opensExecutor === true, 'T11.1.2 opens the Python executor for resolved interpreter manifests.');
  assert(validPython.scientificReady === false, 'Interpreter readiness cannot imply scientific readiness.');
  assert(python314.ok === false, 'Python 3.14 heavy stack resolved false-green must fail.');
  assert(
    python314.issues.some((issue) => issue.code === 'E_PHASE11_INTERPRETER_PY314_HEAVY_STACK_BLOCKED'),
    'Python 3.14 heavy stack must be blocked semantically.'
  );
}

if (isDirectRun(import.meta)) {
  await runValidator('phase11-interpreter-manifest', validatePhase11InterpreterManifest);
}
