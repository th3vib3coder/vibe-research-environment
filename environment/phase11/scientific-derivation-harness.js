const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);
const ISO_TIME = '2026-06-16T00:00:00.000Z';

const SCRATCH_ANALYSIS_PATH = 'analysis/scripts/hgsoc_cd8_subset.py';
const WRONG_SLICE_PATTERNS = Object.freeze(['GSE111976', 'GSE111976_full.h5ad']);
const FORBIDDEN_QUANT_FIELDS = Object.freeze([
  'quantitativeOutputs',
  'cxcl13PositiveFraction',
  'cxcl13PositiveCd8Cells',
  'cxcl13PositiveCount',
  'cd8Denominator',
  'cd8Cells',
  'denominator',
  'fraction',
  'count'
]);

const REQUIRED_COMPONENT_KINDS = Object.freeze({
  rawCohort: 'cohort-definition',
  conditionedCohort: 'conditioning-step',
  matchedComparison: 'matching-step',
  batchKey: 'batch-control',
  donorPatientKey: 'donor-control',
  studySourceKey: 'study-source-control',
  doubletSignal: 'doublet-control',
  ambientRna: 'ambient-rna-control',
  crossPatientReproducibility: 'replication-control'
});

const METRIC_REQUIRED_COMPONENTS = Object.freeze(new Set(['batchKey', 'studySourceKey']));

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

function hasHash(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
}

function hasText(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function batchMetric(overrides = {}) {
  return {
    metricName: 'iLISI',
    value: 1.6,
    threshold: 1.5,
    direction: 'gte',
    passed: true,
    evidenceRef: 'reports_v2/CORE/step_06_metrics_scIB_report.md',
    ...overrides
  };
}

function controlEvidence(componentId, kind, metric = null, overrides = {}) {
  return {
    kind,
    method: `${kind}-reviewed-method`,
    summary: `${componentId} has reviewed control evidence.`,
    decision: 'passed',
    artifactPath: `WIKI_VRE/closures/${componentId}-control-fixture.md`,
    artifactSha256: HASH_A,
    metric,
    ...overrides
  };
}

function law9Component(componentId, status = 'open', overrides = {}) {
  const kind = REQUIRED_COMPONENT_KINDS[componentId] ?? 'unknown-control';
  const metric = METRIC_REQUIRED_COMPONENTS.has(componentId) ? batchMetric() : null;
  return mergeDeep({
    componentId,
    status,
    evidenceRefs: status === 'complete'
      ? ['reports_v2/CORE/step_06_metrics_scIB_report.md']
      : [],
    controlEvidence: controlEvidence(componentId, kind, metric)
  }, overrides);
}

function readyLaw9Components() {
  return Object.fromEntries(Object.keys(REQUIRED_COMPONENT_KINDS).map((componentId) => [
    componentId,
    law9Component(componentId, 'complete')
  ]));
}

function blockedLaw9Components() {
  return {
    rawCohort: law9Component('rawCohort', 'partial'),
    conditionedCohort: law9Component('conditionedCohort', 'open'),
    matchedComparison: law9Component('matchedComparison', 'open'),
    batchKey: law9Component('batchKey', 'present-candidate'),
    donorPatientKey: law9Component('donorPatientKey', 'partial'),
    studySourceKey: law9Component('studySourceKey', 'present-candidate'),
    doubletSignal: law9Component('doubletSignal', 'partial'),
    ambientRna: law9Component('ambientRna', 'open'),
    crossPatientReproducibility: law9Component('crossPatientReproducibility', 'open')
  };
}

function baseArtifact() {
  return {
    schemaVersion: 'phase11.scientific-derivation-harness.v1',
    artifactId: 'SDH-HGSOC-CD8-LAW9-BLOCKED-001',
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
      status: 'blocked',
      derivationType: 'blocked',
      reviewedCellTypeKey: null,
      acceptedLabels: [],
      markerPolicy: {
        requiredMarkers: [],
        exclusionMarkers: [],
        decisionRule: 'blocked-no-reviewed-derivation'
      },
      humanReview: null,
      evidenceRefs: []
    },
    law9Harness: {
      quantitativeClaimPath: 'BLOCKED_OR_INCONCLUSIVE_UNTIL_KEY_RESOLVED',
      components: blockedLaw9Components()
    },
    readiness: {
      readyForQuantitativeRun: false,
      prohibitsFractionInThisTask: true,
      nextAllowedTask: 'T11.1.1'
    },
    createdAt: ISO_TIME,
    createdBy: 'codex'
  };
}

