import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PHASE_11_FULL_CLOSEOUT_REASON_CODES,
  validatePhase11FullCloseoutEvidence
} from '../../phase11/phase-11-closeout.js';

const RELAY_BASE = 'C:/Users/Test-User/.codex/relay/nuove_skill_phase11/turns';

const VALID_TASKS = Object.freeze([
  {
    taskId: 'T11.0.0',
    status: 'closed-evidence-only-private',
    evidenceOnly: true,
    closeoutMarkdown:
      'vibe-science/blueprints/private/WIKI_VRE/closures/phase11-t11-0-0-dataset-inventory-2026-06-16.md',
    closeoutEvidenceJson:
      'vibe-science/blueprints/private/WIKI_VRE/closures/phase11-t11-0-0-dataset-inventory-evidence-2026-06-16.json',
    hat3Verdict: 'ACCEPT',
    hat3AcceptRelay: `${RELAY_BASE}/claude-hat3-t11.0.0-real-data-preflight-verdict-2026-06-16.md`
  },
  {
    taskId: 'T11.0.1',
    status: 'closed-pushed-ci-green',
    commit: 'c7cdcf6a479a5b39891a5b55a2c3b99ecd7c9ab7',
    ciRun: '27633980386',
    ciConclusion: 'success',
    hat3Verdict: 'ACCEPT',
    hat3AcceptRelay: `${RELAY_BASE}/claude-hat3-t11.0.1-research-packet-scaffold-verdict-2026-06-16.md`
  },
  {
    taskId: 'T11.0.2',
    status: 'closed-pushed-ci-green',
    commit: 'f33346ce497f46e8e112f7189dc4e830480ee0e8',
    ciRun: '27636634379',
    ciConclusion: 'success',
    hat3Verdict: 'ACCEPT',
    hat3AcceptRelay: `${RELAY_BASE}/claude-hat3-t11.0.2-hgsoc-cd8-script-formalization-verdict-2026-06-16.md`
  },
  {
    taskId: 'T11.0.3',
    status: 'closed-pushed-ci-green',
    commit: '34c61c444dfff5ba42a9252c8ac1102e1acbc175',
    ciRun: '27639122979',
    ciConclusion: 'success',
    hat3Verdict: 'ACCEPT',
    hat3AcceptRelay: `${RELAY_BASE}/claude-hat3-t11.0.3-first-research-packet-execution-verdict-2026-06-16.md`
  },
  {
    taskId: 'T11.1.0',
    status: 'closed-pushed-ci-green',
    commit: 'acb14c12d40dd4a38e0c8e2653d3b44e2bde8801',
    ciRun: '27642417346',
    ciConclusion: 'success',
    hat3Verdict: 'ACCEPT',
    hat3AcceptRelay: `${RELAY_BASE}/claude-hat3-t11.1.0-scientific-derivation-harness-verdict-2026-06-16.md`
  },
  {
    taskId: 'T11.1.1',
    status: 'closed-pushed-ci-green',
    commit: '07bcb1d0dd98f4332e3fcda0ecda483a0827ca31',
    ciRun: '27646516222',
    ciConclusion: 'success',
    hat3Verdict: 'ACCEPT',
    hat3AcceptRelay: `${RELAY_BASE}/claude-hat3-t11.1.1-interpreter-manifest-verdict-2026-06-16.md`
  },
  {
    taskId: 'T11.1.2',
    status: 'closed-pushed-ci-green',
    commit: 'c00cbf6eb9c26a810b6da40ab875953f4f28755e',
    ciRun: '27651569945',
    ciConclusion: 'success',
    hat3Verdict: 'ACCEPT',
    hat3AcceptRelay: `${RELAY_BASE}/claude-hat3-t11.1.2-interpreter-subprocess-executor-verdict-2026-06-16.md`
  },
  {
    taskId: 'T11.1.3',
    status: 'closed-pushed-ci-green',
    commit: '1de3eaf48b87a32f47c00f860e49851613f88270',
    ciRun: '27654090708',
    ciConclusion: 'success',
    hat3Verdict: 'ACCEPT',
    hat3AcceptRelay: `${RELAY_BASE}/claude-hat3-t11.1.3-scientific-invariant-blockers-verdict-2026-06-17.md`
  },
  {
    taskId: 'T11.1.4',
    status: 'closed-pushed-ci-green',
    commit: '207c8dccd16cbc172e86966cc773e1e9dd90f7e6',
    ciRun: '27656607568',
    ciConclusion: 'success',
    hat3Verdict: 'ACCEPT',
    hat3AcceptRelay: `${RELAY_BASE}/claude-hat3-t11.1.4-coverage-regression-harness-verdict-2026-06-17.md`
  },
  {
    taskId: 'T11.1.5',
    status: 'closed-pushed-ci-green',
    commit: 'cbed16080d3bfd37d1dcaac4dbf2ee4851ef77ff',
    ciRun: '27658291864',
    ciConclusion: 'success',
    hat3Verdict: 'ACCEPT',
    hat3AcceptRelay: `${RELAY_BASE}/claude-hat3-t11.1.5-wave-11.1-closeout-verdict-2026-06-17.md`
  },
  {
    taskId: 'T11.2.0',
    status: 'closed-pushed-ci-green',
    commit: '064cb768173395327b8b3165a79566ab454db91c',
    ciRun: '27659773549',
    ciConclusion: 'success',
    hat3Verdict: 'ACCEPT',
    hat3AcceptRelay: `${RELAY_BASE}/claude-hat3-t11.2.0-state-source-taxonomy-verdict-2026-06-17.md`
  },
  {
    taskId: 'T11.2.1',
    status: 'closed-pushed-ci-green',
    commit: '94920878c43382635350b992f6d15313deee9769',
    ciRun: '27661167360',
    ciConclusion: 'success',
    hat3Verdict: 'ACCEPT',
    hat3AcceptRelay: `${RELAY_BASE}/claude-hat3-t11.2.1-doctor-drift-detector-verdict-2026-06-17.md`
  },
  {
    taskId: 'T11.2.2',
    status: 'closed-pushed-ci-green',
    commit: 'd3f534907f73f8383cf5f898890f3a332c1c55d1',
    ciRun: '27664530420',
    ciConclusion: 'success',
    hat3Verdict: 'ACCEPT',
    hat3AcceptRelay: `${RELAY_BASE}/claude-hat3-t11.2.2-doctor-reconcile-mode-second-redirect-fix-verdict-2026-06-17.md`
  },
  {
    taskId: 'T11.2.3',
    status: 'closed-pushed-ci-green',
    commit: '011b119ff2158247d4dc22fe4112fcf29a508834',
    ciRun: '27667207681',
    ciConclusion: 'success',
    hat3Verdict: 'ACCEPT',
    hat3AcceptRelay: `${RELAY_BASE}/claude-hat3-t11.2.3-wiki-fidelity-integration-verdict-2026-06-17.md`
  },
  {
    taskId: 'T11.2.4',
    status: 'closed-pushed-ci-green',
    commit: '1f7fcc257e9afcd990418e3c25a82fc0b81124fa',
    ciRun: '27670625590',
    ciConclusion: 'success',
    hat3Verdict: 'ACCEPT',
    hat3AcceptRelay: `${RELAY_BASE}/claude-hat3-t11.2.4-research-loop-governance-flake-verdict-2026-06-17.md`
  },
  {
    taskId: 'T11.2.5',
    status: 'closed-pushed-ci-green',
    commit: 'b44602e018f31be873e87d1d9f2932a9a9ceaf0c',
    ciRun: '27674943083',
    ciConclusion: 'success',
    hat3Verdict: 'ACCEPT',
    hat3AcceptRelay: `${RELAY_BASE}/claude-hat3-t11.2.5-wave-11.2-closeout-verdict-2026-06-17.md`
  },
  {
    taskId: 'T11.3.0',
    status: 'closed-pushed-ci-green',
    commit: 'cbd884b71ef305761f67d7578c93046c12b1c61b',
    ciRun: '27680552049',
    ciConclusion: 'success',
    hat3Verdict: 'ACCEPT',
    hat3AcceptRelay: `${RELAY_BASE}/claude-hat3-t11.3.0-generated-current-status-verdict-2026-06-17.md`
  },
  {
    taskId: 'T11.3.1',
    status: 'closed-pushed-ci-green',
    commit: '845f2ebb04a66b01d87527c73effeb39ea9ab3f7',
    ciRun: '27683993596',
    ciConclusion: 'success',
    hat3Verdict: 'ACCEPT',
    hat3AcceptRelay: `${RELAY_BASE}/claude-hat3-t11.3.1-ledger-row-budget-verdict-2026-06-17.md`
  },
  {
    taskId: 'T11.3.2',
    status: 'closed-pushed-ci-green',
    commit: '1b38312ac2874c24a8da9fb35e47290642de119a',
    ciRun: '27688981736',
    ciConclusion: 'success',
    statusProjectionCommit: '24412b1aa3f73de6e4c8f20eba8f97e9698d531b',
    statusProjectionCiRun: '27689449811',
    hat3Verdict: 'ACCEPT',
    hat3AcceptRelay: `${RELAY_BASE}/claude-hat3-t11.3.2-phase-entry-validator-redirect-fix-verdict-2026-06-17.md`
  },
  {
    taskId: 'T11.3.3',
    status: 'closed-pushed-ci-green',
    commit: '9dbb730678367d86b5fffbfda161992c82dffd78',
    ciRun: '27693689233',
    ciConclusion: 'success',
    statusProjectionCommit: '932578e88a9a8a8f43df5679de70876becbe91e8',
    statusProjectionCiRun: '27694147656',
    hat3Verdict: 'ACCEPT',
    hat3AcceptRelay: `${RELAY_BASE}/claude-hat3-t11.3.3-research-runbook-handoff-verdict-2026-06-17.md`
  }
]);

