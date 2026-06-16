import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateFirstResearchPacketExecution,
  makeFirstResearchPacketExecutionFixture
} from '../../phase11/first-research-packet.js';

function expectIssue(overrides, code) {
  const execution = makeFirstResearchPacketExecutionFixture(overrides);
  const result = evaluateFirstResearchPacketExecution(execution);

  assert.equal(result.ok, false, JSON.stringify(result, null, 2));
  assert.equal(
    result.issues.some((issue) => issue.code === code),
    true,
    JSON.stringify(result.issues, null, 2)
  );
}

test('valid T11.0.3 blocked packet is actionable and non-claiming', () => {
  const result = evaluateFirstResearchPacketExecution(
    makeFirstResearchPacketExecutionFixture()
  );

  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.equal(result.decision, 'first-research-packet-blocked-actionable');
  assert.equal(result.claimReady, false);
  assert.equal(result.performsRealDataAnalysis, true);
  assert.equal(result.realDataReadInCi, false);
  assert.equal(result.promotesClaim, false);
  assert.equal(result.reusesResearchPacketSchema, true);
});

test('selected H5AD hashes must match the accepted inventory', () => {
  expectIssue({
    executionEvidence: {
      selectedH5adFiles: [
        {
          relativePath: 'data/CORE_10x_scRNA/HGSOC_1_GSM5599225.h5ad',
          inventorySha256: 'be2839e88063a6c087bc9178bdff3d29d714bfe86593f6bd495067b140cfa943',
          executionSha256: '0'.repeat(64),
          hashRecomputedAt: '2026-06-16T00:00:00.000Z',
          hashMatchesInventory: false,
          readStatus: 'PASS_BACKED_R_METADATA_ONLY',
          nObs: 5764,
          nVars: 20054,
          cxcl13GeneSymbolPresent: true
        }
      ]
    }
  }, 'E_PHASE11_EXEC_HASH_MISMATCH');
});

test('execution-time hash recomputation evidence is required', () => {
  expectIssue({
    executionEvidence: {
      selectedH5adFiles: [
        {
          relativePath: 'data/CORE_10x_scRNA/HGSOC_1_GSM5599225.h5ad',
          inventorySha256: 'be2839e88063a6c087bc9178bdff3d29d714bfe86593f6bd495067b140cfa943',
          executionSha256: 'be2839e88063a6c087bc9178bdff3d29d714bfe86593f6bd495067b140cfa943',
          hashRecomputedAt: '',
          hashMatchesInventory: true,
          readStatus: 'PASS_BACKED_R_METADATA_ONLY',
          nObs: 5764,
          nVars: 20054,
          cxcl13GeneSymbolPresent: true
        }
      ]
    }
  }, 'E_PHASE11_EXEC_HASH_RECOMPUTE_REQUIRED');
});

test('real H5AD reads must stay local and out of CI', () => {
  expectIssue({
    executionEvidence: {
      realDataReadBoundary: { localOnly: false, ciFixtureOnly: false, readInCi: true }
    }
  }, 'E_PHASE11_EXEC_REAL_READ_IN_CI_FORBIDDEN');
});

test('pinned interpreter and dependencies are required for local real reads', () => {
  expectIssue({
    executionEvidence: {
      environment: {
        interpreterId: 'python',
        pythonVersion: '3.14.0',
        anndataVersion: '0.12.9',
        numpyVersion: '2.3.5'
      }
    }
  }, 'E_PHASE11_EXEC_PINNED_ENV_REQUIRED');
});

test('H5AD read mode must be backed-r', () => {
  expectIssue({
    executionEvidence: {
      h5adReadMode: 'memory'
    }
  }, 'E_PHASE11_EXEC_BACKED_R_REQUIRED');
});

