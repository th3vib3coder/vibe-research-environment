import {
  evaluatePhase11ResearchPacket,
  makePhase11ResearchPacketFixture
} from './research-packet.js';

const REQUIRED_SCHEMA_VERSION = 'phase11.research-packet.v1';
const REQUIRED_INTERPRETER = Object.freeze({
  interpreterId: 'venv_scrna',
  pythonVersion: '3.13.5',
  anndataVersion: '0.12.9',
  numpyVersion: '2.3.5'
});

const REQUIRED_PRIOR_REPORTS = Object.freeze([
  'reports_v2/CORE/R2_response_study_tissue_confounding.md',
  'reports_v2/CORE/FIX_study_id_reintegration_report.md',
  'reports_v2/CORE/doublet_removal_CORE_report.csv',
  'reports_v2/CORE/step_06_metrics_scIB_report.md',
  'reports_v2/CORE/step_07_clustering_CORE_report.md'
]);

const HGSOC_H5AD_FILES = Object.freeze([
  {
    datasetId: 'hgsoc-1-gsm5599225',
    relativePath: 'data/CORE_10x_scRNA/HGSOC_1_GSM5599225.h5ad',
    sourceAccession: 'GSE184880',
    sizeBytes: 70954771,
    sha256: 'be2839e88063a6c087bc9178bdff3d29d714bfe86593f6bd495067b140cfa943',
    nObs: 5764,
    nVars: 20054
  },
  {
    datasetId: 'hgsoc-2-gsm5599226',
    relativePath: 'data/CORE_10x_scRNA/HGSOC_2_GSM5599226.h5ad',
    sourceAccession: 'GSE184880',
    sizeBytes: 55551895,
    sha256: '4ce55f724a3eb892765439fa97682c9d2db08191d2d21bffa3aa3457b8ea6234',
    nObs: 2896,
    nVars: 19142
  },
  {
    datasetId: 'hgsoc-3-gsm5599227',
    relativePath: 'data/CORE_10x_scRNA/HGSOC_3_GSM5599227.h5ad',
    sourceAccession: 'GSE184880',
    sizeBytes: 46543585,
    sha256: '103720218bfad1f399bda543f1d4d83ef53e7e8259a0a89e94aabc9ce34b2e4a',
    nObs: 4050,
    nVars: 18013
  },
  {
    datasetId: 'hgsoc-4-gsm5599228',
    relativePath: 'data/CORE_10x_scRNA/HGSOC_4_GSM5599228.h5ad',
    sourceAccession: 'GSE184880',
    sizeBytes: 20943185,
    sha256: '8407c079db995e27144043302e3e192eadab63a4865e0f8e65142dce955bab64',
    nObs: 1297,
    nVars: 18494
  },
  {
    datasetId: 'hgsoc-5-gsm5599229',
    relativePath: 'data/CORE_10x_scRNA/HGSOC_5_GSM5599229.h5ad',
    sourceAccession: 'GSE184880',
    sizeBytes: 49195737,
    sha256: 'd92efeefd3e8216324deba65edccc431c48ea58513625dec17308f8f9683c464',
    nObs: 4795,
    nVars: 19203
  },
  {
    datasetId: 'hgsoc-6-gsm5599230',
    relativePath: 'data/CORE_10x_scRNA/HGSOC_6_GSM5599230.h5ad',
    sourceAccession: 'GSE184880',
    sizeBytes: 68403276,
    sha256: 'b3577b11e432aa7754eb3c1ac6a1823998589840bc764bc4442302eb73fd6e3e',
    nObs: 4023,
    nVars: 19566
  },
  {
    datasetId: 'hgsoc-7-gsm5599231',
    relativePath: 'data/CORE_10x_scRNA/HGSOC_7_GSM5599231.h5ad',
    sourceAccession: 'GSE184880',
    sizeBytes: 40753635,
    sha256: '0ea3af9709ecda139e1de3b75f1d597a13203baa4ac8e6bd721c700b0d898a47',
    nObs: 4220,
    nVars: 18441
  },
  {
    datasetId: 'hgsoc-8-gsm5514792',
    relativePath: 'data/CORE_10x_scRNA/HGSOC_8_GSM5514792.h5ad',
    sourceAccession: 'GSE184880',
    sizeBytes: 68955093,
    sha256: 'db27e0c93033292c8b423c4a8fbdbe155621c9f015ad45b40570fda5d0f02719',
    nObs: 3186,
    nVars: 22440
  },
  {
    datasetId: 'hgsoc-9-gsm5514793',
    relativePath: 'data/CORE_10x_scRNA/HGSOC_9_GSM5514793.h5ad',
    sourceAccession: 'GSE184880',
    sizeBytes: 55398095,
    sha256: '4bb744a64a3ceaec85b20fca0199c36737ba8ba6dd65232358e98ed4a1b8a5e1',
    nObs: 4502,
    nVars: 22240
  }
]);

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

