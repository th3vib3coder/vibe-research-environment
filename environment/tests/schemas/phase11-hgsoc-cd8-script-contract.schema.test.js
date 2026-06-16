import test from 'node:test';

import { ISO_TIME, clone, expectInvalid, expectValid } from './phase10-schema-test-helper.js';

const SCHEMA_FILE = 'phase11-hgsoc-cd8-script-contract.schema.json';

const validContract = {
  schemaVersion: 'phase11.hgsoc-cd8-script-contract.v1',
  scriptId: 'SCRIPT-HGSOC-CD8-CXCL13-SYNTHETIC-001',
  phase: 11,
  wave: '11.0',
  taskId: 'T11.0.2',
  packetRef: {
    packetId: 'RP-HGSOC-CXCL13-CD8-001',
    packetSchemaVersion: 'phase11.research-packet.v1',
    packetTaskId: 'T11.0.1',
    evidencePath: 'environment/phase11/research-packet.js',
    evidenceSha256: 'a'.repeat(64)
  },
  datasetInventoryRef: {
    evidencePath: 'WIKI_VRE/closures/phase11-t11-0-0-dataset-inventory-evidence-2026-06-16.json',
    closurePath: 'WIKI_VRE/closures/phase11-t11-0-0-dataset-inventory-2026-06-16.md',
    evidenceSha256: 'b'.repeat(64),
    status: 'accepted'
  },
  executionBoundary: {
    mode: 'synthetic-only',
    noRealDataExecutionInTask: true,
    syntheticFixtureOnly: true,
    forbiddenDatasetIds: ['gse111976-full-h5ad'],
    forbiddenRealDataAccessions: ['GSE184880', 'GSE111976'],
    deferredRealDataTask: 'T11.0.3'
  },
  environmentPin: {
    interpreterId: 'venv_scrna',
    pythonVersion: '3.13.5',
    resolver: 'operator-managed-venv',
    executableHint: '../../venv_scrna/Scripts/python.exe',
    defaultPythonPolicy: 'not-authoritative-for-real-h5ad',
    dependencyPins: [
      { name: 'anndata', version: '0.12.9', scope: 'future-real-h5ad-lane' },
      { name: 'numpy', version: '2.3.5', scope: 'future-real-h5ad-lane' }
    ],
    deferredHeavyImports: ['scanpy', 'numba', 'pynndescent', 'umap']
  },
  h5adReadPolicy: {
    realH5adExecution: 'deferred',
    requiredReadMode: 'backed-r',
    rawMatrixLoadPolicy: 'forbidden-in-t11.0.2',
    stubDatasetPolicy: 'block-gse111976-full-h5ad'
  },
  cellTypePolicy: {
    source: 'derived-reviewed-required',
    key: 'cell_type_reviewed',
    acceptedLabels: ['CD8 T cell'],
    absentAnnotationPolicy: 'block-quantitative-claim'
  },
  geneIdPolicy: {
    primaryKey: 'gene_symbol',
    allowedAlternateKeys: ['ensembl_id'],
    markerGene: 'CXCL13',
    ambiguityPolicy: 'fail-closed'
  },
  syntheticFixture: {
    seed: 1102,
    generator: 'environment/phase11/hgsoc_cd8_synthetic.py --synthetic-smoke',
    generationMethod: 'deterministic in-repo synthetic cells, not sampled from real h5ad',
    fixtureSha256: 'c'.repeat(64),
    expectedCellCount: 6,
    expectedCd8CellCount: 4
  },
  analysisLogic: {
    denominator: 'derived-cd8-cells-only',
    cxcl13PositiveThreshold: 0,
    expectedCxcl13PositiveCd8Cells: 2,
    expectedCxcl13PositiveFraction: 0.5
  },
  law9Boundary: {
    quantitativeClaimStatus: 'blocked',
    confounderStatus: 'open',
    packetHarnessRequired: true,
    medicalReviewRequired: true
  },
  outputContract: {
    resultMode: 'synthetic-smoke-only',
    promotesClaim: false,
    claimReady: false,
    performsRealDataAnalysis: false,
    syntheticOutputSha256: 'd'.repeat(64),
    requiredKeys: [
      'fixtureSha256',
      'cd8Cells',
      'cxcl13PositiveCd8Cells',
      'cxcl13PositiveFraction',
      'claimReady'
    ]
  },
  seamLog: [
    {
      kind: 'environment-pin',
      description: 'Real h5ad execution requires the pinned venv_scrna interpreter.',
      status: 'deferred'
    }
  ],
  createdAt: ISO_TIME,
  createdBy: 'codex'
};

test('phase11-hgsoc-cd8-script-contract.schema accepts synthetic-only contract', async () => {
  await expectValid(SCHEMA_FILE, validContract);
});

test('phase11-hgsoc-cd8-script-contract.schema requires packet reference', async () => {
  const fixture = clone(validContract);
  delete fixture.packetRef;

  await expectInvalid(SCHEMA_FILE, fixture, /required.*packetRef|packetRef/u);
});

test('phase11-hgsoc-cd8-script-contract.schema rejects default Python as authoritative', async () => {
  const fixture = clone(validContract);
  fixture.environmentPin.pythonVersion = '3.14.0';

  await expectInvalid(SCHEMA_FILE, fixture, /allowed values|enum|const/u);
});

test('phase11-hgsoc-cd8-script-contract.schema requires backed h5ad read policy', async () => {
  const fixture = clone(validContract);
  fixture.h5adReadPolicy.requiredReadMode = 'memory';

  await expectInvalid(SCHEMA_FILE, fixture, /allowed values|enum|const/u);
});

test('phase11-hgsoc-cd8-script-contract.schema rejects real-data execution mode', async () => {
  const fixture = clone(validContract);
  fixture.executionBoundary.mode = 'real-data';

  await expectInvalid(SCHEMA_FILE, fixture, /allowed values|enum|const/u);
});

test('phase11-hgsoc-cd8-script-contract.schema requires synthetic output hash', async () => {
  const fixture = clone(validContract);
  delete fixture.outputContract.syntheticOutputSha256;

  await expectInvalid(SCHEMA_FILE, fixture, /required.*syntheticOutputSha256|syntheticOutputSha256/u);
});
