import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateScientificDerivationHarness,
  makeReadyScientificDerivationHarnessFixture,
  makeScientificDerivationHarnessFixture
} from '../../phase11/scientific-derivation-harness.js';

function expectIssue(overrides, code) {
  const artifact = makeReadyScientificDerivationHarnessFixture(overrides);
  const result = evaluateScientificDerivationHarness(artifact);

  assert.equal(result.ok, false, JSON.stringify(result, null, 2));
  assert.equal(
    result.issues.some((issue) => issue.code === code),
    true,
    JSON.stringify(result.issues, null, 2)
  );
}

test('blocked fixture is valid but not ready for quantitative run', () => {
  const artifact = makeScientificDerivationHarnessFixture();
  const result = evaluateScientificDerivationHarness(artifact);

  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.equal(result.readyForQuantitativeRun, false);
  assert.equal(result.promotesClaim, false);
  assert.equal(result.computesFraction, false);
});

test('complete reviewed fixture is ready without computing a fraction', () => {
  const artifact = makeReadyScientificDerivationHarnessFixture();
  const result = evaluateScientificDerivationHarness(artifact);

  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.equal(result.readyForQuantitativeRun, true);
  assert.equal(result.decision, 'scientific-derivation-harness-ready');
  assert.equal(result.promotesClaim, false);
  assert.equal(result.computesFraction, false);
});

test('CD8 derivation with no human review record rejects', () => {
  expectIssue({
    cd8Derivation: { humanReview: null }
  }, 'E_PHASE11_DERIVATION_HUMAN_REVIEW_REQUIRED');
});

test('agent self-review cannot satisfy reviewed derivation', () => {
  expectIssue({
    cd8Derivation: {
      humanReview: { reviewerId: 'codex', reviewerRole: 'agent', agentSelfReview: true }
    }
  }, 'E_PHASE11_DERIVATION_AGENT_REVIEW_FORBIDDEN');
});

test('human review record requires decision timestamp', () => {
  expectIssue({
    cd8Derivation: {
      humanReview: { decidedAt: '' }
    }
  }, 'E_PHASE11_DERIVATION_HUMAN_REVIEW_REQUIRED');
});

test('present cell type annotation without review cannot unlock readiness', () => {
  expectIssue({
    cd8Derivation: {
      status: 'present-unreviewed',
      derivationType: 'metadata-key',
      humanReview: null
    }
  }, 'E_PHASE11_DERIVATION_REVIEWED_STATUS_REQUIRED');
});

test('scratch analysis script cannot be authority', () => {
  expectIssue({
    cd8Derivation: {
      evidenceRefs: [
        {
          role: 'review-record',
          path: 'analysis/scripts/hgsoc_cd8_subset.py',
          sha256: 'c'.repeat(64)
        }
      ]
    }
  }, 'E_PHASE11_DERIVATION_SCRATCH_AUTHORITY_FORBIDDEN');
});

test('unreviewed marker policy rejects', () => {
  expectIssue({
    cd8Derivation: {
      markerPolicy: { decisionRule: 'agent-inferred-markers' }
    }
  }, 'E_PHASE11_DERIVATION_MARKER_POLICY_REVIEW_REQUIRED');
});

test('missing packet or inventory hash rejects', () => {
  expectIssue({
    packetRef: { evidenceSha256: '' },
    datasetInventoryRef: { evidenceSha256: '' }
  }, 'E_PHASE11_HARNESS_EVIDENCE_HASH_REQUIRED');
});

test('confounderStatus string cannot replace LAW 9 evidence', () => {
  expectIssue({
    law9Harness: { confounderStatus: 'controlled' }
  }, 'E_PHASE11_LAW9_CONFOUNDER_STATUS_FORBIDDEN');
});

test('batch key complete requires passing metric evidence', () => {
  expectIssue({
    law9Harness: {
      components: {
        batchKey: {
          controlEvidence: {
            metric: { metricName: 'iLISI', value: 1.313, threshold: 1.5, passed: false }
          }
        }
      }
    }
  }, 'E_PHASE11_LAW9_METRIC_THRESHOLD_FAILED');
});

test('donor/patient key complete requires control evidence', () => {
  expectIssue({
    law9Harness: {
      components: {
        donorPatientKey: { status: 'complete', controlEvidence: { artifactSha256: '' } }
      }
    }
  }, 'E_PHASE11_LAW9_CONTROL_EVIDENCE_REQUIRED');
});

test('ambient RNA and doublet components cannot stay open', () => {
  expectIssue({
    law9Harness: {
      components: {
        ambientRna: { status: 'open' },
        doubletSignal: { status: 'open' }
      }
    }
  }, 'E_PHASE11_LAW9_COMPONENT_INCOMPLETE');
});

test('cross-patient reproducibility cannot stay partial', () => {
  expectIssue({
    law9Harness: {
      components: {
        crossPatientReproducibility: { status: 'partial' }
      }
    }
  }, 'E_PHASE11_LAW9_COMPONENT_INCOMPLETE');
});

test('READY path with any open component rejects', () => {
  expectIssue({
    law9Harness: {
      quantitativeClaimPath: 'READY_FOR_QUANTITATIVE_CLAIM',
      components: {
        matchedComparison: { status: 'open' }
      }
    }
  }, 'E_PHASE11_LAW9_READY_WITH_OPEN_COMPONENT');
});

test('fraction/count/denominator fields reject in this task', () => {
  expectIssue({
    readiness: { cxcl13PositiveFraction: 0.5, cd8Cells: 100, denominator: 100 }
  }, 'E_PHASE11_HARNESS_FRACTION_FORBIDDEN');
});

test('quantitative output aliases reject even when nested', () => {
  expectIssue({
    readiness: {
      quantitativeOutputs: {
        fraction: 0.5,
        count: 12,
        cd8Denominator: 100
      }
    }
  }, 'E_PHASE11_HARNESS_FRACTION_FORBIDDEN');
});

test('GSE111976 stub or wrong slice rejects', () => {
  expectIssue({
    datasetInventoryRef: { selectedSlice: 'GSE111976_full.h5ad' }
  }, 'E_PHASE11_HARNESS_WRONG_SLICE_FORBIDDEN');
});
