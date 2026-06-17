import {
  evaluateFirstResearchPacketExecution
} from './first-research-packet.js';

const REQUIRED_SCHEMA_VERSION = 'phase11.research-runbook-authority.v1';
const REQUIRED_DECISION = 'first-research-packet-blocked-actionable';
const REQUIRED_SOURCE_ACCESSION = 'GSE184880';
const REQUIRED_FILE_COUNT = 9;

export const RESEARCH_RUNBOOK_REASON_CODES = Object.freeze({
  schemaVersionMismatch: 'E_PHASE11_RUNBOOK_AUTHORITY_SCHEMA_MISMATCH',
  privateWikiCiDependency: 'E_PHASE11_RUNBOOK_PRIVATE_WIKI_CI_DEPENDENCY',
  snapshotDrift: 'E_PHASE11_RUNBOOK_SNAPSHOT_DRIFT',
  sourceAccessionMismatch: 'E_PHASE11_RUNBOOK_ACCESSION_MISMATCH',
  selectedFileCountMismatch: 'E_PHASE11_RUNBOOK_SELECTED_FILE_COUNT_MISMATCH',
  snapshotTotalCellsMismatch: 'E_PHASE11_RUNBOOK_SNAPSHOT_TOTAL_CELLS_MISMATCH',
  decisionMismatch: 'E_PHASE11_RUNBOOK_DECISION_MISMATCH',
  fileHashMismatch: 'E_PHASE11_RUNBOOK_FILE_HASH_MISMATCH',
  fileCellCountMismatch: 'E_PHASE11_RUNBOOK_FILE_CELL_COUNT_MISMATCH',
  totalCellsMismatch: 'E_PHASE11_RUNBOOK_TOTAL_CELLS_MISMATCH',
  localBoundaryMissing: 'E_PHASE11_RUNBOOK_LOCAL_BOUNDARY_MISSING',
  medicalBoundaryMissing: 'E_PHASE11_RUNBOOK_MEDICAL_BOUNDARY_MISSING',
  nonResultsMissing: 'E_PHASE11_RUNBOOK_NON_RESULTS_MISSING',
  unblockMissing: 'E_PHASE11_RUNBOOK_UNBLOCK_MISSING',
  claimOverreach: 'E_PHASE11_RUNBOOK_CLAIM_OVERREACH',
  scopeLeak: 'E_PHASE11_RUNBOOK_SCOPE_LEAK',
  sourceIndexMissing: 'E_PHASE11_RUNBOOK_SOURCE_INDEX_MISSING'
});

function addIssue(issues, code, message, path = null) {
  issues.push({ code, message, path });
}

function formatNumber(value) {
  return Number(value).toLocaleString('en-US');
}

function normalize(value) {
  return String(value).replace(/\r\n/g, '\n');
}

function requireText(markdown, text, issues, code, message, path = null) {
  if (!normalize(markdown).includes(text)) {
    addIssue(issues, code, message, path);
  }
}

function selectedFilesFromExecution(execution) {
  const files = execution.executionEvidence?.selectedH5adFiles ?? [];
  return files.map((file) => ({
    relativePath: file.relativePath,
    sha256: file.executionSha256,
    inventorySha256: file.inventorySha256,
    nObs: file.nObs,
    nVars: file.nVars
  }));
}

function makeFileKey(file) {
  return `${file.relativePath}|${file.sha256}|${file.nObs}|${file.nVars}`;
}