export function makeScientificDerivationHarnessFixture(overrides = {}) {
  return mergeDeep(baseArtifact(), overrides);
}

export function makeReadyScientificDerivationHarnessFixture(overrides = {}) {
  const ready = mergeDeep(baseArtifact(), {
    artifactId: 'SDH-HGSOC-CD8-LAW9-READY-FIXTURE-001',
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
      components: readyLaw9Components()
    },
    readiness: {
      readyForQuantitativeRun: true,
      prohibitsFractionInThisTask: true,
      nextAllowedTask: 'T11.1.1'
    }
  });
  return mergeDeep(ready, overrides);
}

function validateEvidenceHashes(artifact, issues) {
  if (!hasHash(artifact?.packetRef?.evidenceSha256)
    || !hasHash(artifact?.datasetInventoryRef?.evidenceSha256)) {
    addIssue(
      issues,
      'E_PHASE11_HARNESS_EVIDENCE_HASH_REQUIRED',
      'Packet and dataset inventory evidence refs require SHA-256 hashes.',
      'packetRef/datasetInventoryRef'
    );
  }
}

function validateWrongSlice(artifact, issues) {
  const serialized = JSON.stringify(artifact?.datasetInventoryRef ?? {});
  if (WRONG_SLICE_PATTERNS.some((pattern) => serialized.includes(pattern))
    || artifact?.datasetInventoryRef?.selectedSlice !== 'GSE184880-HGSOC') {
    addIssue(
      issues,
      'E_PHASE11_HARNESS_WRONG_SLICE_FORBIDDEN',
      'T11.1.0 harness may only reference the accepted GSE184880 HGSOC slice.',
      'datasetInventoryRef.selectedSlice'
    );
  }
}

function validateNoFractionFields(artifact, issues) {
  const serialized = JSON.stringify(artifact);
  const found = FORBIDDEN_QUANT_FIELDS.find((field) => serialized.includes(`"${field}"`));
  if (found) {
    addIssue(
      issues,
      'E_PHASE11_HARNESS_FRACTION_FORBIDDEN',
      'T11.1.0 cannot contain CD8 denominator/count/fraction fields.',
      found
    );
  }
}

function validateCd8Derivation(artifact, issues) {
  const derivation = artifact?.cd8Derivation ?? {};
  const wantsReady = artifact?.readiness?.readyForQuantitativeRun === true;

  if (wantsReady && derivation.status !== 'reviewed-accepted') {
    addIssue(
      issues,
      'E_PHASE11_DERIVATION_REVIEWED_STATUS_REQUIRED',
      'Ready quantitative runs require reviewed-accepted CD8 derivation status.',
      'cd8Derivation.status'
    );
  }

  if (wantsReady && derivation.humanReview == null) {
    addIssue(
      issues,
      'E_PHASE11_DERIVATION_HUMAN_REVIEW_REQUIRED',
      'Reviewed derivation requires an identifiable human decision record.',
      'cd8Derivation.humanReview'
    );
  }

  const review = derivation.humanReview;
  if (review != null) {
    if (review.agentSelfReview === true
      || /^(codex|claude|agent)/iu.test(review.reviewerId ?? '')
      || review.reviewerRole === 'agent') {
      addIssue(
        issues,
        'E_PHASE11_DERIVATION_AGENT_REVIEW_FORBIDDEN',
        'Agent self-review cannot satisfy reviewed CD8 derivation authority.',
        'cd8Derivation.humanReview'
      );
    }

    if (!hasText(review.reviewerId)
      || !hasText(review.reviewerRole)
      || review.decision !== 'accepted'
      || !hasText(review.decidedAt)
      || !hasText(review.decisionArtifactPath)
      || !hasHash(review.decisionArtifactSha256)) {
      addIssue(
        issues,
        'E_PHASE11_DERIVATION_HUMAN_REVIEW_REQUIRED',
        'Human review requires reviewer id, accepted decision, artifact path, and hash.',
        'cd8Derivation.humanReview'
      );
    }
  }

  if (wantsReady
    && !String(derivation.markerPolicy?.decisionRule ?? '').startsWith('reviewed-')) {
    addIssue(
      issues,
      'E_PHASE11_DERIVATION_MARKER_POLICY_REVIEW_REQUIRED',
      'Marker or label policy must be human-reviewed before readiness.',
      'cd8Derivation.markerPolicy.decisionRule'
    );
  }

  const serializedRefs = JSON.stringify(derivation.evidenceRefs ?? []);
  if (serializedRefs.includes(SCRATCH_ANALYSIS_PATH)) {
    addIssue(
      issues,
      'E_PHASE11_DERIVATION_SCRATCH_AUTHORITY_FORBIDDEN',
      'Scratch analysis script cannot be reviewed derivation authority.',
      SCRATCH_ANALYSIS_PATH
    );
  }
}