function makePacketDatasets() {
  return HGSOC_H5AD_FILES.map((file) => ({
    datasetId: file.datasetId,
    sourceAccession: file.sourceAccession,
    path: file.relativePath,
    status: 'PRESENT',
    sha256: file.sha256,
    hashDeferredReason: null,
    selectedForExecution: true,
    cellTypeAnnotation: {
      status: 'absent',
      key: null,
      derivationPlanRef: null
    }
  }));
}

function makeSelectedH5adFiles() {
  return HGSOC_H5AD_FILES.map((file) => ({
    relativePath: file.relativePath,
    sizeBytes: file.sizeBytes,
    inventorySha256: file.sha256,
    executionSha256: file.sha256,
    hashRecomputedAt: '2026-06-16T00:00:00.000Z',
    hashMatchesInventory: true,
    readStatus: 'PASS_BACKED_R_METADATA_ONLY',
    nObs: file.nObs,
    nVars: file.nVars,
    cxcl13GeneSymbolPresent: true
  }));
}

function requiredPriorSourceRefs() {
  const hashes = [
    'c6805a868325331c358d4828de67d50780ed52fb3318943eb34bc8ca82897bc8',
    'a8f55cb982bbd00bac7ad1d2df1cbf2bec6ca3a68bebbc56c1c778055cb74196',
    '7dd447befa28324b4b1b1425b76db9443ca5c9a298b3a90d50d2dbe0cf393432',
    'd75a3b1258e3f50d45102a1057c1e0356a71e761bc1685d1c4cdb244ef326022',
    '2456815431d58f4cbaa1278270e43cfe492bb91db8b7fba0df5f8f1bdc8ea1f8'
  ];
  return REQUIRED_PRIOR_REPORTS.map((reportPath, index) => ({
    role: 'prior-confounder-report',
    path: reportPath,
    sha256: hashes[index]
  }));
}