function validateAuthority(authority, issues) {
  if (authority.schemaVersion !== REQUIRED_SCHEMA_VERSION) {
    addIssue(
      issues,
      RESEARCH_RUNBOOK_REASON_CODES.schemaVersionMismatch,
      `Authority snapshot must use ${REQUIRED_SCHEMA_VERSION}.`,
      'schemaVersion'
    );
  }

  if (authority.sourceStrategy !== 'tracked-vre-snapshot') {
    addIssue(
      issues,
      RESEARCH_RUNBOOK_REASON_CODES.privateWikiCiDependency,
      'Runbook CI authority must be a tracked VRE snapshot, not the sibling private WIKI.',
      'sourceStrategy'
    );
  }

  if (authority.snapshotMatchesCanonicalPrivateWiki !== true) {
    addIssue(
      issues,
      RESEARCH_RUNBOOK_REASON_CODES.snapshotDrift,
      'Tracked VRE snapshot must be attested equal to the canonical private WIKI evidence.',
      'snapshotMatchesCanonicalPrivateWiki'
    );
  }

  if (authority.sourceAccession !== REQUIRED_SOURCE_ACCESSION
    || authority.executionSourceAccession !== REQUIRED_SOURCE_ACCESSION) {
    addIssue(
      issues,
      RESEARCH_RUNBOOK_REASON_CODES.sourceAccessionMismatch,
      'Runbook authority must remain bound to GSE184880.',
      'sourceAccession'
    );
  }

  if (authority.selectedH5adFileCount !== REQUIRED_FILE_COUNT
    || authority.computedSelectedH5adFileCount !== REQUIRED_FILE_COUNT) {
    addIssue(
      issues,
      RESEARCH_RUNBOOK_REASON_CODES.selectedFileCountMismatch,
      'Runbook authority must cover exactly nine selected GSE184880 H5AD files.',
      'selectedH5adFileCount'
    );
  }

  if (authority.totalCells !== authority.computedTotalCells) {
    addIssue(
      issues,
      RESEARCH_RUNBOOK_REASON_CODES.snapshotTotalCellsMismatch,
      'Tracked totalCells must equal the sum of nObs values from first-research-packet.js.',
      'totalCells'
    );
  }

  if (authority.expectedDecision !== REQUIRED_DECISION
    || authority.executionDecision !== REQUIRED_DECISION) {
    addIssue(
      issues,
      RESEARCH_RUNBOOK_REASON_CODES.decisionMismatch,
      'Runbook handoff is only valid for the blocked-actionable first research packet.',
      'expectedDecision'
    );
  }

  const executionByPath = new Map(
    authority.executionSelectedH5adFiles.map((file) => [file.relativePath, file])
  );

  for (const snapshotFile of authority.selectedH5adFiles) {
    const executionFile = executionByPath.get(snapshotFile.relativePath);
    if (!executionFile || snapshotFile.sha256 !== executionFile.sha256) {
      addIssue(
        issues,
        RESEARCH_RUNBOOK_REASON_CODES.fileHashMismatch,
        'Snapshot SHA-256 values must match first-research-packet.js execution evidence.',
        snapshotFile.relativePath
      );
    }
    if (!executionFile
      || snapshotFile.nObs !== executionFile.nObs
      || snapshotFile.nVars !== executionFile.nVars) {
      addIssue(
        issues,
        RESEARCH_RUNBOOK_REASON_CODES.fileCellCountMismatch,
        'Snapshot nObs/nVars values must match first-research-packet.js execution evidence.',
        snapshotFile.relativePath
      );
    }
  }
}

