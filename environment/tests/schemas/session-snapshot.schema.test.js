import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import Ajv from 'ajv';
import addFormats from 'ajv-formats';

import {
  ATTEMPT_ID,
  ISO_DATE,
  defineSchemaFixtureTests
} from './schema-test-helper.js';

defineSchemaFixtureTests({
  schemaFile: 'session-snapshot.schema.json',
  suiteName: 'session-snapshot.schema',
  validFixture: {
    schemaVersion: 'vibe-env.session.v1',
    activeFlow: 'experiment',
    currentStage: 'registration',
    nextActions: ['review EXP-001'],
    blockers: ['missing control cohort'],
    kernel: {
      dbAvailable: true,
      degradedReason: null
    },
    capabilities: {
      claimHeads: true,
      citationChecks: true,
      governanceProfileAtCreation: false,
      claimSearch: true
    },
    budget: {
      state: 'ok',
      toolCalls: 12,
      estimatedCostUsd: 1.42,
      countingMode: 'provider_native'
    },
    signals: {
      staleMemory: false,
      unresolvedClaims: 1,
      blockedExperiments: 2,
      exportAlerts: 0
    },
    lastCommand: '/flow-experiment',
    lastAttemptId: ATTEMPT_ID,
    updatedAt: ISO_DATE
  },
  invalidFixture: {
    schemaVersion: 'vibe-env.session.v1',
    activeFlow: 'analysis',
    currentStage: 'registration',
    nextActions: [],
    blockers: [],
    kernel: {
      dbAvailable: true,
      degradedReason: null
    },
    capabilities: {
      claimHeads: true,
      citationChecks: true,
      governanceProfileAtCreation: false,
      claimSearch: false
    },
    budget: {
      state: 'ok',
      toolCalls: 0,
      estimatedCostUsd: 0,
      countingMode: 'provider_native'
    },
    signals: {
      staleMemory: false,
      unresolvedClaims: 0,
      blockedExperiments: 0,
      exportAlerts: 0
    },
    lastCommand: '/flow-status',
    lastAttemptId: ATTEMPT_ID,
    updatedAt: ISO_DATE
  },
  degradedFixture: {
    schemaVersion: 'vibe-env.session.v1',
    activeFlow: null,
    currentStage: null,
    nextActions: [],
    blockers: [],
    kernel: {
      dbAvailable: false,
      degradedReason: 'kernel DB unavailable'
    },
    capabilities: {
      claimHeads: false,
      citationChecks: false,
      governanceProfileAtCreation: false,
      claimSearch: false
    },
    budget: {
      state: 'unknown',
      toolCalls: 0,
      estimatedCostUsd: 0,
      countingMode: 'unknown'
    },
    signals: {
      staleMemory: false,
      unresolvedClaims: 0,
      blockedExperiments: 0,
      exportAlerts: 0
    },
    lastCommand: null,
    lastAttemptId: null,
    updatedAt: null
  }
});

// --- WP-114: signals.provenance extension ---

const SCHEMA_URL = new URL('../../schemas/session-snapshot.schema.json', import.meta.url);

async function loadValidator() {
  const schema = JSON.parse(await readFile(SCHEMA_URL, 'utf8'));
  const ajv = new Ajv({ allErrors: true, allowUnionTypes: true, strict: false });
  addFormats(ajv);
  return ajv.compile(schema);
}

function baseSnapshot(overrides = {}) {
  return {
    schemaVersion: 'vibe-env.session.v1',
    activeFlow: 'experiment',
    currentStage: 'registration',
    nextActions: [],
    blockers: [],
    kernel: { dbAvailable: true, degradedReason: null },
    capabilities: {
      claimHeads: true,
      citationChecks: true,
      governanceProfileAtCreation: false,
      claimSearch: true
    },
    budget: {
      state: 'ok',
      toolCalls: 0,
      estimatedCostUsd: 0,
      countingMode: 'provider_native'
    },
    signals: {
      staleMemory: false,
      unresolvedClaims: 0,
      blockedExperiments: 0,
      exportAlerts: 0,
      ...overrides
    },
    lastCommand: '/flow-status',
    lastAttemptId: ATTEMPT_ID,
    updatedAt: ISO_DATE
  };
}

describe('session-snapshot.schema — WP-114 signals.provenance', () => {
  it('accepts v2 payload with kernel-backed provenance and nonzero unresolvedClaims', async () => {
    const validator = await loadValidator();
    const fixture = baseSnapshot({
      unresolvedClaims: 3,
      provenance: {
        sourceMode: 'kernel-backed',
        degradedReason: null,
        lastKernelContactAt: ISO_DATE
      }
    });
    assert.equal(validator(fixture), true, JSON.stringify(validator.errors));
  });

  it('accepts v2 payload with degraded provenance when unresolvedClaims is 0', async () => {
    const validator = await loadValidator();
    const fixture = baseSnapshot({
      unresolvedClaims: 0,
      provenance: {
        sourceMode: 'degraded',
        degradedReason: 'kernel reader absent',
        lastKernelContactAt: null
      }
    });
    assert.equal(validator(fixture), true, JSON.stringify(validator.errors));
  });

  it('rejects v2 payload with degraded provenance AND nonzero unresolvedClaims', async () => {
    const validator = await loadValidator();
    const fixture = baseSnapshot({
      unresolvedClaims: 2,
      provenance: {
        sourceMode: 'degraded',
        degradedReason: 'kernel reader absent',
        lastKernelContactAt: null
      }
    });
    assert.equal(validator(fixture), false, 'consistency rule should block degraded + unresolvedClaims>0');
  });

  it('accepts v2 payload with mixed provenance', async () => {
    const validator = await loadValidator();
    const fixture = baseSnapshot({
      unresolvedClaims: 1,
      provenance: {
        sourceMode: 'mixed',
        degradedReason: 'partial kernel read',
        lastKernelContactAt: ISO_DATE
      }
    });
    assert.equal(validator(fixture), true, JSON.stringify(validator.errors));
  });

  it('rejects v2 payload with invalid sourceMode enum', async () => {
    const validator = await loadValidator();
    const fixture = baseSnapshot({
      provenance: {
        sourceMode: 'partial',
        degradedReason: null,
        lastKernelContactAt: ISO_DATE
      }
    });
    assert.equal(validator(fixture), false, 'sourceMode enum must be enforced');
  });

  it('rejects v2 payload missing required provenance fields', async () => {
    const validator = await loadValidator();
    const fixture = baseSnapshot({
      provenance: {
        sourceMode: 'kernel-backed'
      }
    });
    assert.equal(validator(fixture), false, 'provenance.degradedReason and lastKernelContactAt must be required');
  });

  it('accepts legacy payload without provenance (backward compatibility)', async () => {
    const validator = await loadValidator();
    const fixture = baseSnapshot({ unresolvedClaims: 5 });
    assert.equal(validator(fixture), true, JSON.stringify(validator.errors));
  });
});
