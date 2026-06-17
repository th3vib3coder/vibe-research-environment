import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const RELAY_BASE = 'C:/Users/Test-User/.codex/relay/nuove_skill_phase11/turns';

const EXPECTED_TASKS = Object.freeze([
  {
    taskId: 'T11.0.0',
    status: 'closed-evidence-only-private',
    evidenceOnly: true,
    closeoutMarkdown:
      'vibe-science/blueprints/private/WIKI_VRE/closures/phase11-t11-0-0-dataset-inventory-2026-06-16.md',
    closeoutEvidenceJson:
      'vibe-science/blueprints/private/WIKI_VRE/closures/phase11-t11-0-0-dataset-inventory-evidence-2026-06-16.json',
    hat3AcceptRelay: `${RELAY_BASE}/claude-hat3-t11.0.0-real-data-preflight-verdict-2026-06-16.md`
  },
  {
    taskId: 'T11.0.1',
    commit: 'c7cdcf6a479a5b39891a5b55a2c3b99ecd7c9ab7',
    ciRun: '27633980386',
    hat3AcceptRelay: `${RELAY_BASE}/claude-hat3-t11.0.1-research-packet-scaffold-verdict-2026-06-16.md`
  },
  {
    taskId: 'T11.0.2',
    commit: 'f33346ce497f46e8e112f7189dc4e830480ee0e8',
    ciRun: '27636634379',
    hat3AcceptRelay: `${RELAY_BASE}/claude-hat3-t11.0.2-hgsoc-cd8-script-formalization-verdict-2026-06-16.md`
  },
  {
    taskId: 'T11.0.3',
    commit: '34c61c444dfff5ba42a9252c8ac1102e1acbc175',
    ciRun: '27639122979',
    hat3AcceptRelay: `${RELAY_BASE}/claude-hat3-t11.0.3-first-research-packet-execution-verdict-2026-06-16.md`
  },
  {
    taskId: 'T11.1.0',
    commit: 'acb14c12d40dd4a38e0c8e2653d3b44e2bde8801',
    ciRun: '27642417346',
    hat3AcceptRelay: `${RELAY_BASE}/claude-hat3-t11.1.0-scientific-derivation-harness-verdict-2026-06-16.md`
  },
  {
    taskId: 'T11.1.1',
    commit: '07bcb1d0dd98f4332e3fcda0ecda483a0827ca31',
    ciRun: '27646516222',
    hat3AcceptRelay: `${RELAY_BASE}/claude-hat3-t11.1.1-interpreter-manifest-verdict-2026-06-16.md`
  },
  {
    taskId: 'T11.1.2',
    commit: 'c00cbf6eb9c26a810b6da40ab875953f4f28755e',
    ciRun: '27651569945',
    hat3AcceptRelay: `${RELAY_BASE}/claude-hat3-t11.1.2-interpreter-subprocess-executor-verdict-2026-06-16.md`
  },
  {
    taskId: 'T11.1.3',
    commit: '1de3eaf48b87a32f47c00f860e49851613f88270',
    ciRun: '27654090708',
    hat3AcceptRelay: `${RELAY_BASE}/claude-hat3-t11.1.3-scientific-invariant-blockers-verdict-2026-06-17.md`
  },
  {
    taskId: 'T11.1.4',
    commit: '207c8dccd16cbc172e86966cc773e1e9dd90f7e6',
    ciRun: '27656607568',
    hat3AcceptRelay: `${RELAY_BASE}/claude-hat3-t11.1.4-coverage-regression-harness-verdict-2026-06-17.md`
  },
  {
    taskId: 'T11.1.5',
    commit: 'cbed16080d3bfd37d1dcaac4dbf2ee4851ef77ff',
    ciRun: '27658291864',
    hat3AcceptRelay: `${RELAY_BASE}/claude-hat3-t11.1.5-wave-11.1-closeout-verdict-2026-06-17.md`
  },
  {
    taskId: 'T11.2.0',
    commit: '064cb768173395327b8b3165a79566ab454db91c',
    ciRun: '27659773549',
    hat3AcceptRelay: `${RELAY_BASE}/claude-hat3-t11.2.0-state-source-taxonomy-verdict-2026-06-17.md`
  },
  {
    taskId: 'T11.2.1',
    commit: '94920878c43382635350b992f6d15313deee9769',
    ciRun: '27661167360',
    hat3AcceptRelay: `${RELAY_BASE}/claude-hat3-t11.2.1-doctor-drift-detector-verdict-2026-06-17.md`
  },
  {
    taskId: 'T11.2.2',
    commit: 'd3f534907f73f8383cf5f898890f3a332c1c55d1',
    ciRun: '27664530420',
    hat3AcceptRelay: `${RELAY_BASE}/claude-hat3-t11.2.2-doctor-reconcile-mode-second-redirect-fix-verdict-2026-06-17.md`
  },
  {
    taskId: 'T11.2.3',
    commit: '011b119ff2158247d4dc22fe4112fcf29a508834',
    ciRun: '27667207681',
    hat3AcceptRelay: `${RELAY_BASE}/claude-hat3-t11.2.3-wiki-fidelity-integration-verdict-2026-06-17.md`
  },
  {
    taskId: 'T11.2.4',
    commit: '1f7fcc257e9afcd990418e3c25a82fc0b81124fa',
    ciRun: '27670625590',
    hat3AcceptRelay: `${RELAY_BASE}/claude-hat3-t11.2.4-research-loop-governance-flake-verdict-2026-06-17.md`
  },
  {
    taskId: 'T11.2.5',
    commit: 'b44602e018f31be873e87d1d9f2932a9a9ceaf0c',
    ciRun: '27674943083',
    hat3AcceptRelay: `${RELAY_BASE}/claude-hat3-t11.2.5-wave-11.2-closeout-verdict-2026-06-17.md`
  },
  {
    taskId: 'T11.3.0',
    commit: 'cbd884b71ef305761f67d7578c93046c12b1c61b',
    ciRun: '27680552049',
    hat3AcceptRelay: `${RELAY_BASE}/claude-hat3-t11.3.0-generated-current-status-verdict-2026-06-17.md`
  },
  {
    taskId: 'T11.3.1',
    commit: '845f2ebb04a66b01d87527c73effeb39ea9ab3f7',
    ciRun: '27683993596',
    hat3AcceptRelay: `${RELAY_BASE}/claude-hat3-t11.3.1-ledger-row-budget-verdict-2026-06-17.md`
  },
  {
    taskId: 'T11.3.2',
    commit: '1b38312ac2874c24a8da9fb35e47290642de119a',
    ciRun: '27688981736',
    statusProjectionCommit: '24412b1aa3f73de6e4c8f20eba8f97e9698d531b',
    statusProjectionCiRun: '27689449811',
    hat3AcceptRelay: `${RELAY_BASE}/claude-hat3-t11.3.2-phase-entry-validator-redirect-fix-verdict-2026-06-17.md`
  },
  {
    taskId: 'T11.3.3',
    commit: '9dbb730678367d86b5fffbfda161992c82dffd78',
    ciRun: '27693689233',
    statusProjectionCommit: '932578e88a9a8a8f43df5679de70876becbe91e8',
    statusProjectionCiRun: '27694147656',
    hat3AcceptRelay: `${RELAY_BASE}/claude-hat3-t11.3.3-research-runbook-handoff-verdict-2026-06-17.md`
  }
]);