function validateMarkdown(markdown, authority, issues) {
  const normalized = normalize(markdown);
  const formattedTotalCells = formatNumber(authority.totalCells);

  requireText(
    normalized,
    `sourceAccession: ${authority.sourceAccession}`,
    issues,
    RESEARCH_RUNBOOK_REASON_CODES.sourceAccessionMismatch,
    'Runbook must name the exact GSE184880 source accession.',
    'frontmatter.sourceAccession'
  );
  requireText(
    normalized,
    `runbookStatus: ${authority.expectedDecision}`,
    issues,
    RESEARCH_RUNBOOK_REASON_CODES.decisionMismatch,
    'Runbook must preserve the blocked-actionable handoff status.',
    'frontmatter.runbookStatus'
  );
  requireText(
    normalized,
    `Selected H5AD files: ${authority.selectedH5adFileCount}`,
    issues,
    RESEARCH_RUNBOOK_REASON_CODES.selectedFileCountMismatch,
    'Runbook must state the exact selected H5AD file count.',
    'selectedH5adFileCount'
  );
  requireText(
    normalized,
    `Total cells: ${formattedTotalCells}`,
    issues,
    RESEARCH_RUNBOOK_REASON_CODES.totalCellsMismatch,
    'Runbook must state the exact total cell count from tracked VRE authority.',
    'totalCells'
  );

  for (const file of authority.selectedH5adFiles) {
    requireText(
      normalized,
      makeFileKey(file),
      issues,
      RESEARCH_RUNBOOK_REASON_CODES.fileHashMismatch,
      'Runbook must carry exact path, hash, nObs, and nVars for every selected H5AD.',
      file.relativePath
    );
  }

  requireText(
    normalized,
    'Local read boundary: local-only backed-r; CI fixture-only; no real H5AD reads in CI.',
    issues,
    RESEARCH_RUNBOOK_REASON_CODES.localBoundaryMissing,
    'Runbook must keep real H5AD reads local and out of CI.',
    'localReadBoundary'
  );
  requireText(
    normalized,
    authority.authorityBoundary.medicalAuthority,
    issues,
    RESEARCH_RUNBOOK_REASON_CODES.medicalBoundaryMissing,
    'Runbook must preserve Elisa/Goette scientific and medical authority.',
    'authorityBoundary.medicalAuthority'
  );
  requireText(
    normalized,
    authority.authorityBoundary.agentBoundary,
    issues,
    RESEARCH_RUNBOOK_REASON_CODES.medicalBoundaryMissing,
    'Runbook must state Codex/Claude engineering-only authority.',
    'authorityBoundary.agentBoundary'
  );

  for (const item of authority.nonResults) {
    requireText(
      normalized,
      item,
      issues,
      RESEARCH_RUNBOOK_REASON_CODES.nonResultsMissing,
      'Runbook must explicitly state all non-results.',
      item
    );
  }

  for (const item of authority.unblockConditions) {
    requireText(
      normalized,
      item,
      issues,
      RESEARCH_RUNBOOK_REASON_CODES.unblockMissing,
      'Runbook must state all exact unblock conditions.',
      item
    );
  }

  for (const item of authority.orderedNextActions) {
    requireText(
      normalized,
      item,
      issues,
      RESEARCH_RUNBOOK_REASON_CODES.unblockMissing,
      'Runbook must state ordered next scientific actions.',
      item
    );
  }

  for (const item of authority.trackedAuthorityRefs) {
    requireText(
      normalized,
      item,
      issues,
      RESEARCH_RUNBOOK_REASON_CODES.sourceIndexMissing,
      'Runbook must cite only tracked VRE authority inputs.',
      item
    );
  }

  const overclaimPatterns = [
    /claim-ready\s*:\s*true/iu,
    /claimReady\s*:\s*true/iu,
    /\bsupported\s*:\s*true/iu,
    /\bconclusive\s*:\s*true/iu,
    /\bCD8 fraction\s*[:=]\s*\d/iu,
    /\bCXCL13\+\s*CD8 fraction\s*[:=]\s*\d/iu,
    /\bPhase 12 readiness\s*:\s*ready/iu
  ];
  if (overclaimPatterns.some((pattern) => pattern.test(normalized))) {
    addIssue(
      issues,
      RESEARCH_RUNBOOK_REASON_CODES.claimOverreach,
      'Runbook must not claim CD8 quantitative results, claim readiness, or Phase 12 readiness.',
      'claimBoundary'
    );
  }

  const scopeLeakPatterns = [
    /analysis\/scripts\/hgsoc_cd8_subset\.py/iu,
    /\bGraphify authority\b/iu,
    /\bPhase 12 bridge open\b/iu
  ];
  if (scopeLeakPatterns.some((pattern) => pattern.test(normalized))) {
    addIssue(
      issues,
      RESEARCH_RUNBOOK_REASON_CODES.scopeLeak,
      'Scratch analysis, Graphify, export, and Phase 12 must stay out of this handoff.',
      'scope'
    );
  }
}

