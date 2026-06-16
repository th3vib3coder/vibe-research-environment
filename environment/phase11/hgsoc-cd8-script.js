import { createHash } from 'node:crypto';

const REQUIRED_PACKET_SCHEMA = 'phase11.research-packet.v1';
const SCRATCH_ANALYSIS_PATH = 'analysis/scripts/hgsoc_cd8_subset.py';
const REQUIRED_INTERPRETER = Object.freeze({
  interpreterId: 'venv_scrna',
  pythonVersion: '3.13.5'
});
const REQUIRED_DEPENDENCIES = Object.freeze({
  anndata: '0.12.9',
  numpy: '2.3.5'
});
const FORBIDDEN_HEAVY_IMPORTS = Object.freeze(['scanpy', 'numba', 'pynndescent', 'umap']);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function mergeDeep(base, overrides = {}) {
  const output = clone(base);
  for (const [key, value] of Object.entries(overrides)) {
    if (isPlainObject(value) && isPlainObject(output[key])) {
      output[key] = mergeDeep(output[key], value);
    } else {
      output[key] = clone(value);
    }
  }
  return output;
}

function stableValue(value) {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }
  if (!isPlainObject(value)) {
    return value;
  }
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, stableValue(value[key])])
  );
}

function stableHash(value) {
  return createHash('sha256')
    .update(JSON.stringify(stableValue(value)))
    .digest('hex');
}

function addIssue(issues, code, message, pathValue = null) {
  issues.push({ code, message, path: pathValue });
}

export function makeSyntheticHgsocCd8Cells() {
  return [
    {
      cellId: 'synthetic-cell-001',
      patientId: 'P1',
      batchId: 'B1',
      cell_type_reviewed: 'CD8 T cell',
      genes: { CD8A: 4, CD8B: 2, CXCL13: 3 }
    },
    {
      cellId: 'synthetic-cell-002',
      patientId: 'P1',
      batchId: 'B1',
      cell_type_reviewed: 'CD8 T cell',
      genes: { CD8A: 5, CD8B: 3, CXCL13: 0 }
    },
    {
      cellId: 'synthetic-cell-003',
      patientId: 'P2',
      batchId: 'B2',
      cell_type_reviewed: 'CD8 T cell',
      genes: { CD8A: 3, CD8B: 4, CXCL13: 5 }
    },
    {
      cellId: 'synthetic-cell-004',
      patientId: 'P2',
      batchId: 'B2',
      cell_type_reviewed: 'CD8 T cell',
      genes: { CD8A: 6, CD8B: 2, CXCL13: 0 }
    },
    {
      cellId: 'synthetic-cell-005',
      patientId: 'P3',
      batchId: 'B1',
      cell_type_reviewed: 'B cell',
      genes: { MS4A1: 8, CXCL13: 7 }
    },
    {
      cellId: 'synthetic-cell-006',
      patientId: 'P3',
      batchId: 'B2',
      cell_type_reviewed: 'Tumor cell',
      genes: { EPCAM: 9, CXCL13: 1 }
    }
  ];
}

export function makeSyntheticHgsocCd8Fixture() {
  const cells = makeSyntheticHgsocCd8Cells();
  return {
    schemaVersion: 'phase11.hgsoc-cd8-synthetic-fixture.v1',
    seed: 1102,
    source: 'deterministic-in-repo-synthetic-not-real-h5ad',
    cells
  };
}

function makeSyntheticResult(contract) {
  const fixture = makeSyntheticHgsocCd8Fixture();
  const acceptedLabels = new Set(contract.cellTypePolicy.acceptedLabels);
  const markerGene = contract.geneIdPolicy.markerGene;
  const threshold = contract.analysisLogic.cxcl13PositiveThreshold;
  const cd8Cells = fixture.cells.filter((cell) => acceptedLabels.has(cell[contract.cellTypePolicy.key]));
  const cxcl13Positive = cd8Cells.filter((cell) => Number(cell.genes?.[markerGene] ?? 0) > threshold);
  const fraction = cd8Cells.length === 0 ? 0 : cxcl13Positive.length / cd8Cells.length;

  return {
    schemaVersion: 'phase11.hgsoc-cd8-synthetic-output.v1',
    fixtureSha256: stableHash(fixture),
    inputMode: 'synthetic-only',
    cellCount: fixture.cells.length,
    cd8Cells: cd8Cells.length,
    cxcl13PositiveCd8Cells: cxcl13Positive.length,
    cxcl13PositiveFraction: Number(fraction.toFixed(6)),
    claimReady: false,
    performsRealDataAnalysis: false,
    promotesClaim: false
  };
}

function dependencyMap(dependencyPins = []) {
  return new Map(dependencyPins.map((dep) => [dep.name, dep.version]));
}