test('GSE111976 stub cannot be selected as executable input', () => {
  expectIssue({
    packet: {
      datasets: [
        {
          datasetId: 'gse111976-full-h5ad',
          sourceAccession: 'GSE111976',
          path: 'data/GSE111976/GSE111976_full.h5ad',
          status: 'STUB_BLOCKED_FOR_H5AD_USE',
          sha256: '26c4d449632ea072317c16e9d4857e419b67e1b7751f81a89a87c8e75fe9484e',
          hashDeferredReason: null,
          selectedForExecution: true,
          cellTypeAnnotation: { status: 'absent', key: null, derivationPlanRef: null }
        }
      ]
    }
  }, 'E_PHASE11_STUB_DATASET_SELECTED');
});

test('claim-ready or supported packets reject', () => {
  expectIssue({
    packet: {
      draftFinding: {
        status: 'supported',
        claimType: 'quantitative',
        target: 'CXCL13+ CD8',
        requiresCellTypeAnnotation: true,
        confounderStatus: 'controlled',
        medicalReviewRequired: false
      }
    },
    executionEvidence: { claimReady: true, promotesClaim: true }
  }, 'E_PHASE11_EXEC_CLAIM_PROMOTION_FORBIDDEN');
});

test('CD8 fraction cannot appear without reviewed CD8 derivation evidence', () => {
  expectIssue({
    executionEvidence: {
      quantitativeOutputs: {
        cd8Cells: 100,
        cxcl13PositiveCd8Cells: 20,
        cxcl13PositiveFraction: 0.2
      }
    }
  }, 'E_PHASE11_EXEC_CD8_DERIVATION_REQUIRED');
});

test('blocked packet must include actionable unblock conditions', () => {
  expectIssue({
    executionEvidence: {
      blocker: {
        reason: 'blocked',
        unblockConditions: [],
        followUpOwner: ''
      }
    }
  }, 'E_PHASE11_EXEC_BLOCKER_UNACTIONABLE');
});

test('LAW 9 cannot be closed by a confounderStatus string', () => {
  expectIssue({
    packet: {
      draftFinding: { confounderStatus: 'controlled' }
    }
  }, 'E_PHASE11_CONFOUNDER_STATUS_NOT_HARNESS');
});

test('prior CORE confounder evidence is required', () => {
  expectIssue({
    packet: { sourceRefs: [] }
  }, 'E_PHASE11_PRIOR_CONFOUNDER_REFS_REQUIRED');
});

test('result artifact hash or deferred-hash reason is required', () => {
  expectIssue({
    packet: {
      resultArtifacts: [
        {
          path: 'WIKI_VRE/closures/phase11-t11-0-3-evidence.json',
          sizeBytes: 10,
          sha256: null,
          hashDeferredReason: null
        }
      ]
    }
  }, 'E_PHASE11_RESULT_ARTIFACT_HASH_REQUIRED');
});

test('scratch script cannot be execution authority', () => {
  expectIssue({
    executionEvidence: {
      authorityRefs: ['analysis/scripts/hgsoc_cd8_subset.py']
    }
  }, 'E_PHASE11_EXEC_SCRATCH_AUTHORITY_FORBIDDEN');
});

test('packet must reuse phase11.research-packet.v1', () => {
  expectIssue({
    packet: { schemaVersion: 'phase11.first-research-packet.v1' }
  }, 'E_PHASE11_EXEC_SCHEMA_REUSE_REQUIRED');
});

test('CXCL13 gene-symbol availability must be verified', () => {
  expectIssue({
    executionEvidence: {
      selectedH5adFiles: [
        {
          relativePath: 'data/CORE_10x_scRNA/HGSOC_1_GSM5599225.h5ad',
          inventorySha256: 'be2839e88063a6c087bc9178bdff3d29d714bfe86593f6bd495067b140cfa943',
          executionSha256: 'be2839e88063a6c087bc9178bdff3d29d714bfe86593f6bd495067b140cfa943',
          hashRecomputedAt: '2026-06-16T00:00:00.000Z',
          hashMatchesInventory: true,
          readStatus: 'PASS_BACKED_R_METADATA_ONLY',
          nObs: 5764,
          nVars: 20054,
          cxcl13GeneSymbolPresent: false
        }
      ]
    }
  }, 'E_PHASE11_EXEC_CXCL13_GENE_SYMBOL_REQUIRED');
});
