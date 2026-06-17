import { assert, isDirectRun, readText, runValidator } from './_helpers.js';
import { validateLedgerRowBudget } from '../../phase11/ledger-row-budget.js';

export default async function validatePhase11LedgerRowBudget() {
  const ledgerMarkdown = await readText('phase11-vre-feature-ledger.md');
  const result = await validateLedgerRowBudget({ ledgerMarkdown });

  assert(
    result.ok,
    `Phase 11 ledger row budget failed: ${JSON.stringify(result.issues)}`
  );
}

if (isDirectRun(import.meta)) {
  await runValidator('phase11-ledger-row-budget', validatePhase11LedgerRowBudget);
}