function metricPasses(metric) {
  if (metric == null || typeof metric !== 'object') return false;
  if (metric.passed !== true) return false;
  if (typeof metric.value !== 'number' || typeof metric.threshold !== 'number') return false;
  if (metric.direction === 'gte') return metric.value >= metric.threshold;
  if (metric.direction === 'lte') return metric.value <= metric.threshold;
  return false;
}

function validateControlEvidence(componentId, component, issues) {
  const evidence = component?.controlEvidence ?? {};
  const expectedKind = REQUIRED_COMPONENT_KINDS[componentId];
  if (evidence.kind !== expectedKind
    || !hasText(evidence.method)
    || !hasText(evidence.summary)
    || evidence.decision !== 'passed'
    || !hasText(evidence.artifactPath)
    || !hasHash(evidence.artifactSha256)
    || !Array.isArray(component.evidenceRefs)
    || component.evidenceRefs.length === 0) {
    addIssue(
      issues,
      'E_PHASE11_LAW9_CONTROL_EVIDENCE_REQUIRED',
      `${componentId} complete requires reviewed control evidence, not key presence.`,
      `law9Harness.components.${componentId}`
    );
  }

  if (METRIC_REQUIRED_COMPONENTS.has(componentId) && !metricPasses(evidence.metric)) {
    addIssue(
      issues,
      'E_PHASE11_LAW9_METRIC_THRESHOLD_FAILED',
      `${componentId} complete requires passing post-integration metric evidence.`,
      `law9Harness.components.${componentId}.controlEvidence.metric`
    );
  }
}

function validateLaw9Harness(artifact, issues) {
  const harness = artifact?.law9Harness ?? {};
  const components = harness.components ?? {};
  const wantsReady = artifact?.readiness?.readyForQuantitativeRun === true
    || harness.quantitativeClaimPath === 'READY_FOR_QUANTITATIVE_CLAIM';

  if (Object.hasOwn(harness, 'confounderStatus')) {
    addIssue(
      issues,
      'E_PHASE11_LAW9_CONFOUNDER_STATUS_FORBIDDEN',
      'confounderStatus string cannot replace LAW 9 evidence-of-control.',
      'law9Harness.confounderStatus'
    );
  }

  for (const componentId of Object.keys(REQUIRED_COMPONENT_KINDS)) {
    const component = components[componentId];
    if (!component || component.status !== 'complete') {
      if (wantsReady) {
        addIssue(
          issues,
          harness.quantitativeClaimPath === 'READY_FOR_QUANTITATIVE_CLAIM'
            ? 'E_PHASE11_LAW9_READY_WITH_OPEN_COMPONENT'
            : 'E_PHASE11_LAW9_COMPONENT_INCOMPLETE',
          `${componentId} must be complete before quantitative readiness.`,
          `law9Harness.components.${componentId}`
        );
        addIssue(
          issues,
          'E_PHASE11_LAW9_COMPONENT_INCOMPLETE',
          `${componentId} is not complete.`,
          `law9Harness.components.${componentId}.status`
        );
      }
      continue;
    }

    validateControlEvidence(componentId, component, issues);
  }
}

export function evaluateScientificDerivationHarness(artifact) {
  const issues = [];

  validateEvidenceHashes(artifact, issues);
  validateWrongSlice(artifact, issues);
  validateNoFractionFields(artifact, issues);
  validateCd8Derivation(artifact, issues);
  validateLaw9Harness(artifact, issues);

  const readyRequested = artifact?.readiness?.readyForQuantitativeRun === true;
  const ok = issues.length === 0;
  return {
    ok,
    decision: ok && readyRequested
      ? 'scientific-derivation-harness-ready'
      : ok
        ? 'scientific-derivation-harness-blocked'
        : 'scientific-derivation-harness-rejected',
    readyForQuantitativeRun: ok && readyRequested,
    promotesClaim: false,
    computesFraction: false,
    performsRealDataAnalysis: false,
    issues
  };
}