const REQUIRED_CARRY_FORWARD = Object.freeze([
  'FU-EOF-NOISE-CLEANUP',
  'W10.4-DEFERRED-EXPORT-PACKAGING-001',
  'W10.5-DEFERRED-PERSISTED-MULTI-DOMAIN-EXECUTION-001',
  'GRAPHIFY-DEFERRED-NOT-READY-FOR-BRIDGE'
]);

const FORBIDDEN_BOUNDARIES = Object.freeze([
  'phase12Entry',
  'graphify',
  'exportPackaging',
  'claimPromotion',
  'persistedMultiDomainExecution',
  'rootDoctorCleanup',
  'realH5adRead',
  'realGeoRead',
  'network',
  'privateWikiRuntimeDependency'
]);

const ALLOWED_EXIT_GATE_RESULTS = new Set([
  'PASS',
  'PARTIAL',
  'FALSE-POSITIVE',
  'DEFERRED'
]);
const gitCommandCache = new Map();

export const PHASE_11_FULL_CLOSEOUT_REASON_CODES = Object.freeze({
  invalidSchemaVersion: 'E_PHASE11_FULL_CLOSEOUT_SCHEMA_VERSION',
  wrongPhase: 'E_PHASE11_FULL_CLOSEOUT_WRONG_PHASE',
  wrongPhaseStatus: 'E_PHASE11_FULL_CLOSEOUT_WRONG_PHASE_STATUS',
  wrongClaim: 'E_PHASE11_FULL_CLOSEOUT_WRONG_CLAIM',
  missingTask: 'E_PHASE11_FULL_CLOSEOUT_TASK_MISSING',
  taskNotClosed: 'E_PHASE11_FULL_CLOSEOUT_TASK_NOT_CLOSED',
  evidenceOnlyHasCommit: 'E_PHASE11_FULL_CLOSEOUT_EVIDENCE_ONLY_HAS_COMMIT',
  evidenceOnlyArtifactMissing: 'E_PHASE11_FULL_CLOSEOUT_EVIDENCE_ONLY_ARTIFACT_MISSING',
  missingCommit: 'E_PHASE11_FULL_CLOSEOUT_COMMIT_MISSING',
  wrongCommit: 'E_PHASE11_FULL_CLOSEOUT_COMMIT_WRONG',
  gitCommitMissing: 'E_PHASE11_FULL_CLOSEOUT_GIT_COMMIT_MISSING',
  gitCommitNotAncestor: 'E_PHASE11_FULL_CLOSEOUT_GIT_COMMIT_NOT_ANCESTOR',
  missingCiRun: 'E_PHASE11_FULL_CLOSEOUT_CI_RUN_MISSING',
  wrongCiRun: 'E_PHASE11_FULL_CLOSEOUT_CI_RUN_WRONG',
  ciNotSuccess: 'E_PHASE11_FULL_CLOSEOUT_CI_NOT_SUCCESS',
  wrongStatusProjection: 'E_PHASE11_FULL_CLOSEOUT_STATUS_PROJECTION_WRONG',
  missingHat3Accept: 'E_PHASE11_FULL_CLOSEOUT_HAT3_ACCEPT_MISSING',
  wrongHat3Relay: 'E_PHASE11_FULL_CLOSEOUT_HAT3_RELAY_WRONG',
  realDataPacketWrong: 'E_PHASE11_FULL_CLOSEOUT_PACKET_WRONG',
  realDataPacketOverclaim: 'E_PHASE11_FULL_CLOSEOUT_PACKET_OVERCLAIM',
  medicalBoundaryMissing: 'E_PHASE11_FULL_CLOSEOUT_MEDICAL_BOUNDARY_MISSING',
  forbiddenBoundaryOpen: 'E_PHASE11_FULL_CLOSEOUT_FORBIDDEN_BOUNDARY_OPEN',
  missingCarryForward: 'E_PHASE11_FULL_CLOSEOUT_CARRY_FORWARD_MISSING',
  docsOnlyEvidence: 'E_PHASE11_FULL_CLOSEOUT_DOCS_ONLY_EVIDENCE',
  privateWikiCiDependency: 'E_PHASE11_FULL_CLOSEOUT_PRIVATE_WIKI_CI_DEPENDENCY',
  deliveryAttestationMissing: 'E_PHASE11_FULL_CLOSEOUT_DELIVERY_ATTESTATION_MISSING',
  closeoutHonestyMissing: 'E_PHASE11_FULL_CLOSEOUT_HONESTY_MISSING',
  invalidExitGateResult: 'E_PHASE11_FULL_CLOSEOUT_EXIT_GATE_RESULT_INVALID'
});

