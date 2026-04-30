import { mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  atomicWriteJson,
  assertValid,
  loadValidator,
  now,
  readJson,
  resolveInside,
  resolveProjectRoot
} from '../control/_io.js';
import { getSessionSnapshot, listDecisions } from '../control/query.js';
import { KernelBridgeContractMismatchError } from '../lib/kernel-bridge.js';
import { listManifests } from '../lib/manifest.js';
import { logGovernanceEventViaPlugin } from '../orchestrator/governance-logger.js';
import {
  buildMarkIndex,
  getMemoryMarks,
  prioritizeByMarks
} from './marks.js';

const SCHEMA_FILE = 'memory-sync-state.schema.json';
const SCHEMA_VERSION = 'vibe-env.memory-sync-state.v1';
const MEMORY_SYNC_GOVERNANCE_SOURCE_COMPONENT = 'vre/memory/sync';
const DEFAULT_KERNEL_WARNING =
  'kernel DB unavailable — workspace-first memory sync only';

const MIRROR_PATHS = Object.freeze({
  projectOverview:
    '.vibe-science-environment/memory/mirrors/project-overview.md',
  decisionLog: '.vibe-science-environment/memory/mirrors/decision-log.md'
});

function syncStateFilePath(projectPath) {
  return resolveInside(
    resolveProjectRoot(projectPath),
    '.vibe-science-environment',
    'memory',
    'sync-state.json'
  );
}

function resolveMirrorPath(projectPath, relativePath) {
  return resolveInside(resolveProjectRoot(projectPath), ...relativePath.split('/'));
}

