import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  classifyL0Readiness
} from '../../../autonomous/l0/preflight.js';

const baseCapabilities = Object.freeze({
  kernel: {
    mode: 'full',
    projections: {
      unavailable: []
    }
  },
  memory: {
    fresh: true,
    lastSyncAt: '2026-06-18T10:00:00.000Z'
  },
  degradedReasons: []
});

const injectedHypotheticalGuardEvidence = Object.freeze({
  halt: {
    evidenceClass: 'injected-hypothetical',
    requestedBy: 'Carmine',
    reason: 'reviewed L0 readiness fixture',
    interruptsWithinOneIteration: true,
    resumeRequiresOperatorGo: true
  },
  operators: [
    { name: 'Carmine', role: 'operator' },
    { name: 'Elisa', role: 'medical-operator' }
  ]
});

function classify(overrides = {}) {
  return classifyL0Readiness({
    capabilities: {
      ...baseCapabilities,
      ...overrides.capabilities
    },
    guardEvidence: overrides.guardEvidence ?? injectedHypotheticalGuardEvidence,
    runProfile: overrides.runProfile
  });
}

function issueCodes(issues) {
  return issues.map((issue) => issue.code).sort();
}

describe('Phase 13 L0 readiness classifier', () => {
  it('keeps the happy path pure and does not open runtime', () => {
    const result = classify();

    assert.equal(result.schemaVersion, 'phase13.l0-readiness-preflight.v1');
    assert.equal(result.ready, true);
    assert.equal(result.runtimeOpened, false);
    assert.deepEqual(result.blockers, []);
    assert.deepEqual(result.warnings, []);
    assert.equal(result.haltEvidenceClass, 'injected-hypothetical');
  });

  it('blocks when the kernel is not full or a projection is unavailable', () => {
    const degraded = classify({
      capabilities: {
        kernel: {
          mode: 'degraded',
          projections: {
            unavailable: [
              { name: 'listCitationChecks', reason: 'no such column' }
            ]
          }
        }
      }
    });

    assert.equal(degraded.ready, false);
    assert.equal(degraded.runtimeOpened, false);
    assert.deepEqual(issueCodes(degraded.blockers), [
      'E_L0_KERNEL_NOT_FULL',
      'E_L0_KERNEL_PROJECTION_UNAVAILABLE'
    ]);
  });

  it('blocks stale memory and missing executable markdown contracts', () => {
    const result = classify({
      capabilities: {
        memory: {
          fresh: false,
          lastSyncAt: '2026-04-18T23:31:55.251Z'
        },
        degradedReasons: [
          'STALE - run /sync-memory to refresh',
          'executable command research-loop is wired in bin/vre but missing a reviewed markdown contract'
        ]
      }
    });

    assert.equal(result.ready, false);
    assert.deepEqual(issueCodes(result.blockers), [
      'E_L0_COMMAND_CONTRACTS_MISSING',
      'E_L0_MEMORY_STALE'
    ]);
    assert.deepEqual(result.requiredNextActions, [
      'Refresh memory before L0 preflight.',
      'Add reviewed markdown contracts for executable commands before L0 preflight.'
    ]);
  });

  it('blocks missing or invalid halt evidence without implying halt runtime exists', () => {
    const missing = classify({ guardEvidence: { operators: injectedHypotheticalGuardEvidence.operators } });
    const invalidOperator = classify({
      guardEvidence: {
        ...injectedHypotheticalGuardEvidence,
        halt: {
          ...injectedHypotheticalGuardEvidence.halt,
          requestedBy: 'Claude'
        }
      }
    });

    assert.equal(missing.ready, false);
    assert.equal(invalidOperator.ready, false);
    assert.equal(missing.runtimeOpened, false);
    assert.equal(invalidOperator.runtimeOpened, false);
    assert.deepEqual(issueCodes(missing.blockers), ['E_L0_HALT_EVIDENCE_MISSING']);
    assert.deepEqual(issueCodes(invalidOperator.blockers), ['E_L0_HALT_OPERATOR_INVALID']);
  });

  it('blocks incomplete multi-operator evidence', () => {
    const result = classify({
      guardEvidence: {
        ...injectedHypotheticalGuardEvidence,
        operators: [{ name: 'Carmine', role: 'operator' }]
      }
    });

    assert.equal(result.ready, false);
    assert.equal(result.runtimeOpened, false);
    assert.deepEqual(issueCodes(result.blockers), ['E_L0_OPERATOR_MODEL_INCOMPLETE']);
  });

  it('keeps optional connector automation domain-pack and R2 caveats visible as warnings', () => {
    const result = classify({
      capabilities: {
        degradedReasons: [
          'connector filesystem-export is degraded: connectors-core bundle is not installed',
          'automation weekly-research-digest is degraded: automation-core bundle is not installed',
          'domain pack omics is degraded: domain-packs-core bundle is not installed',
          'kernel unresolvedR2Count is currently derived from listUnresolvedClaims until a dedicated R2 projection lands'
        ]
      }
    });

    assert.equal(result.ready, true);
    assert.equal(result.runtimeOpened, false);
    assert.deepEqual(issueCodes(result.warnings), [
      'W_L0_AUTOMATION_DEGRADED',
      'W_L0_CONNECTOR_DEGRADED',
      'W_L0_DOMAIN_PACK_DEGRADED',
      'W_L0_UNRESOLVED_R2_DERIVED'
    ]);
  });

  it('promotes optional degraded surfaces to blockers when the run profile requires them', () => {
    const result = classify({
      runProfile: { requiredSurfaces: ['connectors', 'domainPacks'] },
      capabilities: {
        degradedReasons: [
          'connector filesystem-export is degraded: connectors-core bundle is not installed',
          'domain pack omics is degraded: domain-packs-core bundle is not installed'
        ]
      }
    });

    assert.equal(result.ready, false);
    assert.equal(result.runtimeOpened, false);
    assert.deepEqual(issueCodes(result.blockers), [
      'E_L0_REQUIRED_CONNECTOR_DEGRADED',
      'E_L0_REQUIRED_DOMAIN_PACK_DEGRADED'
    ]);
  });
});
