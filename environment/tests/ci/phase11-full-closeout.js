import { validatePhase11FullCloseoutEvidence } from '../../phase11/phase-11-closeout.js';

import {
  assert,
  isDirectRun,
  readJson,
  readText,
  runValidator
} from './_helpers.js';
import { validateCloseoutText } from './validate-closeout-honesty.js';

const CLOSEOUT_MARKDOWN_PATH = 'environment/closures/phase11-full-closeout-2026-06-17.md';

export default async function validatePhase11FullCloseout() {
  const evidence = await readJson('environment/tests/fixtures/phase11/phase-11-closeout.json');
  const result = validatePhase11FullCloseoutEvidence(evidence);

  assert(result.ok, `Phase 11 full closeout evidence failed: ${JSON.stringify(result.issues)}`);
  assert(result.closesPhase11 === true, 'Phase 11 full closeout must close Phase 11');
  assert(result.biomedicalResult === false, 'Phase 11 full closeout must not be a biomedical result');

  const markdown = await readText(CLOSEOUT_MARKDOWN_PATH);
  assert(
    markdown.includes('## Delivery Attestation'),
    'Phase 11 full closeout markdown must include Delivery Attestation'
  );

  const honestyViolations = await validateCloseoutText(CLOSEOUT_MARKDOWN_PATH, markdown);
  assert(
    honestyViolations.length === 0,
    `Phase 11 full closeout honesty failed: ${honestyViolations.join('\n')}`
  );
}

if (isDirectRun(import.meta)) {
  await runValidator('phase11-full-closeout', validatePhase11FullCloseout);
}
