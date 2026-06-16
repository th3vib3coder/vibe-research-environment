import test from 'node:test';

import { ISO_TIME, clone, expectInvalid, expectValid } from './phase10-schema-test-helper.js';

const SCHEMA_FILE = 'phase11-research-packet.schema.json';

const validPacket = {
  schemaVersion: 'phase11.research-packet.v1',
  packetId: 'RP-HGSOC-CXCL13-CD8-001',
  phase: 11,
  wave: '11.0',
  taskId: 'T11.0.1',
  objective: {
    objectiveId: 'OBJ-HGSOC-CXCL13-CD8',
    question: 'Is a CXCL13+ CD8 T-cell subset detectable across HGSOC patients?'
  },
  datasetInventory: {
    evidencePath: 'WIKI_VRE/closures/phase11-t11-0-0-dataset-inventory-evidence-2026-06-16.json',
    evidenceSha256: 'a'.repeat(64),
    closurePath: 'WIKI_VRE/closures/phase11-t11-0-0-dataset-inventory-2026-06-16.md',
    status: 'accepted'
  },
  datasets: [
    {
      datasetId: 'hgsoc-gse184880-core-h5ad-metadata-first',
      sourceAccession: 'GSE184880',
      path: 'data/CORE_10x_scRNA/HGSOC_1_GSM5599225.h5ad',
      status: 'PARTIAL_READY_FOR_NEXT_PACKET_SCAFFOLD_ONLY',
      sha256: 'b'.repeat(64),
      hashDeferredReason: null,
      selectedForExecution: false,
      cellTypeAnnotation: {
        status: 'absent',
        key: null,
        derivationPlanRef: null
      }
    }
  ],
  surfaceRefs: {
    experimentManifestSchema: 'experiment-manifest.schema.json',
    experimentBundleManifestSchema: 'experiment-bundle-manifest.schema.json',
    experimentRegisterInputSchema: 'experiment-register-input.schema.json',
    analysisManifestSchema: 'phase9-analysis-manifest.schema.json',
    resultsBundleDiscoverInputSchema: 'results-bundle-discover-input.schema.json'
  },
  sourceRefs: [
    {
      role: 'prior-confounder-report',
      path: 'reports_v2/CORE/R2_response_study_tissue_confounding.md',
      sha256: 'c'.repeat(64)
    },
    {
      role: 'prior-confounder-report',
      path: 'reports_v2/CORE/FIX_study_id_reintegration_report.md',
      sha256: 'd'.repeat(64)
    }
  ],
  experiment: {
    experimentManifestRef: null,
    analysisManifestRef: null,
    resultBundleRef: null,
    executionStatus: 'not-run'
  },
  resultArtifacts: [],
  draftFinding: {
    status: 'blocked',
    claimType: 'quantitative',
    target: 'CXCL13+ CD8',
    requiresCellTypeAnnotation: true,
    confounderStatus: 'open',
    medicalReviewRequired: true
  },
  law9Harness: {
    rawCohort: { status: 'partial', evidenceRefs: ['counts-layer'] },
    conditionedCohort: { status: 'open', evidenceRefs: [] },
    matchedComparison: { status: 'open', evidenceRefs: [] },
    batchKey: { status: 'present-candidate', evidenceRefs: ['study_id', 'platform'] },
    donorPatientKey: { status: 'partial', evidenceRefs: ['sample_id'] },
    studySourceKey: { status: 'present-candidate', evidenceRefs: ['study_id'] },
    doubletSignal: { status: 'prior-evidence-present', evidenceRefs: ['doublet-report'] },
    ambientRna: { status: 'open', evidenceRefs: [] },
    crossPatientReproducibility: { status: 'open', evidenceRefs: [] },
    quantitativeClaimPath: 'BLOCKED_OR_INCONCLUSIVE_UNTIL_KEY_RESOLVED'
  },
  seamLog: [
    {
      kind: 'missing-annotation',
      description: 'No cell-type annotation key was observed in metadata-only inventory.',
      status: 'open'
    }
  ],
  createdAt: ISO_TIME,
  createdBy: 'codex'
};

test('phase11-research-packet.schema accepts blocked scaffold packet', async () => {
  await expectValid(SCHEMA_FILE, validPacket);
});

test('phase11-research-packet.schema requires dataset inventory evidence', async () => {
  const fixture = clone(validPacket);
  delete fixture.datasetInventory.evidencePath;

  await expectInvalid(SCHEMA_FILE, fixture, /required.*evidencePath|evidencePath/u);
});

test('phase11-research-packet.schema requires named existing surface refs', async () => {
  const fixture = clone(validPacket);
  fixture.surfaceRefs.analysisManifestSchema = 'invented-analysis-manifest.schema.json';

  await expectInvalid(SCHEMA_FILE, fixture, /allowed values|const|enum/u);
});

test('phase11-research-packet.schema requires a LAW 9 harness object', async () => {
  const fixture = clone(validPacket);
  delete fixture.law9Harness;

  await expectInvalid(SCHEMA_FILE, fixture, /required.*law9Harness|law9Harness/u);
});

test('phase11-research-packet.schema requires seam log entries', async () => {
  const fixture = clone(validPacket);
  fixture.seamLog = [];

  await expectInvalid(SCHEMA_FILE, fixture, /fewer than|minItems/u);
});
