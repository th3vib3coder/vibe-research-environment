import assert from 'node:assert/strict';
import test from 'node:test';

import {
  analyzeSyntheticHgsocCd8Fixture,
  evaluateHgsocCd8ScriptContract,
  makeHgsocCd8ScriptContractFixture
} from '../../phase11/hgsoc-cd8-script.js';

function expectIssue(overrides, code, options = {}) {
  const contract = makeHgsocCd8ScriptContractFixture(overrides);
  const result = evaluateHgsocCd8ScriptContract(contract, options);

  assert.equal(result.ok, false, JSON.stringify(result, null, 2));
  assert.equal(
    result.issues.some((issue) => issue.code === code),
    true,
    JSON.stringify(result.issues, null, 2)
  );
}

test('valid HGSOC CD8 script contract is synthetic-only and non-claiming', () => {
  const contract = makeHgsocCd8ScriptContractFixture();
  const result = evaluateHgsocCd8ScriptContract(contract);

  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.equal(result.decision, 'script-contract-ready-for-synthetic-smoke');
  assert.equal(result.claimReady, false);
  assert.equal(result.performsRealDataAnalysis, false);
  assert.equal(result.promotesClaim, false);
});

test('synthetic CD8/CXCL13 core logic is deterministic', () => {
  const contract = makeHgsocCd8ScriptContractFixture();
  const result = analyzeSyntheticHgsocCd8Fixture(contract);

  assert.equal(result.fixtureSha256, contract.syntheticFixture.fixtureSha256);
  assert.equal(result.cellCount, 6);
  assert.equal(result.cd8Cells, 4);
  assert.equal(result.cxcl13PositiveCd8Cells, 2);
  assert.equal(result.cxcl13PositiveFraction, 0.5);
  assert.equal(result.claimReady, false);
  assert.equal(result.performsRealDataAnalysis, false);
});

test('missing packet reference rejects', () => {
  expectIssue({ packetRef: { evidencePath: '' } }, 'E_PHASE11_SCRIPT_PACKET_REF_REQUIRED');
});

test('scratch script cannot be treated as reviewed authority', () => {
  expectIssue({
    syntheticFixture: { generator: 'analysis/scripts/hgsoc_cd8_subset.py --synthetic-smoke' }
  }, 'E_PHASE11_SCRIPT_SCRATCH_AUTHORITY_FORBIDDEN');
});

test('default Python 3.14 cannot be the real h5ad authority', () => {
  expectIssue({
    environmentPin: { interpreterId: 'python', pythonVersion: '3.14.0' }
  }, 'E_PHASE11_SCRIPT_PINNED_INTERPRETER_REQUIRED');
});

test('dependency pins must be exact for the future h5ad lane', () => {
  expectIssue({
    environmentPin: {
      dependencyPins: [
        { name: 'anndata', version: '0.12.9', scope: 'future-real-h5ad-lane' }
      ]
    }
  }, 'E_PHASE11_SCRIPT_DEP_PIN_REQUIRED');
});

test('large h5ad policy must stay backed-r and deferred', () => {
  expectIssue({
    h5adReadPolicy: {
      realH5adExecution: 'allowed',
      requiredReadMode: 'memory'
    }
  }, 'E_PHASE11_SCRIPT_H5AD_BACKED_R_REQUIRED');
});

test('absent cell-type derivation blocks quantitative path', () => {
  expectIssue({
    cellTypePolicy: { key: null, source: 'assumed-from-cluster' }
  }, 'E_PHASE11_SCRIPT_CELL_TYPE_DERIVATION_REQUIRED');
});

test('ambiguous gene identifier policy rejects', () => {
  expectIssue({
    geneIdPolicy: { primaryKey: 'unknown', ambiguityPolicy: 'prefer-first-match' }
  }, 'E_PHASE11_SCRIPT_GENE_ID_FAIL_CLOSED_REQUIRED');
});

test('quantitative claim path remains blocked by LAW 9 boundary', () => {
  expectIssue({
    law9Boundary: { quantitativeClaimStatus: 'ready', confounderStatus: 'controlled' },
    outputContract: { claimReady: true, promotesClaim: true }
  }, 'E_PHASE11_SCRIPT_LAW9_BLOCK_REQUIRED');
});

test('synthetic output hash is mandatory', () => {
  expectIssue({
    outputContract: { syntheticOutputSha256: '' }
  }, 'E_PHASE11_SCRIPT_OUTPUT_HASH_REQUIRED');
});

test('real data execution is out of scope for T11.0.2', () => {
  expectIssue({
    executionBoundary: { mode: 'real-data', noRealDataExecutionInTask: false }
  }, 'E_PHASE11_SCRIPT_REAL_DATA_FORBIDDEN');
});

test('GSE111976 stub remains blocked', () => {
  expectIssue({
    executionBoundary: { forbiddenDatasetIds: [] }
  }, 'E_PHASE11_SCRIPT_STUB_BLOCK_REQUIRED');
});

test('heavy imports reject the reviewed artifact source', () => {
  expectIssue({}, 'E_PHASE11_SCRIPT_HEAVY_IMPORT_FORBIDDEN', {
    pythonSourceText: 'import scanpy as sc\nimport numpy as np\n'
  });
});
