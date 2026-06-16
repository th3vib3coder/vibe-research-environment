import assert from 'node:assert/strict';
import test from 'node:test';

import checkPhase11Ledger from './check-phase11-ledger.js';

const tracedLedger = `
# Phase 11 VRE Feature Ledger

who: codex
when: 2026-06-16
why: T11.0.1 packet scaffold
what: Phase 11 research packet scaffold and ledger checker
verification: RED-first then GREEN
reviewer: claude-code

- environment/phase11/research-packet.js
- environment/tests/ci/phase11-research-packet.js
- environment/tests/ci/phase11-research-packet.test.js
- environment/tests/ci/check-phase11-ledger.js
- environment/tests/ci/check-phase11-ledger.test.js
- environment/schemas/phase11-research-packet.schema.json
- environment/tests/schemas/phase11-research-packet.schema.test.js
- environment/tests/ci/run-all.js
- environment/tests/ci/validate-counts.js
- phase11-vre-feature-ledger.md
`;

test('check-phase11-ledger accepts traced Phase 11 changed files', async () => {
  await checkPhase11Ledger({
    changedFiles: [
      'environment/phase11/research-packet.js',
      'environment/tests/ci/phase11-research-packet.test.js'
    ],
    featureLedgerText: tracedLedger,
    skipRequiredFiles: true
  });
});

test('check-phase11-ledger fails closed when a Phase 11 file lacks trace', async () => {
  await assert.rejects(
    () => checkPhase11Ledger({
      changedFiles: ['environment/phase11/research-packet.js'],
      featureLedgerText: tracedLedger.replace('environment/phase11/research-packet.js', ''),
      skipRequiredFiles: true
    }),
    /E_PHASE11_TRACE_MISSING/u
  );
});

test('check-phase11-ledger requires trace fields', async () => {
  await assert.rejects(
    () => checkPhase11Ledger({
      changedFiles: ['environment/phase11/research-packet.js'],
      featureLedgerText: '- environment/phase11/research-packet.js',
      skipRequiredFiles: true
    }),
    /E_PHASE11_TRACE_FIELD_MISSING/u
  );
});

test('check-phase11-ledger honors explicit argv changed-file probes', async () => {
  await assert.rejects(
    () => checkPhase11Ledger({
      argv: ['--changed-file', 'environment/phase11/not-traced.js'],
      featureLedgerText: tracedLedger,
      skipRequiredFiles: true
    }),
    /E_PHASE11_TRACE_MISSING/u
  );
});