function makeValidEvidence(overrides = {}) {
  return {
    schemaVersion: 'phase11.full_closeout.v1',
    phase: 11,
    phase11Status: 'closed',
    closeoutClaim: 'research-environment-foundation',
    tasks: VALID_TASKS.map((task) => ({ ...task })),
    realDataPacket: {
      accession: 'GSE184880',
      status: 'blocked-actionable',
      totalCells: 34733,
      reviewedCd8Derivation: false,
      law9BatchDonorUnblocked: false,
      cxcl13Cd8Denominator: null,
      cxcl13Cd8Count: null,
      cxcl13Cd8Fraction: null,
      claimReady: false,
      exportReady: false
    },
    medicalAuthority: {
      elisaGotteRequired: true,
      codexClaudeClaimAuthority: false
    },
    carryForward: {
      'FU-EOF-NOISE-CLEANUP': 'open non-blocking',
      'W10.4-DEFERRED-EXPORT-PACKAGING-001': 'deferred',
      'W10.5-DEFERRED-PERSISTED-MULTI-DOMAIN-EXECUTION-001': 'deferred',
      'GRAPHIFY-DEFERRED-NOT-READY-FOR-BRIDGE': 'deferred'
    },
    forbiddenBoundaries: {
      phase12Entry: false,
      graphify: false,
      exportPackaging: false,
      claimPromotion: false,
      persistedMultiDomainExecution: false,
      rootDoctorCleanup: false,
      realH5adRead: false,
      realGeoRead: false,
      network: false,
      privateWikiRuntimeDependency: false
    },
    evidencePolicy: {
      docsTestsCloseoutsReviewerAcceptSubstituteForResearchEvidence: false,
      siblingPrivateWikiRequiredForCi: false
    },
    deliveryAttestation: {
      present: true,
      closeoutHonestyValidated: true,
      exitGateResults: ['PASS', 'PARTIAL', 'DEFERRED']
    },
    ...overrides
  };
}

