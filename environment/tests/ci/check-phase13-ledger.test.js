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

test('Phase 13 ledger check covers the T26.0 L5 capstone orchestrator', async () => {
  await assert.rejects(
    () => checkPhase13Ledger({
      skipRequiredFiles: true,
      changedFiles: ['environment/orchestrator/l5-capstone.js'],
      featureLedgerText: [
        '# Phase 13 VRE Feature Ledger',
        '',
        'who: test',
        'when: 2026-06-24',
        'why: test',
        'what:',
        '- `environment/autonomous/l4/swarm-composition.js`',
        'verification:',
        '- test',
        'reviewer:',
        'test'
      ].join('\n')
    }),
    /E_PHASE13_TRACE_MISSING environment\/orchestrator\/l5-capstone\.js/u
  );

  await checkPhase13Ledger({
    skipRequiredFiles: true,
    changedFiles: ['environment/orchestrator/l5-capstone.js'],
    featureLedgerText: [
      '# Phase 13 VRE Feature Ledger',
      '',
      'who: test',
      'when: 2026-06-24',
      'why: test',
      'what:',
      '- `environment/orchestrator/l5-capstone.js`',
      'verification:',
      '- test',
      'reviewer:',
      'test'
    ].join('\n')
  });
});

test('Phase 13 ledger check covers the private governance snapshot digest', async () => {
  const snapshotPath = 'environment/governance/private-wiki-governance-snapshot.json';

  await assert.rejects(
    () => checkPhase13Ledger({
      skipRequiredFiles: true,
      changedFiles: [snapshotPath],
      featureLedgerText: [
        '# Phase 13 VRE Feature Ledger',
        '',
        'who: test',
        'when: 2026-06-25',
        'why: test',
        'what:',
        '- `environment/autonomous/l4/relay-injection-guard.js`',
        'verification:',
        '- test',
        'reviewer:',
        'test'
      ].join('\n')
    }),
    /E_PHASE13_TRACE_MISSING environment\/governance\/private-wiki-governance-snapshot\.json/u
  );

  await checkPhase13Ledger({
    skipRequiredFiles: true,
    changedFiles: [snapshotPath],
    featureLedgerText: [
      '# Phase 13 VRE Feature Ledger',
      '',
      'who: test',
      'when: 2026-06-25',
      'why: test',
      'what:',
      '- `environment/governance/private-wiki-governance-snapshot.json`',
      'verification:',
      '- test',
      'reviewer:',
      'test'
    ].join('\n')
  });
});