export function makeFirstResearchPacketExecutionFixture(overrides = {}) {
  const packet = makePhase11ResearchPacketFixture({
    taskId: 'T11.0.3',
    datasets: makePacketDatasets(),
    sourceRefs: requiredPriorSourceRefs(),
    experiment: {
      experimentManifestRef: null,
      analysisManifestRef: null,
      resultBundleRef: null,
      executionStatus: 'blocked'
    },
    resultArtifacts: [
      {
        path: 'WIKI_VRE/closures/phase11-t11-0-3-first-research-packet-evidence-2026-06-16.json',
        sizeBytes: 1,
        sha256: 'e'.repeat(64),
        hashDeferredReason: null
      }
    ],
    draftFinding: {
      status: 'blocked',
      claimType: 'quantitative',
      target: 'CXCL13+ CD8',
      requiresCellTypeAnnotation: true,
      confounderStatus: 'open',
      medicalReviewRequired: true
    },
    seamLog: [
      {
        kind: 'missing-annotation',
        description: 'No reviewed CD8 derivation key is available for GSE184880.',
        status: 'blocked'
      },
      {
        kind: 'confounder-gap',
        description: 'LAW 9 batch/donor harness is incomplete for quantitative claims.',
        status: 'open'
      }
    ]
  });

  const base = {
    schemaVersion: 'phase11.first-research-packet-execution.v1',
    taskId: 'T11.0.3',
    outcome: 'blocked-packet',
    packet,
    executionEvidence: {
      reusesResearchPacketSchema: true,
      realDataReadBoundary: {
        localOnly: true,
        ciFixtureOnly: true,
        readInCi: false
      },
      environment: { ...REQUIRED_INTERPRETER },
      h5adReadMode: 'backed-r',
      selectedH5adFiles: makeSelectedH5adFiles(),
      quantitativeOutputs: null,
      claimReady: false,
      promotesClaim: false,
      authorityRefs: [
        'environment/phase11/first-research-packet.js',
        'environment/phase11/first_research_packet_probe.py'
      ],
      blocker: {
        reason: 'No reviewed CD8 cell-type derivation key is available for GSE184880.',
        unblockConditions: [
          'Create or select a reviewed CD8 derivation artifact for GSE184880.',
          'Review the derivation with the medical/operator authority before use.',
          'Complete a LAW 9 batch/donor harness on the integrated cohort.'
        ],
        followUpOwner: 'Wave 11.1 sanctioned science lane'
      }
    }
  };

  return mergeDeep(base, overrides);
}

function validateSchemaReuse(execution, issues) {
  if (execution.packet?.schemaVersion !== REQUIRED_SCHEMA_VERSION
    || execution.executionEvidence?.reusesResearchPacketSchema !== true) {
    addIssue(
      issues,
      'E_PHASE11_EXEC_SCHEMA_REUSE_REQUIRED',
      'T11.0.3 must reuse phase11.research-packet.v1 unless a new schema is justified.',
      'packet.schemaVersion'
    );
  }
}

function validateRealReadBoundary(evidence, issues) {
  const boundary = evidence.realDataReadBoundary ?? {};
  if (boundary.localOnly !== true || boundary.ciFixtureOnly !== true || boundary.readInCi !== false) {
    addIssue(
      issues,
      'E_PHASE11_EXEC_REAL_READ_IN_CI_FORBIDDEN',
      'Real H5AD backed-r reads are local only; CI must use fixtures.',
      'executionEvidence.realDataReadBoundary'
    );
  }
}

function validateEnvironment(evidence, issues) {
  const env = evidence.environment ?? {};
  for (const [key, value] of Object.entries(REQUIRED_INTERPRETER)) {
    if (env[key] !== value) {
      addIssue(
        issues,
        'E_PHASE11_EXEC_PINNED_ENV_REQUIRED',
        `Local real-data read requires ${key}=${value}.`,
        `executionEvidence.environment.${key}`
      );
    }
  }
}

function validateSelectedFiles(evidence, issues) {
  const selectedFiles = evidence.selectedH5adFiles ?? [];
  for (const file of selectedFiles) {
    if (!hasHash(file.inventorySha256) || !hasHash(file.executionSha256)) {
      addIssue(
        issues,
        'E_PHASE11_EXEC_HASH_RECOMPUTE_REQUIRED',
        'Execution evidence requires inventory and execution SHA-256 hashes.',
        file.relativePath ?? null
      );
    }
    if (typeof file.hashRecomputedAt !== 'string' || file.hashRecomputedAt.trim() === '') {
      addIssue(
        issues,
        'E_PHASE11_EXEC_HASH_RECOMPUTE_REQUIRED',
        'Execution-time hash recomputation timestamp is required.',
        file.relativePath ?? null
      );
    }
    if (file.hashMatchesInventory !== true || file.inventorySha256 !== file.executionSha256) {
      addIssue(
        issues,
        'E_PHASE11_EXEC_HASH_MISMATCH',
        'Execution-time H5AD hash must match the accepted T11.0.0 inventory hash.',
        file.relativePath ?? null
      );
    }
    if (file.readStatus !== 'PASS_BACKED_R_METADATA_ONLY') {
      addIssue(
        issues,
        'E_PHASE11_EXEC_BACKED_R_REQUIRED',
        'Each selected H5AD must be inspected in backed-r metadata mode.',
        file.relativePath ?? null
      );
    }
    if (file.cxcl13GeneSymbolPresent !== true) {
      addIssue(
        issues,
        'E_PHASE11_EXEC_CXCL13_GENE_SYMBOL_REQUIRED',
        'CXCL13 gene-symbol availability must be verified before packet execution.',
        file.relativePath ?? null
      );
    }
  }
}

