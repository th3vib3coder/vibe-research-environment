import test from 'node:test';

import { ISO_TIME, clone, expectInvalid, expectValid } from './phase10-schema-test-helper.js';

const SCHEMA_FILE = 'phase11-scientific-derivation-harness.schema.json';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);

const validHarness = {
  schemaVersion: 'phase11.scientific-derivation-harness.v1',
  artifactId: 'SDH-HGSOC-CD8-LAW9-READY-FIXTURE-001',
  phase: 11,
  wave: '11.1',
  taskId: 'T11.1.0',
  packetRef: {
    packetId: 'RP-HGSOC-CXCL13-CD8-001',
    packetTaskId: 'T11.0.3',
    packetSchemaVersion: 'phase11.research-packet.v1',
    evidencePath: 'WIKI_VRE/closures/phase11-t11-0-3-first-research-packet-evidence-2026-06-16.json',
    evidenceSha256: HASH_A
  },
  datasetInventoryRef: {
    evidencePath: 'WIKI_VRE/closures/phase11-t11-0-0-dataset-inventory-evidence-2026-06-16.json',
    evidenceSha256: HASH_B,
    selectedSlice: 'GSE184880-HGSOC'
  },
  cd8Derivation: {
    status: 'reviewed-accepted',
    derivationType: 'human-reviewed-celltype-key',
    reviewedCellTypeKey: 'cell_type_reviewed',
    acceptedLabels: ['CD8 T cell'],
    markerPolicy: {
      requiredMarkers: ['CD3D', 'CD8A', 'CD8B'],
      exclusionMarkers: ['MS4A1'],
      decisionRule: 'reviewed-key-primary-markers-supporting'
    },
    humanReview: {
      reviewerId: 'elisa-medical-operator',
      reviewerRole: 'medical-operator',
      decision: 'accepted',
      decidedAt: ISO_TIME,
      decisionArtifactPath: 'WIKI_VRE/closures/phase11-cd8-derivation-review-fixture.md',
      decisionArtifactSha256: HASH_C,
      agentSelfReview: false
    },
    evidenceRefs: [
      {
        role: 'review-record',
        path: 'WIKI_VRE/closures/phase11-cd8-derivation-review-fixture.md',
        sha256: HASH_C
      }
    ]
  },
  law9Harness: {
    quantitativeClaimPath: 'READY_FOR_QUANTITATIVE_CLAIM',
    components: {
      rawCohort: completeComponent('rawCohort', 'cohort-definition'),
      conditionedCohort: completeComponent('conditionedCohort', 'conditioning-step'),
      matchedComparison: completeComponent('matchedComparison', 'matching-step'),
      batchKey: completeComponent('batchKey', 'batch-control', batchMetric()),
      donorPatientKey: completeComponent('donorPatientKey', 'donor-control'),
      studySourceKey: completeComponent('studySourceKey', 'study-source-control', batchMetric()),
      doubletSignal: completeComponent('doubletSignal', 'doublet-control'),
      ambientRna: completeComponent('ambientRna', 'ambient-rna-control'),
      crossPatientReproducibility: completeComponent(
        'crossPatientReproducibility',
        'replication-control'
      )
    }
  },
  readiness: {
    readyForQuantitativeRun: true,
    prohibitsFractionInThisTask: true,
    nextAllowedTask: 'T11.1.1'
  },
  createdAt: ISO_TIME,
  createdBy: 'codex'
};

function batchMetric() {
  return {
    metricName: 'iLISI',
    value: 1.6,
    threshold: 1.5,
    direction: 'gte',
    passed: true,
    evidenceRef: 'reports_v2/CORE/step_06_metrics_scIB_report.md'
  };
}

function completeComponent(componentId, kind, metric = null) {
  return {
    componentId,
    status: 'complete',
    evidenceRefs: ['reports_v2/CORE/step_06_metrics_scIB_report.md'],
    controlEvidence: {
      kind,
      method: `${kind}-reviewed-method`,
      summary: `${componentId} has reviewed control evidence.`,
      decision: 'passed',
      artifactPath: `WIKI_VRE/closures/${componentId}-control-fixture.md`,
      artifactSha256: HASH_A,
      metric
    }
  };
}

test('phase11-scientific-derivation-harness.schema accepts complete fixture', async () => {
  await expectValid(SCHEMA_FILE, validHarness);
});

test('phase11-scientific-derivation-harness.schema requires human review', async () => {
  const fixture = clone(validHarness);
  delete fixture.cd8Derivation.humanReview;

  await expectInvalid(SCHEMA_FILE, fixture, /required.*humanReview|humanReview/u);
});

test('phase11-scientific-derivation-harness.schema rejects agent self review', async () => {
  const fixture = clone(validHarness);
  fixture.cd8Derivation.humanReview.agentSelfReview = true;

  await expectInvalid(SCHEMA_FILE, fixture, /allowed values|const/u);
});

test('phase11-scientific-derivation-harness.schema requires LAW 9 components', async () => {
  const fixture = clone(validHarness);
  delete fixture.law9Harness.components.batchKey;

  await expectInvalid(SCHEMA_FILE, fixture, /required.*batchKey|batchKey/u);
});

test('phase11-scientific-derivation-harness.schema rejects fraction fields', async () => {
  const fixture = clone(validHarness);
  fixture.readiness.cxcl13PositiveFraction = 0.5;

  await expectInvalid(SCHEMA_FILE, fixture, /additional properties/u);
});
