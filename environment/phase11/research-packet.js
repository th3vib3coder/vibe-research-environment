import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const EXPECTED_SURFACE_REFS = Object.freeze({
  experimentManifestSchema: 'experiment-manifest.schema.json',
  experimentBundleManifestSchema: 'experiment-bundle-manifest.schema.json',
  experimentRegisterInputSchema: 'experiment-register-input.schema.json',
  analysisManifestSchema: 'phase9-analysis-manifest.schema.json',
  resultsBundleDiscoverInputSchema: 'results-bundle-discover-input.schema.json'
});

const REQUIRED_PRIOR_CONFOUNDER_REPORTS = Object.freeze([
  'reports_v2/CORE/R2_response_study_tissue_confounding.md',
  'reports_v2/CORE/FIX_study_id_reintegration_report.md'
]);

const REQUIRED_LAW9_KEYS = Object.freeze([
  'rawCohort',
  'conditionedCohort',
  'matchedComparison',
  'batchKey',
  'donorPatientKey',
  'studySourceKey',
  'doubletSignal',
  'ambientRna',
  'crossPatientReproducibility'
]);

const PROMOTIONAL_STATUSES = Object.freeze(['supported', 'conclusive']);
const SCRATCH_ANALYSIS_PATH = 'analysis/scripts/hgsoc_cd8_subset.py';

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

function addIssue(issues, code, message, pathValue = null) {
  issues.push({ code, message, path: pathValue });
}

function hasHashOrDeferredReason(item) {
  return typeof item?.sha256 === 'string' && item.sha256.length > 0
    || typeof item?.hashDeferredReason === 'string' && item.hashDeferredReason.trim() !== '';
}

function hasDatasetEvidence(packet) {
  return typeof packet?.datasetInventory?.evidencePath === 'string'
    && packet.datasetInventory.evidencePath.trim() !== ''
    && typeof packet.datasetInventory.evidenceSha256 === 'string'
    && packet.datasetInventory.evidenceSha256.trim() !== '';
}

function isStubBlockedDataset(dataset) {
  return dataset?.status === 'STUB_BLOCKED_FOR_H5AD_USE'
    || dataset?.datasetId === 'gse111976-full-h5ad'
    || /GSE111976_full\.h5ad/u.test(dataset?.path ?? '');
}

function law9HarnessComplete(harness) {
  if (!harness || harness.quantitativeClaimPath !== 'READY_FOR_QUANTITATIVE_CLAIM') {
    return false;
  }
  return REQUIRED_LAW9_KEYS.every((key) => harness[key]?.status === 'complete');
}

function hasRequiredPriorConfounderRefs(packet) {
  const paths = new Set((packet.sourceRefs ?? [])
    .filter((ref) => ref.role === 'prior-confounder-report')
    .map((ref) => ref.path));
  return REQUIRED_PRIOR_CONFOUNDER_REPORTS.every((requiredPath) => paths.has(requiredPath));
}

function hasUsableCellTypeAnnotation(packet) {
  const datasets = packet.datasets ?? [];
  if (datasets.length === 0) return false;
  return datasets.every((dataset) => {
    const annotation = dataset.cellTypeAnnotation ?? {};
    if (annotation.status === 'present' || annotation.status === 'derived-reviewed') {
      return true;
    }
    return typeof annotation.derivationPlanRef === 'string'
      && annotation.derivationPlanRef.trim() !== ''
      && packet.draftFinding?.status !== 'supported'
      && packet.draftFinding?.status !== 'conclusive';
  });
}

function surfacePath(surfaceFile) {
  return path.join(repoRoot, 'environment', 'schemas', surfaceFile);
}

function validateSurfaceRefs(packet, issues) {
  const refs = packet.surfaceRefs ?? {};
  for (const [key, expectedFile] of Object.entries(EXPECTED_SURFACE_REFS)) {
    if (refs[key] !== expectedFile) {
      addIssue(
        issues,
        'E_PHASE11_SURFACE_REF_UNKNOWN',
        `${key} must reference ${expectedFile}`,
        key
      );
      continue;
    }
    if (!existsSync(surfacePath(expectedFile))) {
      addIssue(
        issues,
        'E_PHASE11_SURFACE_REF_UNRESOLVED',
        `${expectedFile} does not resolve in environment/schemas`,
        expectedFile
      );
    }
  }
}

function validateResultArtifacts(packet, issues) {
  for (const artifact of packet.resultArtifacts ?? []) {
    const hasPath = typeof artifact.path === 'string' && artifact.path.trim() !== '';
    const hasSize = Number.isInteger(artifact.sizeBytes) && artifact.sizeBytes >= 0;
    if (!hasPath || !hasSize || !hasHashOrDeferredReason(artifact)) {
      addIssue(
        issues,
        'E_PHASE11_RESULT_ARTIFACT_HASH_REQUIRED',
        'Result artifacts require path, size, and sha256 or deferred-hash reason.',
        artifact.path ?? null
      );
    }
  }
}