async function atomicWriteText(filePath, contents) {
  const directoryPath = path.dirname(filePath);
  await mkdir(directoryPath, { recursive: true });

  const tempPath = path.join(
    directoryPath,
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.${Math.random()
      .toString(16)
      .slice(2)}.tmp`
  );

  await writeFile(tempPath, contents, 'utf8');
  try {
    await rename(tempPath, filePath);
  } catch (error) {
    await unlink(tempPath).catch(() => {});
    throw error;
  }
}

function createWarningCollector() {
  const warnings = [];

  return {
    warnings,
    add(message) {
      if (
        typeof message === 'string' &&
        message.trim() !== '' &&
        !warnings.includes(message)
      ) {
        warnings.push(message);
      }
    }
  };
}

async function readPreviousSyncState(projectPath, warningCollector) {
  try {
    return await readJson(syncStateFilePath(projectPath));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null;
    }

    warningCollector.add(
      `Previous memory sync state could not be read: ${error.message}`
    );
    return null;
  }
}

function normalizeReader(reader, warningCollector) {
  if (!reader || typeof reader !== 'object') {
    warningCollector.add(DEFAULT_KERNEL_WARNING);
    return {
      dbAvailable: false,
      error: DEFAULT_KERNEL_WARNING
    };
  }

  if (!reader.dbAvailable) {
    warningCollector.add(reader.error ?? DEFAULT_KERNEL_WARNING);
  }

  return {
    ...reader,
    dbAvailable: Boolean(reader.dbAvailable),
    error: reader.dbAvailable ? null : reader.error ?? DEFAULT_KERNEL_WARNING
  };
}

async function safeProjectionCall({
  reader,
  methodName,
  options,
  fallback,
  label,
  warningCollector
}) {
  if (!reader.dbAvailable) {
    return {
      value: fallback,
      sourceRead: false
    };
  }

  if (typeof reader[methodName] !== 'function') {
    warningCollector.add(`${label} unavailable: reader.${methodName} is not callable`);
    return {
      value: fallback,
      sourceRead: false
    };
  }

  try {
    const value = await reader[methodName](options ?? {});
    return {
      value: value ?? fallback,
      sourceRead: true
    };
  } catch (error) {
    if (error instanceof KernelBridgeContractMismatchError) {
      await recordKernelTruthMismatchGovernanceEvent(methodName);
      warningCollector.add(`${label} unavailable: kernel truth mismatch`);
    } else {
      warningCollector.add(`${label} unavailable: ${error.message}`);
    }
    return {
      value: fallback,
      sourceRead: false
    };
  }
}

async function recordKernelTruthMismatchGovernanceEvent(projectionName) {
  try {
    await logGovernanceEventViaPlugin({
      event_type: 'kernel_vre_truth_mismatch',
      source_component: MEMORY_SYNC_GOVERNANCE_SOURCE_COMPONENT,
      objective_id: null,
      severity: 'critical',
      details: {
        projectionName,
        errorClass: 'KernelBridgeContractMismatchError',
      },
    });
  } catch (error) {
    const code = error?.code ?? error?.name ?? 'E_GOVERNANCE_LOG_FAILED';
    process.stderr.write(`[phase9-governance] kernel_vre_truth_mismatch telemetry failed: ${code}\n`);
  }
}

async function safeWorkspaceRead(readFn, fallback, warningLabel, warningCollector) {
  try {
    return {
      value: await readFn(),
      sourceRead: true
    };
  } catch (error) {
    warningCollector.add(`${warningLabel}: ${error.message}`);
    return {
      value: fallback,
      sourceRead: false
    };
  }
}

function marker(label, value) {
  if (value == null || value === '') {
    return null;
  }

  return `[${label}:${value}]`;
}

function formatMarkMarkers(marks = []) {
  return marks
    .filter((mark) => typeof mark === 'string' && mark.trim() !== '')
    .map((mark) => marker('mark', mark))
    .filter(Boolean)
    .join(' ');
}

function syncedMarker(syncedAt) {
  return marker('synced', syncedAt);
}

function formatConfidence(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return null;
  }

  return `(${value.toFixed(2)})`;
}

function formatClaimLine(head, syncedAt) {
  const narrative =
    head.narrative ??
    (head.killReason ? `kill reason: ${head.killReason}` : null) ??
    (head.r2Verdict ? `R2: ${head.r2Verdict}` : null);
  const detailParts = [
    head.currentStatus ?? 'UNKNOWN',
    formatConfidence(head.confidence),
    narrative
  ].filter(Boolean);
  const markers = [
    marker('claim', head.claimId),
    marker('session', head.sessionId),
    formatMarkMarkers(head.marks),
    syncedMarker(syncedAt)
  ]
    .filter(Boolean)
    .join(' ');

  return `- ${head.claimId ?? 'unknown claim'} — ${detailParts.join(' — ')}${markers ? ` ${markers}` : ''}`;
}

function formatExperimentLine(manifest, syncedAt) {
  const detailParts = [
    manifest.status ?? 'unknown',
    manifest.relatedClaims?.length
      ? `claims: ${manifest.relatedClaims.join(', ')}`
      : null,
    manifest.blockers?.length
      ? `blockers: ${manifest.blockers.join('; ')}`
      : null
  ].filter(Boolean);
  const markers = [
    marker('experiment', manifest.experimentId),
    formatMarkMarkers(manifest.marks),
    syncedMarker(syncedAt)
  ]
    .filter(Boolean)
    .join(' ');

  return `- ${manifest.experimentId} — ${manifest.title ?? 'Untitled experiment'} — ${detailParts.join(' — ')}${markers ? ` ${markers}` : ''}`;
}

function formatDecisionLine(decision, syncedAt) {
  const detailParts = [
    decision.recordedAt ?? 'unknown time',
    decision.flow ?? 'control',
    decision.kind ?? 'decision',
    decision.reason ?? 'no reason recorded'
  ];
  if (decision.details) {
    detailParts.push(String(decision.details));
  }
  if (decision.targetId) {
    detailParts.push(`target: ${decision.targetId}`);
  }

  const markers = [
    marker('decision', decision.decisionId),
    marker('attempt', decision.attemptId),
    syncedMarker(syncedAt)
  ]
    .filter(Boolean)
    .join(' ');

  return `- ${detailParts.join(' — ')}${markers ? ` ${markers}` : ''}`;
}

function buildSection(title, lines, syncedAt) {
  const sectionLines = [`## ${title}`];
  if (lines.length === 0) {
    sectionLines.push(`- None at last sync ${syncedMarker(syncedAt)}`);
  } else {
    sectionLines.push(...lines);
  }
  return sectionLines;
}

function sortClaimHeadsByRecency(claimHeads = []) {
  return [...claimHeads].sort((left, right) => {
    const leftMarked = Array.isArray(left.marks) && left.marks.length > 0 ? 1 : 0;
    const rightMarked = Array.isArray(right.marks) && right.marks.length > 0 ? 1 : 0;

    if (leftMarked !== rightMarked) {
      return rightMarked - leftMarked;
    }

    return String(right.timestamp ?? '').localeCompare(String(left.timestamp ?? ''));
  });
}

function sortManifestsForOverview(manifests = []) {
  const rank = new Map([
    ['blocked', 0],
    ['active', 1],
    ['planned', 2]
  ]);

  return [...manifests].sort((left, right) => {
    const leftMarked = Array.isArray(left.marks) && left.marks.length > 0 ? 1 : 0;
    const rightMarked = Array.isArray(right.marks) && right.marks.length > 0 ? 1 : 0;

    if (leftMarked !== rightMarked) {
      return rightMarked - leftMarked;
    }

    const leftRank = rank.get(left.status) ?? 9;
    const rightRank = rank.get(right.status) ?? 9;
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    return String(right.createdAt ?? '').localeCompare(String(left.createdAt ?? ''));
  });
}

function attachMarks(records, { targetType, getTargetId, markIndex }) {
  return prioritizeByMarks(records, {
    targetType,
    getTargetId,
    markIndex
  });
}

function summarizeKernelOverview(overview, syncedAt) {
  return [
    `- Active claims: ${overview?.activeClaimCount ?? 0} ${syncedMarker(syncedAt)}`,
    `- Unresolved alerts: ${overview?.unresolvedAlertCount ?? 0} ${syncedMarker(syncedAt)}`,
    `- Pending seeds: ${overview?.pendingSeedCount ?? 0} ${syncedMarker(syncedAt)}`,
    `- Active patterns: ${overview?.activePatternCount ?? 0} ${syncedMarker(syncedAt)}`
  ];
}

function summarizeLastKernelSession(overview, syncedAt) {
  if (!overview?.lastSession) {
    return [];
  }

  const lastSession = overview.lastSession;
  const sessionMarker = marker('session', lastSession.id);
  const synced = syncedMarker(syncedAt);
  const lines = [
    `- ${lastSession.id ?? 'unknown session'} — ${lastSession.startedAt ?? 'unknown start'} to ${lastSession.endedAt ?? 'open'} — ${lastSession.totalActions ?? 0} actions — ${lastSession.claimsCreated ?? 0} claims created — ${lastSession.claimsKilled ?? 0} claims killed${sessionMarker || synced ? ` ${[sessionMarker, synced].filter(Boolean).join(' ')}` : ''}`
  ];

  if (lastSession.narrativeSummary) {
    lines.push(
      `- Summary: ${lastSession.narrativeSummary}${sessionMarker || synced ? ` ${[sessionMarker, synced].filter(Boolean).join(' ')}` : ''}`
    );
  }
  if (lastSession.integrityStatus) {
    lines.push(
      `- Integrity: ${lastSession.integrityStatus}${sessionMarker || synced ? ` ${[sessionMarker, synced].filter(Boolean).join(' ')}` : ''}`
    );
  }

  return lines;
}

function summarizeRecentClaimFeedback(claimHeads, syncedAt, limit) {
  return sortClaimHeadsByRecency(claimHeads)
    .filter(
      (head) =>
        head.statusSourceEventType === 'R2_REVIEWED' ||
        head.currentStatus === 'KILLED' ||
        head.currentStatus === 'DISPUTED' ||
        Boolean(head.r2Verdict) ||
        Boolean(head.killReason)
    )
    .slice(0, limit)
    .map((head) => formatClaimLine(head, syncedAt));
}

function summarizeBlockers({
  sessionSnapshot,
  manifests,
  unresolvedClaims,
  overview,
  syncedAt
}) {
  const lines = [];
  const attemptMarker = marker('attempt', sessionSnapshot?.lastAttemptId);

  for (const blocker of sessionSnapshot?.blockers ?? []) {
    lines.push(
      `- ${blocker}${attemptMarker ? ` ${attemptMarker}` : ''} ${syncedMarker(syncedAt)}`
    );
  }

  for (const manifest of manifests.filter((entry) => entry.status === 'blocked')) {
    lines.push(
      `- ${manifest.experimentId} blocked — ${(manifest.blockers ?? []).join('; ') || 'reason not recorded'} ${marker('experiment', manifest.experimentId)} ${syncedMarker(syncedAt)}`
    );
  }

  for (const unresolved of unresolvedClaims) {
    lines.push(
      `- ${unresolved.claimId} remains unresolved under kernel stop semantics ${marker('claim', unresolved.claimId)} ${syncedMarker(syncedAt)}`
    );
  }

  for (const failure of overview?.recentGateFailures ?? []) {
    const gateBits = [
      `gate ${failure.gateId ?? 'unknown gate'} failed`,
      failure.claimId ? `for ${failure.claimId}` : null
    ]
      .filter(Boolean)
      .join(' ');
    lines.push(
      `- ${gateBits} ${[marker('claim', failure.claimId), marker('session', failure.sessionId), syncedMarker(syncedAt)]
        .filter(Boolean)
        .join(' ')}`
    );
  }

  return lines;
}

function summarizeWhereYouLeftOff(sessionSnapshot, syncedAt) {
  if (!sessionSnapshot) {
    return [];
  }

  const attemptMarker = marker('attempt', sessionSnapshot.lastAttemptId);
  const sharedMarkers = [attemptMarker, syncedMarker(syncedAt)]
    .filter(Boolean)
    .join(' ');
  const lines = [
    `- Active flow: ${sessionSnapshot.activeFlow ?? 'none'}${sharedMarkers ? ` ${sharedMarkers}` : ''}`,
    `- Current stage: ${sessionSnapshot.currentStage ?? 'none'}${sharedMarkers ? ` ${sharedMarkers}` : ''}`,
    `- Last command: ${sessionSnapshot.lastCommand ?? 'none'}${sharedMarkers ? ` ${sharedMarkers}` : ''}`
  ];

  if (Array.isArray(sessionSnapshot.nextActions) && sessionSnapshot.nextActions.length > 0) {
    lines.push(
      `- Next actions: ${sessionSnapshot.nextActions.join('; ')}${sharedMarkers ? ` ${sharedMarkers}` : ''}`
    );
  }

  return lines;
}

export function renderProjectOverviewMirror({
  syncedAt,
  overview,
  claimHeads,
  unresolvedClaims,
  manifests,
  sessionSnapshot,
  warnings = [],
  limits = {}
}) {
  const lines = [
    '# Project Overview',
    `<!-- synced: ${syncedAt} -->`,
    '',
    'Mirror only. Kernel projections and control-plane state remain authoritative.',
    ''
  ];

  if (warnings.length > 0) {
    lines.push(
      ...buildSection(
        'Sync Warnings',
        warnings.map((warning) => `- ${warning} ${syncedMarker(syncedAt)}`),
        syncedAt
      ),
      ''
    );
  }

  const activeClaims = sortClaimHeadsByRecency(claimHeads)
    .filter((head) => head.isActive !== false)
    .slice(0, limits.claimLimit ?? 8)
    .map((head) => formatClaimLine(head, syncedAt));

  const pendingExperiments = sortManifestsForOverview(manifests)
    .filter((manifest) =>
      ['planned', 'active', 'blocked'].includes(String(manifest.status ?? ''))
    )
    .slice(0, limits.experimentLimit ?? 8)
    .map((manifest) => formatExperimentLine(manifest, syncedAt));

  const recentFeedback = summarizeRecentClaimFeedback(
    claimHeads,
    syncedAt,
    limits.feedbackLimit ?? 6
  );
  const blockers = summarizeBlockers({
    sessionSnapshot,
    manifests,
    unresolvedClaims,
    overview,
    syncedAt
  });
  const whereYouLeftOff = summarizeWhereYouLeftOff(sessionSnapshot, syncedAt);

  lines.push(...buildSection('Kernel Signals', summarizeKernelOverview(overview, syncedAt), syncedAt), '');
  lines.push(...buildSection('Last Kernel Session', summarizeLastKernelSession(overview, syncedAt), syncedAt), '');
  lines.push(...buildSection('Active Claims', activeClaims, syncedAt), '');
  lines.push(...buildSection('Pending Experiments', pendingExperiments, syncedAt), '');
  lines.push(...buildSection('Recent Claim Feedback', recentFeedback, syncedAt), '');
  lines.push(...buildSection('Blockers', blockers, syncedAt), '');
  lines.push(
    ...buildSection(
      'Where You Left Off (snapshot at last sync)',
      whereYouLeftOff,
      syncedAt
    ),
    ''
  );

  return `${lines.join('\n')}\n`;
}

export function renderDecisionLogMirror({
  syncedAt,
  decisions,
  warnings = [],
  limit = 25
}) {
  const lines = [
    '# Decision Log',
    `<!-- synced: ${syncedAt} -->`,
    '',
    'Mirror only. `.vibe-science-environment/control/decisions.jsonl` remains authoritative.',
    ''
  ];

  if (warnings.length > 0) {
    lines.push(
      ...buildSection(
        'Sync Warnings',
        warnings.map((warning) => `- ${warning} ${syncedMarker(syncedAt)}`),
        syncedAt
      ),
      ''
    );
  }

  lines.push(
    ...buildSection(
      'Recent Decisions',
      decisions.slice(0, limit).map((decision) => formatDecisionLine(decision, syncedAt)),
      syncedAt
    ),
    ''
  );

  return `${lines.join('\n')}\n`;
}

function buildMirrorRecord(mirrorId, relativePath, syncedAt, sourceKinds) {
  return {
    mirrorId,
    path: relativePath,
    syncedAt,
    sourceKinds: [...new Set(sourceKinds)].sort()
  };
}

function deriveStatus({ degraded, sourceWarnings, writeFailures }) {
  if (writeFailures >= 2) {
    return 'failed';
  }

  if (degraded || sourceWarnings > 0 || writeFailures > 0) {
    return 'partial';
  }

  return 'ok';
}

async function writeMirror(projectPath, mirrorId, relativePath, contents, sourceKinds, warningCollector) {
  try {
    await atomicWriteText(resolveMirrorPath(projectPath, relativePath), contents);
    return {
      record: buildMirrorRecord(mirrorId, relativePath, now(), sourceKinds),
      failed: false
    };
  } catch (error) {
    warningCollector.add(`Failed to write ${mirrorId} mirror: ${error.message}`);
    return {
      record: buildMirrorRecord(mirrorId, relativePath, null, sourceKinds),
      failed: true
    };
  }
}

export async function getMemorySyncState(projectPath) {
  try {
    return await readJson(syncStateFilePath(projectPath));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

export async function syncMemory(projectPath, options = {}) {
  const sourceWarnings = createWarningCollector();
  const syncWarningCollector = createWarningCollector();
  const syncedAt = options.syncedAt ?? now();
  const reader = normalizeReader(options.reader, sourceWarnings);
  const previousState = await readPreviousSyncState(projectPath, syncWarningCollector);
  const marksSummary = await getMemoryMarks(projectPath);
  for (const warning of marksSummary.warnings) {
    sourceWarnings.add(warning);
  }
  const markIndex = buildMarkIndex(marksSummary.records);

  const sessionRead = await safeWorkspaceRead(
    () => getSessionSnapshot(projectPath),
    null,
    'Failed to read control session snapshot',
    sourceWarnings
  );
  const decisionsRead = await safeWorkspaceRead(
    () => listDecisions(projectPath, { limit: options.decisionLimit ?? 25 }),
    [],
    'Failed to read control decision log',
    sourceWarnings
  );
  const manifestsRead = await safeWorkspaceRead(
    () => listManifests(projectPath),
    [],
    'Failed to read experiment manifests',
    sourceWarnings
  );
  const overviewRead = await safeProjectionCall({
    reader,
    methodName: 'getProjectOverview',
    options: { recentGateLimit: options.recentGateLimit ?? 5 },
    fallback: {
      projectPath: resolveProjectRoot(projectPath),
      lastSession: null,
      activeClaimCount: 0,
      unresolvedAlertCount: 0,
      pendingSeedCount: 0,
      activePatternCount: 0,
      recentGateFailures: []
    },
    label: 'Kernel project overview',
    warningCollector: sourceWarnings
  });
  const claimHeadsRead = await safeProjectionCall({
    reader,
    methodName: 'listClaimHeads',
    options: { limit: options.claimLimit ?? 25 },
    fallback: [],
    label: 'Kernel claim heads',
    warningCollector: sourceWarnings
  });
  const unresolvedRead = await safeProjectionCall({
    reader,
    methodName: 'listUnresolvedClaims',
    options: { limit: options.unresolvedLimit ?? 10 },
    fallback: [],
    label: 'Kernel unresolved claims',
    warningCollector: sourceWarnings
  });
  const markedClaimHeads = attachMarks(claimHeadsRead.value, {
    targetType: 'claim',
    getTargetId: (head) => head.claimId,
    markIndex
  });
  const markedManifests = attachMarks(manifestsRead.value, {
    targetType: 'experiment',
    getTargetId: (manifest) => manifest.experimentId,
    markIndex
  });

  const renderedProjectOverview = renderProjectOverviewMirror({
    syncedAt,
    overview: overviewRead.value,
    claimHeads: markedClaimHeads,
    unresolvedClaims: unresolvedRead.value,
    manifests: markedManifests,
    sessionSnapshot: sessionRead.value,
    warnings: sourceWarnings.warnings,
    limits: {
      claimLimit: options.claimLimit ?? 8,
      experimentLimit: options.experimentLimit ?? 8,
      feedbackLimit: options.feedbackLimit ?? 6
    }
  });
  const renderedDecisionLog = renderDecisionLogMirror({
    syncedAt,
    decisions: decisionsRead.value,
    warnings: sourceWarnings.warnings,
    limit: options.decisionLimit ?? 25
  });

  const projectOverviewSourceKinds = [
    overviewRead.sourceRead || claimHeadsRead.sourceRead || unresolvedRead.sourceRead
      ? 'kernel'
      : null,
    sessionRead.sourceRead ? 'control' : null,
    manifestsRead.sourceRead ? 'experiments' : null,
    marksSummary.totalMarks > 0 ? 'marks' : null
  ].filter(Boolean);
  const decisionLogSourceKinds = [decisionsRead.sourceRead ? 'control' : null].filter(
    Boolean
  );

  const mirrorWrites = [
    await writeMirror(
      projectPath,
      'project-overview',
      MIRROR_PATHS.projectOverview,
      renderedProjectOverview,
      projectOverviewSourceKinds,
      syncWarningCollector
    ),
    await writeMirror(
      projectPath,
      'decision-log',
      MIRROR_PATHS.decisionLog,
      renderedDecisionLog,
      decisionLogSourceKinds,
      syncWarningCollector
    )
  ];

  const combinedWarnings = [
    ...sourceWarnings.warnings,
    ...syncWarningCollector.warnings
  ];
  const writeFailures = mirrorWrites.filter((entry) => entry.failed).length;
  const status = deriveStatus({
    degraded: !reader.dbAvailable,
    sourceWarnings: sourceWarnings.warnings.length + syncWarningCollector.warnings.length,
    writeFailures
  });
  const lastSuccessfulSyncAt =
    status === 'ok' ? syncedAt : previousState?.lastSuccessfulSyncAt ?? null;
  const state = {
    schemaVersion: SCHEMA_VERSION,
    lastSyncAt: syncedAt,
    lastSuccessfulSyncAt,
    status,
    kernelDbAvailable: reader.dbAvailable,
    degradedReason: reader.dbAvailable ? null : reader.error ?? DEFAULT_KERNEL_WARNING,
    mirrors: mirrorWrites.map((entry) => ({
      ...entry.record,
      syncedAt: entry.failed ? null : syncedAt
    })),
    warnings: combinedWarnings
  };

  const validate = await loadValidator(projectPath, SCHEMA_FILE);
  assertValid(validate, state, 'memory sync state');
  await atomicWriteJson(syncStateFilePath(projectPath), state);

  return {
    syncedAt,
    status,
    warnings: combinedWarnings,
    mirrors: state.mirrors,
    state
  };
}

export const INTERNALS = {
  buildMirrorRecord,
  deriveStatus,
  formatClaimLine,
  formatDecisionLine,
  formatExperimentLine,
  resolveMirrorPath,
  renderDecisionLogMirror,
  renderProjectOverviewMirror,
  summarizeBlockers,
  summarizeWhereYouLeftOff
};
