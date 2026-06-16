import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluatePhase11ResearchPacket,
  makePhase11ResearchPacketFixture
} from '../../phase11/research-packet.js';

function expectIssue(overrides, code) {
  const packet = makePhase11ResearchPacketFixture(overrides);
  const result = evaluatePhase11ResearchPacket(packet);

  assert.equal(result.ok, false, JSON.stringify(result, null, 2));
  assert.equal(
    result.issues.some((issue) => issue.code === code),
    true,
    JSON.stringify(result.issues, null, 2)
  );
}

test('valid blocked scaffold packet is non-promotional and non-executing', () => {
  const result = evaluatePhase11ResearchPacket(makePhase11ResearchPacketFixture());

  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.equal(result.decision, 'packet-scaffold-ready');
  assert.equal(result.claimReady, false);
  assert.equal(result.performsAnalysis, false);
  assert.equal(result.promotesClaim, false);
  assert.equal(result.usesExistingExperimentSurfaces, true);
});

test('missing dataset inventory evidence rejects', () => {
  expectIssue({ datasetInventory: { evidencePath: '' } }, 'E_PHASE11_PACKET_DATASET_EVIDENCE_REQUIRED');
});

test('stub-blocked dataset cannot be selected for execution', () => {
  expectIssue({
    datasets: [
      {
        datasetId: 'gse111976-full-h5ad',
        sourceAccession: 'GSE111976',
        path: 'data/GSE111976/GSE111976_full.h5ad',
        status: 'STUB_BLOCKED_FOR_H5AD_USE',
        sha256: '26c4d449'.padEnd(64, '0'),
        hashDeferredReason: null,
        selectedForExecution: true,
        cellTypeAnnotation: { status: 'absent', key: null, derivationPlanRef: null }
      }
    ]
  }, 'E_PHASE11_STUB_DATASET_SELECTED');
});

test('quantitative supported finding without LAW 9 harness rejects', () => {
  expectIssue({
    draftFinding: {
      status: 'supported',
      claimType: 'quantitative',
      target: 'CXCL13+ CD8',
      requiresCellTypeAnnotation: true,
      confounderStatus: 'controlled',
      medicalReviewRequired: true
    }
  }, 'E_PHASE11_LAW9_HARNESS_INCOMPLETE');
});

test('confounderStatus string without full harness rejects', () => {
  expectIssue({
    draftFinding: { confounderStatus: 'controlled' },
    law9Harness: { conditionedCohort: { status: 'open', evidenceRefs: [] } }
  }, 'E_PHASE11_CONFOUNDER_STATUS_NOT_HARNESS');
});

test('CD8 finding cannot assume absent cell-type annotation', () => {
  expectIssue({
    draftFinding: {
      status: 'supported',
      claimType: 'quantitative',
      target: 'CXCL13+ CD8',
      requiresCellTypeAnnotation: true,
      confounderStatus: 'open',
      medicalReviewRequired: true
    }
  }, 'E_PHASE11_CELL_TYPE_ANNOTATION_REQUIRED');
});

test('prior CORE confounder reports are required', () => {
  expectIssue({ sourceRefs: [] }, 'E_PHASE11_PRIOR_CONFOUNDER_REFS_REQUIRED');
});

test('result artifacts need hash or deferred-hash reason', () => {
  expectIssue({
    resultArtifacts: [
      {
        path: 'outputs/result.csv',
        sizeBytes: 10,
        sha256: null,
        hashDeferredReason: null
      }
    ]
  }, 'E_PHASE11_RESULT_ARTIFACT_HASH_REQUIRED');
});

test('scratch analysis script cannot be treated as reviewed authority', () => {
  expectIssue({
    experiment: {
      analysisManifestRef: 'analysis/scripts/hgsoc_cd8_subset.py'
    }
  }, 'E_PHASE11_SCRATCH_SCRIPT_FORBIDDEN');
});

test('missing seam log rejects', () => {
  expectIssue({ seamLog: [] }, 'E_PHASE11_SEAM_LOG_REQUIRED');
});