function validateScratchPaths(packet, issues) {
  const serialized = JSON.stringify(packet);
  if (serialized.includes(SCRATCH_ANALYSIS_PATH)) {
    addIssue(
      issues,
      'E_PHASE11_SCRATCH_SCRIPT_FORBIDDEN',
      'Scratch analysis script cannot be treated as reviewed packet authority.',
      SCRATCH_ANALYSIS_PATH
    );
  }
}

export function makePhase11ResearchPacketFixture(overrides = {}) {
  const base = {
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
    surfaceRefs: { ...EXPECTED_SURFACE_REFS },
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
    createdAt: '2026-06-16T00:00:00.000Z',
    createdBy: 'codex'
  };

  return mergeDeep(base, overrides);
}

export function evaluatePhase11ResearchPacket(packet, options = {}) {
  const issues = [];
  const warnings = [];

  if (!hasDatasetEvidence(packet)) {
    addIssue(
      issues,
      'E_PHASE11_PACKET_DATASET_EVIDENCE_REQUIRED',
      'Research packet requires dataset inventory evidence path and hash.',
      'datasetInventory'
    );
  }

  for (const dataset of packet.datasets ?? []) {
    if (!hasHashOrDeferredReason(dataset)) {
      addIssue(
        issues,
        'E_PHASE11_DATASET_HASH_REQUIRED',
        'Dataset rows require sha256 or deferred-hash reason.',
        dataset.datasetId ?? null
      );
    }
    if (dataset.selectedForExecution && isStubBlockedDataset(dataset)) {
      addIssue(
        issues,
        'E_PHASE11_STUB_DATASET_SELECTED',
        'Stub-blocked datasets cannot be selected as executable inputs.',
        dataset.path ?? dataset.datasetId ?? null
      );
    }
  }

  validateSurfaceRefs(packet, issues);

  const finding = packet.draftFinding ?? {};
  const harnessComplete = law9HarnessComplete(packet.law9Harness);
  const promotional = PROMOTIONAL_STATUSES.includes(finding.status);

  if (finding.requiresCellTypeAnnotation && promotional && !hasUsableCellTypeAnnotation(packet)) {
    addIssue(
      issues,
      'E_PHASE11_CELL_TYPE_ANNOTATION_REQUIRED',
      'CD8/CXCL13 findings cannot assume absent cell-type annotation.',
      'draftFinding'
    );
  }

  if (finding.claimType === 'quantitative' && promotional && !harnessComplete) {
    addIssue(
      issues,
      'E_PHASE11_LAW9_HARNESS_INCOMPLETE',
      'Quantitative findings require complete LAW 9 harness evidence.',
      'law9Harness'
    );
  }

  if ((finding.confounderStatus === 'controlled' || finding.confounderStatus === 'resolved')
    && !harnessComplete) {
    addIssue(
      issues,
      'E_PHASE11_CONFOUNDER_STATUS_NOT_HARNESS',
      'confounderStatus cannot replace the raw/conditioned/matched/batch/donor harness.',
      'draftFinding.confounderStatus'
    );
  }

  if (!hasRequiredPriorConfounderRefs(packet)) {
    addIssue(
      issues,
      'E_PHASE11_PRIOR_CONFOUNDER_REFS_REQUIRED',
      'Packet must carry prior CORE confounder report references.',
      'sourceRefs'
    );
  }

  if (!Array.isArray(packet.seamLog) || packet.seamLog.length === 0) {
    addIssue(
      issues,
      'E_PHASE11_SEAM_LOG_REQUIRED',
      'Research packet requires at least one seam log entry.',
      'seamLog'
    );
  }

  validateResultArtifacts(packet, issues);
  validateScratchPaths(packet, issues);

  if (finding.status === 'requires-medical-review') {
    warnings.push({
      code: 'W_PHASE11_MEDICAL_REVIEW_REQUIRED',
      message: 'Packet awaits human medical review before any claim can advance.'
    });
  }

  const ok = issues.length === 0;
  return {
    ok,
    decision: ok ? 'packet-scaffold-ready' : 'packet-scaffold-blocked',
    // T11.0.1 is a packet scaffold only; later execution tasks must earn readiness.
    claimReady: false,
    performsAnalysis: false,
    promotesClaim: false,
    usesExistingExperimentSurfaces: ok,
    issues,
    warnings,
    options
  };
}