function validateClaimBoundary(execution, issues) {
  const finding = execution.packet?.draftFinding ?? {};
  const evidence = execution.executionEvidence ?? {};
  if (finding.status === 'supported'
    || finding.status === 'conclusive'
    || evidence.claimReady === true
    || evidence.promotesClaim === true) {
    addIssue(
      issues,
      'E_PHASE11_EXEC_CLAIM_PROMOTION_FORBIDDEN',
      'T11.0.3 cannot promote a claim or mark the packet claim-ready.',
      'packet.draftFinding'
    );
  }
}

function validateCd8Derivation(execution, issues) {
  const evidence = execution.executionEvidence ?? {};
  if (evidence.quantitativeOutputs !== null && evidence.quantitativeOutputs !== undefined) {
    addIssue(
      issues,
      'E_PHASE11_EXEC_CD8_DERIVATION_REQUIRED',
      'CD8/CXCL13 quantitative outputs require reviewed CD8 derivation evidence.',
      'executionEvidence.quantitativeOutputs'
    );
  }
}

function validateActionableBlocker(execution, issues) {
  if (execution.outcome !== 'blocked-packet') return;
  const blocker = execution.executionEvidence?.blocker ?? {};
  if (typeof blocker.reason !== 'string' || blocker.reason.trim() === ''
    || !Array.isArray(blocker.unblockConditions)
    || blocker.unblockConditions.length < 2
    || typeof blocker.followUpOwner !== 'string'
    || blocker.followUpOwner.trim() === '') {
    addIssue(
      issues,
      'E_PHASE11_EXEC_BLOCKER_UNACTIONABLE',
      'Blocked packet must name exact unblock conditions and follow-up owner.',
      'executionEvidence.blocker'
    );
  }
}

function validateScratchAuthority(evidence, issues) {
  const serialized = JSON.stringify(evidence.authorityRefs ?? []);
  if (serialized.includes('analysis/scripts/hgsoc_cd8_subset.py')) {
    addIssue(
      issues,
      'E_PHASE11_EXEC_SCRATCH_AUTHORITY_FORBIDDEN',
      'Scratch analysis script cannot be execution authority.',
      'executionEvidence.authorityRefs'
    );
  }
}

export function evaluateFirstResearchPacketExecution(execution) {
  const issues = [];
  const packetResult = evaluatePhase11ResearchPacket(execution.packet ?? {});
  issues.push(...packetResult.issues);

  const evidence = execution.executionEvidence ?? {};
  validateSchemaReuse(execution, issues);
  validateRealReadBoundary(evidence, issues);
  validateEnvironment(evidence, issues);
  validateSelectedFiles(evidence, issues);
  validateClaimBoundary(execution, issues);
  validateCd8Derivation(execution, issues);
  validateActionableBlocker(execution, issues);
  validateScratchAuthority(evidence, issues);

  if (evidence.h5adReadMode !== 'backed-r') {
    addIssue(
      issues,
      'E_PHASE11_EXEC_BACKED_R_REQUIRED',
      'T11.0.3 local H5AD inspection must use backed-r mode.',
      'executionEvidence.h5adReadMode'
    );
  }

  const ok = issues.length === 0;
  return {
    ok,
    decision: ok ? 'first-research-packet-blocked-actionable' : 'first-research-packet-rejected',
    claimReady: false,
    performsRealDataAnalysis: true,
    realDataReadInCi: evidence.realDataReadBoundary?.readInCi === true,
    promotesClaim: false,
    reusesResearchPacketSchema: evidence.reusesResearchPacketSchema === true,
    issues
  };
}
