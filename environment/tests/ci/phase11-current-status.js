import { assert, isDirectRun, readJson, readText, runValidator } from './_helpers.js';
import { expectedCounts } from './validate-counts.js';
import {
  validateCurrentStatusProjection
} from '../../phase11/current-status.js';

export default async function validatePhase11CurrentStatus() {
  const authority = await readJson(
    'environment/tests/fixtures/phase11/current-status-authority.json'
  );
  const readmeMarkdown = await readText('README.md');
  const wikiMarkdown = await readText(
    'environment/tests/fixtures/phase11/current-status-wiki.md'
  );
  const result = validateCurrentStatusProjection({
    authority,
    counts: expectedCounts,
    readmeMarkdown,
    wikiMarkdown
  });

  assert(
    result.ok,
    `Phase 11 current status projection failed: ${JSON.stringify(result.issues)}`
  );
}

if (isDirectRun(import.meta)) {
  await runValidator('phase11-current-status', validatePhase11CurrentStatus);
}
