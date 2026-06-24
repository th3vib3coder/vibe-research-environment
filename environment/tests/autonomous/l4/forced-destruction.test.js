import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
  Phase14ForcedDestructionError,
  validateForcedDestructionVerdict
} from '../../../autonomous/l4/forced-destruction.js';

const repoRoot = process.cwd();
const modulePath = path.join(
  repoRoot,
  'environment/autonomous/l4/forced-destruction.js'
);

function baseRecord(overrides = {}) {
  return {
    schemaVersion: 'phase14.adversarial-verdict.v1',
    'event-record': {
      eventId: 'EV-TL4-2-001',
      kind: 'phase14-adversarial-verdict',
      verdict: 'ACCEPT',
      claimProfile: {
        claimId: 'CLAIM-HGSOC-ENDO-001',
        quantitative: true
      },
      details: {
        counterEvidenceSearched: true,
        sfiInjected: true,
        confounderHarnessChecked: true,
        salvagenteSeedProduced: false
      },
      metadata: {
        provenanceClass: 'adversarial-verdict',
        provenanceUse: 'review-survival-metadata',
        law13Provenance: false,
        scientificEvidence: false,
        confidenceDelta: 0,
        runtimeOpened: false
      },
      runtimeOpened: false,
      providerAutomationInvoked: false,
      obdkUsed: false,
      realDataRead: false,
      reviewedApiUsed: false,
      claimExportOpened: false,
      graphifyOpened: false,
      unattendedRuntimeOpened: false
    },
    ...overrides
  };
}

function withEventRecord(record, updates) {
  return {
    ...record,
    'event-record': {
      ...record['event-record'],
      ...updates
    }
  };
}

function withDetails(record, details) {
  return withEventRecord(record, {
    details: {
      ...record['event-record'].details,
      ...details
    }
  });
}

function withMetadata(record, metadata) {
  return withEventRecord(record, { metadata });
}

function errorCode(code) {
  return (error) => error instanceof Phase14ForcedDestructionError
    && error.code === code;
}

