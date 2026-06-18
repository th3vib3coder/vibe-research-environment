import assert from 'node:assert/strict';
import test from 'node:test';

import checkPhase13Ledger from './check-phase13-ledger.js';

test('Phase 13 ledger check rejects covered changes without trace', async () => {
  await assert.rejects(
    () => checkPhase13Ledger({
      skipRequiredFiles: true,
      changedFiles: ['bin/vre'],
      featureLedgerText: [
        '# Phase 13 VRE Feature Ledger',
        '',
        'who: test',
        'when: 2026-06-18',
        'why: test',
        'what:',
        '- `environment/autonomous/gate.js`',
        'verification:',
        '- test',
        'reviewer:',
        'test'
      ].join('\n')
    }),
    /E_PHASE13_TRACE_MISSING bin\/vre/u
  );
});

test('Phase 13 ledger check accepts covered changes when trace exists', async () => {
  await checkPhase13Ledger({
    skipRequiredFiles: true,
    changedFiles: ['bin/vre'],
    featureLedgerText: [
      '# Phase 13 VRE Feature Ledger',
      '',
      'who: test',
      'when: 2026-06-18',
      'why: test',
      'what:',
      '- `bin/vre`',
      'verification:',
      '- test',
      'reviewer:',
      'test'
    ].join('\n')
  });
  assert.equal(true, true);
});
