import { validatePhase12FullCloseoutEvidence } from '../../phase12/phase-12-closeout.js';

import {
  assert,
  isDirectRun,
  readJson,
  readText,
  runValidator
} from './_helpers.js';
import { validateCloseoutText } from './validate-closeout-honesty.js';

const CLOSEOUT_MARKDOWN_PATH = 'environment/closures/phase12-full-closeout-2026-06-18.md';

export default async function validatePhase12FullCloseout() {
  const evidence = await readJson('environment/tests/fixtures/phase12/phase-12-closeout.json');
  const result = validatePhase12FullCloseoutEvidence(evidence);

  assert(
    result.ok,
    `Phase 12 full closeout evidence failed: ${JSON.stringify(result.issues)}`
  );
  assert(
    result.closesPhase12Scaffold === true,
    'Phase 12 full closeout must close the scaffold.'
  );
  assert(result.liveRuntimeReady === false, 'Phase 12 live runtime must remain closed.');
  assert(result.biomedicalResult === false, 'Phase 12 closeout must not be biomedical evidence.');

  const markdown = await readText(CLOSEOUT_MARKDOWN_PATH);
  assert(
    markdown.includes('## Delivery Attestation'),
    'Phase 12 closeout markdown must include Delivery Attestation.'
  );
  assert(
    !/Phase 12 remains gated|Phase 12 resta bloccata/u.test(markdown),
    'Phase 12 closeout markdown must not retain stale gated-only wording.'
  );

  const honestyViolations = await validateCloseoutText(CLOSEOUT_MARKDOWN_PATH, markdown);
  assert(
    honestyViolations.length === 0,
    `Phase 12 closeout honesty failed: ${honestyViolations.join('\n')}`
  );
}

if (isDirectRun(import.meta)) {
  await runValidator('phase12-full-closeout', validatePhase12FullCloseout);
}