test('valid Phase 11 closeout closes environment foundation only', () => {
  const result = validatePhase11FullCloseoutEvidence(makeValidEvidence());

  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.equal(result.closesPhase11, true);
  assert.equal(result.biomedicalResult, false);
});

test('missing required task fails closed', () => {
  const evidence = makeValidEvidence({
    tasks: VALID_TASKS.filter((task) => task.taskId !== 'T11.2.5')
  });
  const result = validatePhase11FullCloseoutEvidence(evidence);

  assert.equal(result.ok, false);
  assert(result.issues.some((issue) =>
    issue.code === PHASE_11_FULL_CLOSEOUT_REASON_CODES.missingTask
      && issue.taskId === 'T11.2.5'
  ));
});

test('wrong committed task commit or CI run fails closed', () => {
  const evidence = makeValidEvidence();
  evidence.tasks[evidence.tasks.findIndex((task) => task.taskId === 'T11.3.3')] = {
    ...evidence.tasks.find((task) => task.taskId === 'T11.3.3'),
    commit: 'deadbeef',
    ciRun: '0'
  };
  const result = validatePhase11FullCloseoutEvidence(evidence);

  assert.equal(result.ok, false);
  assert(result.issues.some((issue) =>
    issue.code === PHASE_11_FULL_CLOSEOUT_REASON_CODES.wrongCommit
      && issue.taskId === 'T11.3.3'
  ));
  assert(result.issues.some((issue) =>
    issue.code === PHASE_11_FULL_CLOSEOUT_REASON_CODES.wrongCiRun
      && issue.taskId === 'T11.3.3'
  ));
});