describe('Phase 14 TL4.2 forced-destruction verdict validation', () => {
  it('accepts a complete quantitative ACCEPT after destructive checks ran', () => {
    const result = validateForcedDestructionVerdict(baseRecord());

    assert.equal(result.ok, true);
    assert.equal(result.record['event-record'].details.counterEvidenceSearched, true);
    assert.equal(result.record['event-record'].details.sfiInjected, true);
    assert.equal(result.record['event-record'].details.confounderHarnessChecked, true);
  });

  it('fails closed when a U1 boolean is missing or moved outside event-record.details', () => {
    const missing = baseRecord();
    delete missing['event-record'].details.sfiInjected;
    assert.throws(
      () => validateForcedDestructionVerdict(missing),
      errorCode('E_PHASE14_U1_DESTROYER_FIELD_REQUIRED')
    );

    const wrongEnvelope = baseRecord({ sfiInjected: true });
    assert.throws(
      () => validateForcedDestructionVerdict(wrongEnvelope),
      errorCode('E_PHASE14_U1_DESTROYER_FIELD_ENVELOPE')
    );
  });

  it('fails closed when required inert adversarial metadata is missing', () => {
    const missing = baseRecord();
    delete missing['event-record'].metadata;

    assert.throws(
      () => validateForcedDestructionVerdict(missing),
      errorCode('E_PHASE14_U1_METADATA_REQUIRED')
    );
  });

  it('fails closed when adversarial metadata is not inert', () => {
    const inertMetadata = baseRecord()['event-record'].metadata;
    const badMetadataCases = [
      { law13Provenance: true },
      { scientificEvidence: true },
      { confidenceDelta: 0.1 },
      { provenanceClass: 'scientific-evidence' },
      { runtimeOpened: true }
    ];

    for (const metadataPatch of badMetadataCases) {
      assert.throws(
        () => validateForcedDestructionVerdict(withMetadata(baseRecord(), {
          ...inertMetadata,
          ...metadataPatch
        })),
        errorCode('E_PHASE14_U1_METADATA_REQUIRED')
      );
    }
  });

  it('rejects ACCEPT without counter-evidence search or SFI injection', () => {
    assert.throws(
      () => validateForcedDestructionVerdict(withDetails(baseRecord(), {
        counterEvidenceSearched: false
      })),
      errorCode('E_PHASE14_U1_ACCEPT_COUNTER_EVIDENCE_REQUIRED')
    );

    assert.throws(
      () => validateForcedDestructionVerdict(withDetails(baseRecord(), {
        sfiInjected: false
      })),
      errorCode('E_PHASE14_U1_ACCEPT_SFI_REQUIRED')
    );
  });

  it('rejects quantitative ACCEPT without a confounder harness but allows non-quantitative ACCEPT', () => {
    assert.throws(
      () => validateForcedDestructionVerdict(withDetails(baseRecord(), {
        confounderHarnessChecked: false
      })),
      errorCode('E_PHASE14_U1_ACCEPT_CONFOUNDER_REQUIRED')
    );

    const nonQuantitative = withEventRecord(
      withDetails(baseRecord(), { confounderHarnessChecked: false }),
      {
        claimProfile: {
          claimId: 'CLAIM-HGSOC-ENDO-002',
          quantitative: false
        }
      }
    );

    assert.equal(validateForcedDestructionVerdict(nonQuantitative).ok, true);
  });

  it('forces salvageable KILL reasons to carry a real serendipity seed reference', () => {
    const killWithoutSeed = withEventRecord(baseRecord(), {
      verdict: 'KILL',
      reason: 'INSUFFICIENT_EVIDENCE',
      claimProfile: {
        claimId: 'CLAIM-HGSOC-ENDO-003',
        quantitative: false
      }
    });

    assert.throws(
      () => validateForcedDestructionVerdict(withDetails(killWithoutSeed, {
        salvagenteSeedProduced: false
      })),
      errorCode('E_PHASE14_U1_SALVAGENTE_REQUIRED')
    );

    assert.throws(
      () => validateForcedDestructionVerdict(withDetails(killWithoutSeed, {
        salvagenteSeedProduced: true
      })),
      errorCode('E_PHASE14_U1_SALVAGENTE_SEED_REQUIRED')
    );

    const killWithSeed = withDetails(killWithoutSeed, {
      salvagenteSeedProduced: true,
      serendipitySeedRef: 'SEED-HGSOC-ENDO-001'
    });
    assert.equal(validateForcedDestructionVerdict(killWithSeed).ok, true);
  });

  it('does not require a seed for non-salvageable KILL reasons but still requires all booleans', () => {
    const kill = withEventRecord(baseRecord(), {
      verdict: 'KILL',
      reason: 'DUPLICATE',
      claimProfile: {
        claimId: 'CLAIM-HGSOC-ENDO-004',
        quantitative: false
      }
    });

    assert.equal(validateForcedDestructionVerdict(kill).ok, true);

    const missing = withDetails(kill, {});
    delete missing['event-record'].details.salvagenteSeedProduced;
    assert.throws(
      () => validateForcedDestructionVerdict(missing),
      errorCode('E_PHASE14_U1_DESTROYER_FIELD_REQUIRED')
    );
  });

  it('throws named errors for forbidden runtime and automation leakage', () => {
    assert.throws(
      () => validateForcedDestructionVerdict(withEventRecord(baseRecord(), {
        providerAutomationInvoked: true
      })),
      errorCode('E_PHASE14_U1_FORBIDDEN_RUNTIME_SURFACE')
    );
  });

  it('is safe by import and contains no provider OBDK real-data export or CLI path', async () => {
    const before = globalThis.__tl42ImportSideEffectCount ?? 0;
    await import('../../../autonomous/l4/forced-destruction.js');
    assert.equal(globalThis.__tl42ImportSideEffectCount ?? 0, before);

    const source = await readFile(modulePath, 'utf8');
    assert.equal(source.includes('node:child_process'), false);
    assert.equal(source.includes('provider-gateway'), false);
    assert.equal(source.includes('OBDK'), false);
    assert.equal(source.includes('realDataRead: true'), false);
    assert.equal(source.includes('reviewedApiUsed: true'), false);
    assert.equal(source.includes('claimExportOpened: true'), false);
    assert.equal(source.includes('graphifyOpened: true'), false);
    assert.equal(source.includes('unattendedRuntimeOpened: true'), false);
    assert.equal(source.includes('bin/vre'), false);
  });
});