function hasText(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function issue(code, extra = {}) {
  return { code, ...extra };
}

function gitCommandOk(args) {
  const cacheKey = args.join('\0');
  if (gitCommandCache.has(cacheKey)) {
    return gitCommandCache.get(cacheKey);
  }

  try {
    execFileSync('git', args, {
      cwd: repoRoot,
      stdio: 'ignore'
    });
    gitCommandCache.set(cacheKey, true);
    return true;
  } catch {
    gitCommandCache.set(cacheKey, false);
    return false;
  }
}

function validateGitCommit(commit, taskId, issues) {
  if (!gitCommandOk(['cat-file', '-e', `${commit}^{commit}`])) {
    issues.push(issue(
      PHASE_11_FULL_CLOSEOUT_REASON_CODES.gitCommitMissing,
      { taskId, commit }
    ));
    return;
  }

  if (!gitCommandOk(['merge-base', '--is-ancestor', commit, 'HEAD'])) {
    issues.push(issue(
      PHASE_11_FULL_CLOSEOUT_REASON_CODES.gitCommitNotAncestor,
      { taskId, commit }
    ));
  }
}

function validateEvidenceOnlyTask(task, expected, issues) {
  if (task.status !== expected.status || task.evidenceOnly !== true) {
    issues.push(issue(
      PHASE_11_FULL_CLOSEOUT_REASON_CODES.taskNotClosed,
      { taskId: expected.taskId }
    ));
  }

  if (hasText(task.commit) || hasText(task.ciRun)) {
    issues.push(issue(
      PHASE_11_FULL_CLOSEOUT_REASON_CODES.evidenceOnlyHasCommit,
      { taskId: expected.taskId }
    ));
  }

  for (const field of ['closeoutMarkdown', 'closeoutEvidenceJson']) {
    if (task[field] !== expected[field]) {
      issues.push(issue(
        PHASE_11_FULL_CLOSEOUT_REASON_CODES.evidenceOnlyArtifactMissing,
        { taskId: expected.taskId, field }
      ));
    }
  }
}

function validateCommittedTask(task, expected, issues, options) {
  if (task.status !== 'closed-pushed-ci-green') {
    issues.push(issue(
      PHASE_11_FULL_CLOSEOUT_REASON_CODES.taskNotClosed,
      { taskId: expected.taskId }
    ));
  }

  if (!hasText(task.commit)) {
    issues.push(issue(
      PHASE_11_FULL_CLOSEOUT_REASON_CODES.missingCommit,
      { taskId: expected.taskId }
    ));
  } else if (task.commit !== expected.commit) {
    issues.push(issue(
      PHASE_11_FULL_CLOSEOUT_REASON_CODES.wrongCommit,
      { taskId: expected.taskId, expected: expected.commit, actual: task.commit }
    ));
  } else if (options.verifyGit !== false) {
    validateGitCommit(task.commit, expected.taskId, issues);
  }

  if (!hasText(task.ciRun)) {
    issues.push(issue(
      PHASE_11_FULL_CLOSEOUT_REASON_CODES.missingCiRun,
      { taskId: expected.taskId }
    ));
  } else if (task.ciRun !== expected.ciRun) {
    issues.push(issue(
      PHASE_11_FULL_CLOSEOUT_REASON_CODES.wrongCiRun,
      { taskId: expected.taskId, expected: expected.ciRun, actual: task.ciRun }
    ));
  }

  if (task.ciConclusion !== 'success') {
    issues.push(issue(
      PHASE_11_FULL_CLOSEOUT_REASON_CODES.ciNotSuccess,
      { taskId: expected.taskId }
    ));
  }

  for (const field of ['statusProjectionCommit', 'statusProjectionCiRun']) {
    if (expected[field] != null && task[field] !== expected[field]) {
      issues.push(issue(
        PHASE_11_FULL_CLOSEOUT_REASON_CODES.wrongStatusProjection,
        { taskId: expected.taskId, field }
      ));
    }
  }
}

function validateHat3(task, expected, issues) {
  if (task.hat3Verdict !== 'ACCEPT') {
    issues.push(issue(
      PHASE_11_FULL_CLOSEOUT_REASON_CODES.missingHat3Accept,
      { taskId: expected.taskId }
    ));
  }

  if (task.hat3AcceptRelay !== expected.hat3AcceptRelay) {
    issues.push(issue(
      PHASE_11_FULL_CLOSEOUT_REASON_CODES.wrongHat3Relay,
      { taskId: expected.taskId }
    ));
  }
}

function validateTasks(evidence, issues, options) {
  const tasks = Array.isArray(evidence?.tasks) ? evidence.tasks : [];
  const tasksById = new Map(tasks.map((task) => [task.taskId, task]));

  for (const expected of EXPECTED_TASKS) {
    const task = tasksById.get(expected.taskId);
    if (task == null) {
      issues.push(issue(
        PHASE_11_FULL_CLOSEOUT_REASON_CODES.missingTask,
        { taskId: expected.taskId }
      ));
      continue;
    }

    if (expected.evidenceOnly) {
      validateEvidenceOnlyTask(task, expected, issues);
    } else {
      validateCommittedTask(task, expected, issues, options);
    }

    validateHat3(task, expected, issues);
  }
}

function validateRealDataPacket(evidence, issues) {
  const packet = evidence?.realDataPacket;
  if (
    packet?.accession !== 'GSE184880' ||
    packet?.status !== 'blocked-actionable' ||
    packet?.totalCells !== 34733
  ) {
    issues.push(issue(PHASE_11_FULL_CLOSEOUT_REASON_CODES.realDataPacketWrong));
  }

  const overclaims = packet?.reviewedCd8Derivation !== false ||
    packet?.law9BatchDonorUnblocked !== false ||
    packet?.cxcl13Cd8Denominator != null ||
    packet?.cxcl13Cd8Count != null ||
    packet?.cxcl13Cd8Fraction != null ||
    packet?.claimReady !== false ||
    packet?.exportReady !== false;

  if (overclaims) {
    issues.push(issue(PHASE_11_FULL_CLOSEOUT_REASON_CODES.realDataPacketOverclaim));
  }
}

function validateMedicalAuthority(evidence, issues) {
  const authority = evidence?.medicalAuthority;
  if (
    authority?.elisaGotteRequired !== true ||
    authority?.codexClaudeClaimAuthority !== false
  ) {
    issues.push(issue(PHASE_11_FULL_CLOSEOUT_REASON_CODES.medicalBoundaryMissing));
  }
}

function validateCarryForward(evidence, issues) {
  const carryForward = evidence?.carryForward ?? {};
  for (const item of REQUIRED_CARRY_FORWARD) {
    if (!hasText(carryForward[item])) {
      issues.push(issue(
        PHASE_11_FULL_CLOSEOUT_REASON_CODES.missingCarryForward,
        { item }
      ));
    }
  }
}

function validateForbiddenBoundaries(evidence, issues) {
  const boundaries = evidence?.forbiddenBoundaries ?? {};
  for (const boundary of FORBIDDEN_BOUNDARIES) {
    if (boundaries[boundary] === true) {
      issues.push(issue(
        PHASE_11_FULL_CLOSEOUT_REASON_CODES.forbiddenBoundaryOpen,
        { boundary }
      ));
    }
  }
}

function validateEvidencePolicy(evidence, issues) {
  const policy = evidence?.evidencePolicy ?? {};
  if (policy.docsTestsCloseoutsReviewerAcceptSubstituteForResearchEvidence !== false) {
    issues.push(issue(PHASE_11_FULL_CLOSEOUT_REASON_CODES.docsOnlyEvidence));
  }

  if (policy.siblingPrivateWikiRequiredForCi !== false) {
    issues.push(issue(PHASE_11_FULL_CLOSEOUT_REASON_CODES.privateWikiCiDependency));
  }
}

function validateDeliveryAttestation(evidence, issues) {
  const attestation = evidence?.deliveryAttestation ?? {};
  if (attestation.present !== true) {
    issues.push(issue(
      PHASE_11_FULL_CLOSEOUT_REASON_CODES.deliveryAttestationMissing
    ));
  }

  if (attestation.closeoutHonestyValidated !== true) {
    issues.push(issue(PHASE_11_FULL_CLOSEOUT_REASON_CODES.closeoutHonestyMissing));
  }

  const results = Array.isArray(attestation.exitGateResults)
    ? attestation.exitGateResults
    : [];
  for (const result of results) {
    if (!ALLOWED_EXIT_GATE_RESULTS.has(result)) {
      issues.push(issue(
        PHASE_11_FULL_CLOSEOUT_REASON_CODES.invalidExitGateResult,
        { result }
      ));
    }
  }
}

export function validatePhase11FullCloseoutEvidence(evidence, options = {}) {
  const issues = [];

  if (evidence?.schemaVersion !== 'phase11.full_closeout.v1') {
    issues.push(issue(PHASE_11_FULL_CLOSEOUT_REASON_CODES.invalidSchemaVersion));
  }

  if (evidence?.phase !== 11) {
    issues.push(issue(PHASE_11_FULL_CLOSEOUT_REASON_CODES.wrongPhase));
  }

  if (evidence?.phase11Status !== 'closed') {
    issues.push(issue(PHASE_11_FULL_CLOSEOUT_REASON_CODES.wrongPhaseStatus));
  }

  if (evidence?.closeoutClaim !== 'research-environment-foundation') {
    issues.push(issue(PHASE_11_FULL_CLOSEOUT_REASON_CODES.wrongClaim));
  }

  validateTasks(evidence, issues, options);
  validateRealDataPacket(evidence, issues);
  validateMedicalAuthority(evidence, issues);
  validateCarryForward(evidence, issues);
  validateForbiddenBoundaries(evidence, issues);
  validateEvidencePolicy(evidence, issues);
  validateDeliveryAttestation(evidence, issues);

  const packet = evidence?.realDataPacket ?? {};
  const boundaries = evidence?.forbiddenBoundaries ?? {};
  const biomedicalResult = packet.claimReady === true ||
    packet.exportReady === true ||
    packet.cxcl13Cd8Denominator != null ||
    packet.cxcl13Cd8Count != null ||
    packet.cxcl13Cd8Fraction != null ||
    boundaries.claimPromotion === true ||
    boundaries.exportPackaging === true;

  return {
    ok: issues.length === 0,
    issues,
    closesPhase11: evidence?.phase11Status === 'closed',
    biomedicalResult
  };
}