test('T11.0.0 cannot be represented as a runtime commit', () => {
  const evidence = makeValidEvidence();
  evidence.tasks[0] = {
    ...evidence.tasks[0],
    status: 'closed-pushed-ci-green',
    evidenceOnly: false,
    commit: 'c7cdcf6a479a5b39891a5b55a2c3b99ecd7c9ab7'
  };
  const result = validatePhase11FullCloseoutEvidence(evidence);

  assert.equal(result.ok, false);
  assert(result.issues.some((issue) =>
    issue.code === PHASE_11_FULL_CLOSEOUT_REASON_CODES.evidenceOnlyHasCommit
      && issue.taskId === 'T11.0.0'
  ));
});

test('claim-ready or export-ready real-data packet fails closed', () => {
  const evidence = makeValidEvidence({
    realDataPacket: {
      ...makeValidEvidence().realDataPacket,
      status: 'claim-ready',
      cxcl13Cd8Fraction: 0.12,
      claimReady: true,
      exportReady: true
    }
  });
  const result = validatePhase11FullCloseoutEvidence(evidence);

  assert.equal(result.ok, false);
  assert(result.biomedicalResult);
  assert(result.issues.some((issue) =>
    issue.code === PHASE_11_FULL_CLOSEOUT_REASON_CODES.realDataPacketOverclaim
  ));
});

test('missing medical authority boundary fails closed', () => {
  const evidence = makeValidEvidence({
    medicalAuthority: {
      elisaGotteRequired: false,
      codexClaudeClaimAuthority: true
    }
  });
  const result = validatePhase11FullCloseoutEvidence(evidence);

  assert.equal(result.ok, false);
  assert(result.issues.some((issue) =>
    issue.code === PHASE_11_FULL_CLOSEOUT_REASON_CODES.medicalBoundaryMissing
  ));
});

test('missing deferred or carry-forward item fails closed', () => {
  const evidence = makeValidEvidence();
  delete evidence.carryForward['GRAPHIFY-DEFERRED-NOT-READY-FOR-BRIDGE'];
  const result = validatePhase11FullCloseoutEvidence(evidence);

  assert.equal(result.ok, false);
  assert(result.issues.some((issue) =>
    issue.code === PHASE_11_FULL_CLOSEOUT_REASON_CODES.missingCarryForward
      && issue.item === 'GRAPHIFY-DEFERRED-NOT-READY-FOR-BRIDGE'
  ));
});

test('forbidden Phase 12 or export boundary fails closed', () => {
  const evidence = makeValidEvidence({
    forbiddenBoundaries: {
      ...makeValidEvidence().forbiddenBoundaries,
      phase12Entry: true,
      exportPackaging: true
    }
  });
  const result = validatePhase11FullCloseoutEvidence(evidence);

  assert.equal(result.ok, false);
  assert(result.issues.some((issue) =>
    issue.code === PHASE_11_FULL_CLOSEOUT_REASON_CODES.forbiddenBoundaryOpen
      && issue.boundary === 'phase12Entry'
  ));
});

test('docs/tests/reviewer accepts cannot substitute for research evidence', () => {
  const evidence = makeValidEvidence({
    evidencePolicy: {
      docsTestsCloseoutsReviewerAcceptSubstituteForResearchEvidence: true,
      siblingPrivateWikiRequiredForCi: false
    }
  });
  const result = validatePhase11FullCloseoutEvidence(evidence);

  assert.equal(result.ok, false);
  assert(result.issues.some((issue) =>
    issue.code === PHASE_11_FULL_CLOSEOUT_REASON_CODES.docsOnlyEvidence
  ));
});

test('delivery attestation and honesty validation are required', () => {
  const evidence = makeValidEvidence({
    deliveryAttestation: {
      present: false,
      closeoutHonestyValidated: false,
      exitGateResults: ['PASS', 'DONE']
    }
  });
  const result = validatePhase11FullCloseoutEvidence(evidence);

  assert.equal(result.ok, false);
  assert(result.issues.some((issue) =>
    issue.code === PHASE_11_FULL_CLOSEOUT_REASON_CODES.deliveryAttestationMissing
  ));
  assert(result.issues.some((issue) =>
    issue.code === PHASE_11_FULL_CLOSEOUT_REASON_CODES.closeoutHonestyMissing
  ));
});