export function makeResearchRunbookAuthority({ execution, snapshot }) {
  const executionSelectedH5adFiles = selectedFilesFromExecution(execution);
  const executionResult = evaluateFirstResearchPacketExecution(execution);
  const executionAccessions = new Set(
    (execution.packet?.datasets ?? []).map((dataset) => dataset.sourceAccession)
  );
  const computedTotalCells = executionSelectedH5adFiles.reduce(
    (sum, file) => sum + Number(file.nObs ?? 0),
    0
  );

  return {
    ...snapshot,
    executionSourceAccession: executionAccessions.size === 1
      ? [...executionAccessions][0]
      : null,
    computedSelectedH5adFileCount: executionSelectedH5adFiles.length,
    computedTotalCells,
    executionDecision: executionResult.decision,
    executionSelectedH5adFiles
  };
}

export function renderResearchRunbook(authority) {
  const rows = authority.selectedH5adFiles
    .map((file) => `| ${makeFileKey(file)} |`)
    .join('\n');
  const nonResults = authority.nonResults.map((item) => `- ${item}`).join('\n');
  const unblock = authority.unblockConditions.map((item) => `- ${item}`).join('\n');
  const actions = authority.orderedNextActions
    .map((item, index) => `${index + 1}. ${item}`)
    .join('\n');
  const sources = authority.trackedAuthorityRefs.map((item) => `- ${item}`).join('\n');

  return [
    '---',
    'schemaVersion: phase11.research-runbook.v1',
    `taskId: ${authority.taskId}`,
    `sourceTaskId: ${authority.sourceTaskId}`,
    `sourceAccession: ${authority.sourceAccession}`,
    `runbookStatus: ${authority.expectedDecision}`,
    'claimPromotionAllowed: false',
    'realDataReadAllowedInCi: false',
    'graphifyAuthorityAllowed: false',
    '---',
    '',
    '# Phase 11 Research Runbook Handoff',
    '',
    '## Authority Boundary',
    '',
    authority.authorityBoundary.medicalAuthority,
    authority.authorityBoundary.agentBoundary,
    'No agent may promote a biomedical claim from this runbook.',
    '',
    '## Dataset Evidence',
    '',
    `Source accession: ${authority.sourceAccession}`,
    `Selected H5AD files: ${authority.selectedH5adFileCount}`,
    `Total cells: ${formatNumber(authority.totalCells)}`,
    `Current status: ${authority.expectedDecision}`,
    'Local read boundary: local-only backed-r; CI fixture-only; no real H5AD reads in CI.',
    '',
    '| path|sha256|nObs|nVars |',
    '| --- |',
    rows,
    '',
    '## Explicit Non-Results',
    '',
    nonResults,
    '',
    '## Blockers And Unblock Conditions',
    '',
    unblock,
    '',
    '## Ordered Next Actions',
    '',
    actions,
    '',
    '## Forbidden Shortcuts',
    '',
    '- Do not use scratch analysis files as authority for this handoff.',
    '- Do not treat Graphify as authority; it remains deferred navigation context only.',
    '- Do not open export packaging, publication claims, or Phase 12 from this runbook.',
    '- Do not replace Elisa/Goette scientific review with adversarial engineering review.',
    '',
    '## Source Index',
    '',
    sources,
    ''
  ].join('\n');
}

export function validateResearchRunbook({ markdown, authority }) {
  const issues = [];

  validateAuthority(authority, issues);
  validateMarkdown(markdown, authority, issues);

  const ok = issues.length === 0;
  return {
    ok,
    decision: ok ? 'research-runbook-handoff-ready' : 'research-runbook-rejected',
    claimPromotionAllowed: false,
    realDataReadAllowedInCi: false,
    issues
  };
}
