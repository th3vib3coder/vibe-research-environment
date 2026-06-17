import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LEDGER_ROW_BUDGET_REASON_CODES,
  validateLedgerRowBudget
} from '../../phase11/ledger-row-budget.js';

function makeSection({ taskId = 'T11.3.1', body = '' } = {}) {
  return [
    `## ${taskId} Ledger Row Budget Trace`,
    '',
    body,
    ''
  ].join('\n');
}

function repeatedBody(lineCount) {
  return Array.from({ length: lineCount }, (_, index) =>
    `- narrative detail ${String(index + 1).padStart(3, '0')}`
  ).join('\n');
}

async function validate(markdown, overrides = {}) {
  return validateLedgerRowBudget({
    ledgerMarkdown: markdown,
    maxSectionLines: 8,
    maxSectionChars: 220,
    evidencePathExists: async (candidate) =>
      candidate === 'vibe-science/blueprints/private/phase11-implementation-plan/existing-hat3.md',
    ...overrides
  });
}

test('compact post-policy ledger section passes without evidence link', async () => {
  const result = await validate(makeSection({
    body: [
      '- summary: compact index entry.',
      '- evidence: targeted tests and run-all listed in HAT3.'
    ].join('\n')
  }));

  assert.equal(result.ok, true, JSON.stringify(result.issues, null, 2));
});

test('over-budget post-policy section without evidence link fails', async () => {
  const result = await validate(makeSection({ body: repeatedBody(12) }));

  assert.equal(result.ok, false);
  assert(result.issues.some((issue) =>
    issue.code === LEDGER_ROW_BUDGET_REASON_CODES.overBudgetMissingEvidence
      && issue.taskId === 'T11.3.1'
  ));
});

test('over-budget section with non-existent evidence path fails', async () => {
  const result = await validate(makeSection({
    body: `${repeatedBody(12)}\n- evidence: \`missing-hat3.md\``
  }));

  assert.equal(result.ok, false);
  assert(result.issues.some((issue) =>
    issue.code === LEDGER_ROW_BUDGET_REASON_CODES.evidencePathMissing
      && issue.path === 'missing-hat3.md'
  ));
});

test('over-budget section with vague see-handoff prose fails', async () => {
  const result = await validate(makeSection({
    body: `${repeatedBody(12)}\n- evidence: see handoff`
  }));

  assert.equal(result.ok, false);
  assert(result.issues.some((issue) =>
    issue.code === LEDGER_ROW_BUDGET_REASON_CODES.overBudgetMissingEvidence
  ));
});

test('over-budget section with existing evidence path passes', async () => {
  const result = await validate(makeSection({
    body: [
      repeatedBody(12),
      '- evidence:',
      '  `vibe-science/blueprints/private/phase11-implementation-plan/existing-hat3.md`'
    ].join('\n')
  }));

  assert.equal(result.ok, true, JSON.stringify(result.issues, null, 2));
});

test('pre-policy long section is grandfathered', async () => {
  const result = await validate(makeSection({
    taskId: 'T11.3.0',
    body: repeatedBody(20)
  }));

  assert.equal(result.ok, true, JSON.stringify(result.issues, null, 2));
});

test('task cutoff ordering is semantic, not string based', async () => {
  const result = await validate(makeSection({
    taskId: 'T11.3.10',
    body: repeatedBody(12)
  }));

  assert.equal(result.ok, false);
  assert(result.issues.some((issue) =>
    issue.code === LEDGER_ROW_BUDGET_REASON_CODES.overBudgetMissingEvidence
      && issue.taskId === 'T11.3.10'
  ));
});

test('malformed post-policy heading fails closed', async () => {
  const result = await validate(makeSection({
    taskId: 'T11.3.x',
    body: '- malformed post-policy heading.'
  }));

  assert.equal(result.ok, false);
  assert(result.issues.some((issue) =>
    issue.code === LEDGER_ROW_BUDGET_REASON_CODES.malformedPostPolicyTaskId
  ));
});