function importsForbiddenHeavyStack(sourceText, forbiddenImports) {
  if (typeof sourceText !== 'string' || sourceText.trim() === '') {
    return null;
  }
  for (const importName of forbiddenImports) {
    const pattern = new RegExp(
      `^\\s*(?:from\\s+${importName}(?:\\.|\\s)|import\\s+.*\\b${importName}\\b)`,
      'mu'
    );
    if (pattern.test(sourceText)) {
      return importName;
    }
  }
  return null;
}

function hasHash(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
}

export function makeHgsocCd8ScriptContractFixture(overrides = {}) {
  const syntheticResult = makeSyntheticResult({
    cellTypePolicy: {
      key: 'cell_type_reviewed',
      acceptedLabels: ['CD8 T cell']
    },
    geneIdPolicy: { markerGene: 'CXCL13' },
    analysisLogic: { cxcl13PositiveThreshold: 0 }
  });
  const syntheticFixture = makeSyntheticHgsocCd8Fixture();
  const base = {
    schemaVersion: 'phase11.hgsoc-cd8-script-contract.v1',
    scriptId: 'SCRIPT-HGSOC-CD8-CXCL13-SYNTHETIC-001',
    phase: 11,
    wave: '11.0',
    taskId: 'T11.0.2',
    packetRef: {
      packetId: 'RP-HGSOC-CXCL13-CD8-001',
      packetSchemaVersion: REQUIRED_PACKET_SCHEMA,
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
      interpreterId: REQUIRED_INTERPRETER.interpreterId,
      pythonVersion: REQUIRED_INTERPRETER.pythonVersion,
      resolver: 'operator-managed-venv',
      executableHint: '../../venv_scrna/Scripts/python.exe',
      defaultPythonPolicy: 'not-authoritative-for-real-h5ad',
      dependencyPins: [
        { name: 'anndata', version: REQUIRED_DEPENDENCIES.anndata, scope: 'future-real-h5ad-lane' },
        { name: 'numpy', version: REQUIRED_DEPENDENCIES.numpy, scope: 'future-real-h5ad-lane' }
      ],
      deferredHeavyImports: [...FORBIDDEN_HEAVY_IMPORTS]
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
      seed: syntheticFixture.seed,
      generator: 'environment/phase11/hgsoc_cd8_synthetic.py --synthetic-smoke',
      generationMethod: 'deterministic in-repo synthetic cells, not sampled from real h5ad',
      fixtureSha256: stableHash(syntheticFixture),
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
      syntheticOutputSha256: stableHash(syntheticResult),
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
    createdAt: '2026-06-16T00:00:00.000Z',
    createdBy: 'codex'
  };

  return mergeDeep(base, overrides);
}

export function analyzeSyntheticHgsocCd8Fixture(contract = makeHgsocCd8ScriptContractFixture()) {
  return makeSyntheticResult(contract);
}

export function evaluateHgsocCd8ScriptContract(contract, options = {}) {
  const issues = [];

  if (
    !contract.packetRef
    || contract.packetRef.packetSchemaVersion !== REQUIRED_PACKET_SCHEMA
    || typeof contract.packetRef.evidencePath !== 'string'
    || contract.packetRef.evidencePath.trim() === ''
    || !hasHash(contract.packetRef.evidenceSha256)
  ) {
    addIssue(
      issues,
      'E_PHASE11_SCRIPT_PACKET_REF_REQUIRED',
      'Script contract requires the accepted T11.0.1 packet reference and hash.',
      'packetRef'
    );
  }

  if (JSON.stringify(contract).includes(SCRATCH_ANALYSIS_PATH)) {
    addIssue(
      issues,
      'E_PHASE11_SCRIPT_SCRATCH_AUTHORITY_FORBIDDEN',
      'Scratch analysis path cannot be promoted as reviewed authority.',
      SCRATCH_ANALYSIS_PATH
    );
  }

  const pin = contract.environmentPin ?? {};
  if (
    pin.interpreterId !== REQUIRED_INTERPRETER.interpreterId
    || pin.pythonVersion !== REQUIRED_INTERPRETER.pythonVersion
    || pin.defaultPythonPolicy !== 'not-authoritative-for-real-h5ad'
  ) {
    addIssue(
      issues,
      'E_PHASE11_SCRIPT_PINNED_INTERPRETER_REQUIRED',
      'Real h5ad lane must prefer venv_scrna Python 3.13.5, not default Python.',
      'environmentPin'
    );
  }

  const deps = dependencyMap(pin.dependencyPins);
  for (const [name, version] of Object.entries(REQUIRED_DEPENDENCIES)) {
    if (deps.get(name) !== version) {
      addIssue(
        issues,
        'E_PHASE11_SCRIPT_DEP_PIN_REQUIRED',
        `${name} must be pinned to ${version}.`,
        `environmentPin.dependencyPins.${name}`
      );
    }
  }

  const heavyImport = importsForbiddenHeavyStack(
    options.pythonSourceText,
    pin.deferredHeavyImports ?? FORBIDDEN_HEAVY_IMPORTS
  );
  if (heavyImport) {
    addIssue(
      issues,
      'E_PHASE11_SCRIPT_HEAVY_IMPORT_FORBIDDEN',
      `${heavyImport} belongs to the deferred heavy analysis lane.`,
      heavyImport
    );
  }

  const h5ad = contract.h5adReadPolicy ?? {};
  if (
    h5ad.realH5adExecution !== 'deferred'
    || h5ad.requiredReadMode !== 'backed-r'
    || h5ad.rawMatrixLoadPolicy !== 'forbidden-in-t11.0.2'
  ) {
    addIssue(
      issues,
      'E_PHASE11_SCRIPT_H5AD_BACKED_R_REQUIRED',
      'Large h5ad access must stay deferred and backed-r.',
      'h5adReadPolicy'
    );
  }

  const cellType = contract.cellTypePolicy ?? {};
  if (
    cellType.source !== 'derived-reviewed-required'
    || cellType.key !== 'cell_type_reviewed'
    || !cellType.acceptedLabels?.includes('CD8 T cell')
    || cellType.absentAnnotationPolicy !== 'block-quantitative-claim'
  ) {
    addIssue(
      issues,
      'E_PHASE11_SCRIPT_CELL_TYPE_DERIVATION_REQUIRED',
      'CD8 subset must use a reviewed derivation key, not assumed annotations.',
      'cellTypePolicy'
    );
  }

  const geneId = contract.geneIdPolicy ?? {};
  if (
    geneId.primaryKey !== 'gene_symbol'
    || geneId.markerGene !== 'CXCL13'
    || geneId.ambiguityPolicy !== 'fail-closed'
  ) {
    addIssue(
      issues,
      'E_PHASE11_SCRIPT_GENE_ID_FAIL_CLOSED_REQUIRED',
      'Gene-id policy must fail closed on CXCL13 ambiguity.',
      'geneIdPolicy'
    );
  }

  const law9 = contract.law9Boundary ?? {};
  const output = contract.outputContract ?? {};
  if (
    law9.quantitativeClaimStatus !== 'blocked'
    || law9.confounderStatus !== 'open'
    || law9.packetHarnessRequired !== true
    || output.claimReady !== false
    || output.promotesClaim !== false
  ) {
    addIssue(
      issues,
      'E_PHASE11_SCRIPT_LAW9_BLOCK_REQUIRED',
      'Synthetic smoke output cannot promote a quantitative claim before LAW 9 is complete.',
      'law9Boundary'
    );
  }

  if (!hasHash(output.syntheticOutputSha256)) {
    addIssue(
      issues,
      'E_PHASE11_SCRIPT_OUTPUT_HASH_REQUIRED',
      'Synthetic output hash is required for reproducible script evidence.',
      'outputContract.syntheticOutputSha256'
    );
  }

  const boundary = contract.executionBoundary ?? {};
  if (
    boundary.mode !== 'synthetic-only'
    || boundary.noRealDataExecutionInTask !== true
    || boundary.syntheticFixtureOnly !== true
    || !boundary.forbiddenRealDataAccessions?.includes('GSE184880')
  ) {
    addIssue(
      issues,
      'E_PHASE11_SCRIPT_REAL_DATA_FORBIDDEN',
      'T11.0.2 is script formalization only; real GSE184880 execution is deferred.',
      'executionBoundary'
    );
  }

  if (
    !boundary.forbiddenDatasetIds?.includes('gse111976-full-h5ad')
    || h5ad.stubDatasetPolicy !== 'block-gse111976-full-h5ad'
  ) {
    addIssue(
      issues,
      'E_PHASE11_SCRIPT_STUB_BLOCK_REQUIRED',
      'The GSE111976 800-byte stub must remain blocked from execution.',
      'executionBoundary.forbiddenDatasetIds'
    );
  }

  const syntheticResult = makeSyntheticResult(contract);
  if (contract.syntheticFixture?.fixtureSha256 !== syntheticResult.fixtureSha256) {
    addIssue(
      issues,
      'E_PHASE11_SCRIPT_FIXTURE_HASH_MISMATCH',
      'Synthetic fixture hash must match the deterministic generated cells.',
      'syntheticFixture.fixtureSha256'
    );
  }
  if (output.syntheticOutputSha256 !== stableHash(syntheticResult)) {
    addIssue(
      issues,
      'E_PHASE11_SCRIPT_OUTPUT_HASH_MISMATCH',
      'Synthetic output hash must match the deterministic core logic result.',
      'outputContract.syntheticOutputSha256'
    );
  }

  const ok = issues.length === 0;
  return {
    ok,
    decision: ok ? 'script-contract-ready-for-synthetic-smoke' : 'script-contract-blocked',
    claimReady: false,
    performsRealDataAnalysis: false,
    promotesClaim: false,
    issues,
    options
  };
}
