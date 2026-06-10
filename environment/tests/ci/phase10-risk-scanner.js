import { assert, isDirectRun, runValidator } from './_helpers.js';

import {
  scanAssertionRisk
} from '../../phase10/risk-scanner.js';

export default async function validatePhase10RiskScanner() {
  assert(
    scanAssertionRisk({ text: 'A marker may underlie relapse.' }).includes('hedge-causality'),
    'Risk scanner must detect hedge-causality signals'
  );
  assert(
    scanAssertionRisk({ text: 'The pathway causes resistance.' }).includes('causal-or-mechanistic-language'),
    'Risk scanner must detect causal/mechanistic signals'
  );
  assert(
    scanAssertionRisk({ text: 'A measured expression value is reported.' }).length === 0,
    'Risk scanner must not invent risk flags for neutral extractive statements'
  );
}

if (isDirectRun(import.meta)) {
  await runValidator('phase10-risk-scanner', validatePhase10RiskScanner);
}
