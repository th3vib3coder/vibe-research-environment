import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

import { assert, isDirectRun, repoRoot, runValidator } from './_helpers.js';
import {
  analyzeSyntheticHgsocCd8Fixture,
  evaluateHgsocCd8ScriptContract,
  makeHgsocCd8ScriptContractFixture
} from '../../phase11/hgsoc-cd8-script.js';

const execFileAsync = promisify(execFile);

function pythonCommand() {
  if (process.env.PHASE11_SYNTHETIC_PYTHON) {
    return process.env.PHASE11_SYNTHETIC_PYTHON;
  }
  return process.platform === 'win32' ? 'python' : 'python3';
}

async function runSyntheticPythonSmoke(scriptPath) {
  const { stdout } = await execFileAsync(
    pythonCommand(),
    [scriptPath, '--synthetic-smoke'],
    { cwd: repoRoot }
  );
  return JSON.parse(stdout);
}

export default async function validatePhase11HgsocCd8Script() {
  const scriptPath = 'environment/phase11/hgsoc_cd8_synthetic.py';
  const sourceText = await readFile(path.join(repoRoot, scriptPath), 'utf8');
  const contract = makeHgsocCd8ScriptContractFixture();
  const validation = evaluateHgsocCd8ScriptContract(contract, { pythonSourceText: sourceText });
  const synthetic = analyzeSyntheticHgsocCd8Fixture(contract);
  const pythonSynthetic = await runSyntheticPythonSmoke(scriptPath);

  assert(validation.ok, `Valid HGSOC CD8 script contract failed: ${JSON.stringify(validation.issues)}`);
  assert(synthetic.fixtureSha256 === contract.syntheticFixture.fixtureSha256, 'Synthetic fixture hash mismatch');
  assert(pythonSynthetic.fixtureSha256 === synthetic.fixtureSha256, 'Python synthetic fixture hash mismatch');
  assert(pythonSynthetic.cd8Cells === synthetic.cd8Cells, 'Python synthetic CD8 count mismatch');
  assert(
    pythonSynthetic.cxcl13PositiveCd8Cells === synthetic.cxcl13PositiveCd8Cells,
    'Python synthetic CXCL13+ CD8 count mismatch'
  );
  assert(
    pythonSynthetic.cxcl13PositiveFraction === synthetic.cxcl13PositiveFraction,
    'Python synthetic CXCL13+ fraction mismatch'
  );
  assert(synthetic.cd8Cells === 4, 'Synthetic fixture must contain four reviewed CD8 cells');
  assert(synthetic.cxcl13PositiveCd8Cells === 2, 'Synthetic fixture must contain two CXCL13+ CD8 cells');
  assert(synthetic.cxcl13PositiveFraction === 0.5, 'Synthetic fraction must be deterministic');
  assert(synthetic.claimReady === false, 'Synthetic smoke must not become claim-ready');
  assert(synthetic.performsRealDataAnalysis === false, 'Synthetic smoke must not perform real data analysis');
}

if (isDirectRun(import.meta)) {
  await runValidator('phase11-hgsoc-cd8-script', validatePhase11HgsocCd8Script);
}
