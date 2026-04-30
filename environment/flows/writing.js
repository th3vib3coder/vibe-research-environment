import { randomUUID } from 'node:crypto';
import { link, mkdir, readFile, readdir, rmdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  exportEligibility,
  EXPORT_ELIGIBILITY_REASON_CODES,
} from '../lib/export-eligibility.js';
import {
  appendExportAlert,
  appendExportRecord,
  buildExportAlertReplayKey,
  validateExportAlertRecord,
  validateExportRecord,
} from '../lib/export-records.js';
import { validateExportSnapshot, writeExportSnapshot } from '../lib/export-snapshot.js';
import { readFlowIndex, writeFlowIndex } from '../lib/flow-state.js';
import { KernelBridgeContractMismatchError } from '../lib/kernel-bridge.js';
import { listManifests } from '../lib/manifest.js';
import { logGovernanceEventViaPlugin } from '../orchestrator/governance-logger.js';
import { discoverBundlesByExperiment } from './results-discovery.js';
import { renderClaimBackedSeed } from './writing-render.js';

const WRITING_GOVERNANCE_SOURCE_COMPONENT = 'vre/flows/writing';
const FLOW_NAME = 'writing';
const COMMAND_NAME = '/flow-writing';
const WRITING_STAGE = 'writing-handoff';
const CONFIDENCE_ALERT_DELTA = 0.15;
const SNAPSHOTS_SEGMENTS = ['.vibe-science-environment', 'writing', 'exports', 'snapshots'];
const SEEDS_SEGMENTS = ['.vibe-science-environment', 'writing', 'exports', 'seeds'];
const EXPORTS_SEGMENTS = ['.vibe-science-environment', 'writing', 'exports'];
const ALERTS_PATH = path.join(...EXPORTS_SEGMENTS, 'export-alerts.jsonl');
const EXPORT_LOG_PATH = path.join(...EXPORTS_SEGMENTS, 'export-log.jsonl');

export class WritingFlowError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class WritingFlowValidationError extends WritingFlowError {}

export async function buildWritingHandoff(projectPath, options = {}) {
  const projectRoot = resolveProjectRoot(projectPath);
  const now = normalizeTimestamp(options.now ?? new Date().toISOString(), 'now');
  const snapshotId = normalizeSnapshotId(
    options.snapshotId ?? buildSnapshotId(now),
  );
  const requestedClaimIds = normalizeRequestedClaimIds(options.claimIds);
  const projections = await loadCurrentProjections(projectRoot, options.reader, {
    now,
    requestedClaimIds,
  });
  const seedRoot = resolveInside(projectRoot, ...SEEDS_SEGMENTS, snapshotId);
  await createSeedRootOnce(seedRoot, snapshotId);

  let snapshot;
  try {
    snapshot = await writeExportSnapshot(projectRoot, {
      snapshotId,
      claimIds: projections.claimStatuses.map((entry) => entry.claimId),
      claims: projections.claimStatuses.map((entry) => ({
        claimId: entry.claimId,
        statusAtExport: entry.statusAtExport,
        confidenceAtExport: entry.confidenceAtExport,
        eligible: entry.eligible,
        reasons: cloneValue(entry.reasons),
        governanceProfileAtCreation: entry.governanceProfileAtCreation,
        hasFreshSchemaValidation: entry.hasFreshSchemaValidation,
      })),
      citations: projections.claimStatuses.flatMap((entry) => (
        entry.citations.map((citation) => ({
          claimId: entry.claimId,
          citationId: citation.citationId,
          verificationStatusAtExport: normalizeVerificationStatusAtExport(citation),
        }))
      )),
      capabilities: cloneValue(projections.capabilities),
      warnings: cloneValue(projections.warnings),
    }, {
      snapshotId,
      createdAt: now,
    });
  } catch (error) {
    await removeSeedRootIfEmpty(seedRoot);
    throw error;
  }

  const manifests = await listManifests(projectRoot);
  const manifestsByClaim = buildManifestIndex(
    manifests.filter((manifest) => manifest.relatedClaims?.some((claimId) => snapshot.claimIds.includes(claimId))),
  );
  const experimentIds = uniqueStrings(
    manifests.flatMap((manifest) => manifest.experimentId),
  );
  const { bundlesByExperiment, warnings: bundleWarnings } = await discoverBundles(projectRoot, experimentIds);
  const claimStatusById = new Map(
    projections.claimStatuses.map((entry) => [entry.claimId, entry]),
  );
  const seeds = [];
  const blockedClaims = [];

  for (const claim of snapshot.claims) {
    const liveStatus = claimStatusById.get(claim.claimId);
    if (!claim.eligible || liveStatus == null) {
      blockedClaims.push(claim);
      continue;
    }

    const relatedManifests = manifestsByClaim.get(claim.claimId) ?? [];
    const resultBundles = relatedManifests
      .map((manifest) => bundlesByExperiment.get(manifest.experimentId) ?? null)
      .filter((entry) => entry != null);
    const artifactPath = toProjectRelativePath(
      ...SEEDS_SEGMENTS,
      snapshot.snapshotId,
      `${claim.claimId}.md`,
    );
    const absoluteArtifactPath = resolveInside(projectRoot, ...artifactPath.split('/'));
    const content = renderClaimBackedSeed(snapshot, claim, {
      claimHead: projections.claimHeadById.get(claim.claimId) ?? null,
      citations: liveStatus.citations,
      manifests: relatedManifests,
      resultBundles,
      notes: buildExportNotes(liveStatus),
    });

    await writeTextOnce(absoluteArtifactPath, content);
    const exportRecord = await appendExportRecord(projectRoot, {
      claimId: claim.claimId,
      snapshotId: snapshot.snapshotId,
      exportedToFlow: 'writing',
      governanceProfileAtExport: normalizeGovernanceProfileForRecord(
        claim.governanceProfileAtCreation,
      ),
      profileSafetyMode: liveStatus.profileSafetyMode,
      artifactPath,
      notes: buildExportRecordNotes(liveStatus),
    }, {
      exportedAt: now,
    });

    seeds.push({
      claimId: claim.claimId,
      snapshotId: snapshot.snapshotId,
      artifactPath,
      relatedExperimentIds: relatedManifests.map((manifest) => manifest.experimentId),
      exportRecord,
    });
  }

  const replay = await replayExportAlerts(projectRoot, {
    currentClaimHeads: projections.claimHeads,
    currentCitations: projections.citations,
    now,
  });
  const warnings = uniqueStrings([
    ...snapshot.warnings,
    ...bundleWarnings,
    ...replay.warnings,
  ]);
  const index = await syncWritingIndex(projectRoot, snapshot, {
    now,
    warnings,
    seeds,
    blockedClaims,
    replayAlerts: replay.alerts,
  });

  return {
    snapshot,
    snapshotPath: toProjectRelativePath(...SNAPSHOTS_SEGMENTS, `${snapshot.snapshotId}.json`),
    seeds,
    blockedClaims,
    alerts: replay.alerts,
    warnings,
    index,
  };
}

async function loadCurrentProjections(projectRoot, reader, options = {}) {
  const warnings = [];
  if (!hasEligibilityReader(reader)) {
    warnings.push('Kernel reader unavailable; no claim-backed writing seed can be generated.');
    return {
      claimHeads: [],
      citations: [],
      claimStatuses: [],
      claimHeadById: new Map(),
      capabilities: {
        governanceProfileAtCreationAvailable: false,
        schemaValidationSurfaceAvailable: true,
      },
      warnings,
    };
  }

  const claimHeads = filterClaimHeads(
    await safeReaderArray(reader, 'listClaimHeads', undefined, 'claim heads', warnings),
    options.requestedClaimIds,
  );
  const unresolvedClaims = filterClaimObjects(
    await safeReaderArray(reader, 'listUnresolvedClaims', undefined, 'unresolved claims', warnings),
    options.requestedClaimIds,
  );
  const citations = filterCitations(
    await safeReaderArray(reader, 'listCitationChecks', undefined, 'citation checks', warnings),
    options.requestedClaimIds,
  );
  const claimHeadById = new Map(claimHeads.map((entry) => [entry.claimId, cloneValue(entry)]));

  if (options.requestedClaimIds != null) {
    const missingClaimIds = [...options.requestedClaimIds].filter((claimId) => !claimHeadById.has(claimId));
    if (missingClaimIds.length > 0) {
      warnings.push(
        `Requested claim ids are unavailable in the current lifecycle projection: ${missingClaimIds.join(', ')}.`,
      );
    }
  }

  if (claimHeads.length === 0) {
    warnings.push('No claim heads are currently available for claim-backed writing.');
  }

  const eligibilityReader = createEligibilityReader(claimHeads, unresolvedClaims, citations);
  const claimStatuses = [];

  for (const head of claimHeads) {
    const claimCitations = citations.filter((entry) => entry?.claimId === head.claimId);
    const exportStatus = await exportEligibility(head.claimId, eligibilityReader, {
      projectPath: projectRoot,
      claimHeads,
      unresolvedClaims,
      citationChecks: claimCitations,
      requiredValidatedAfter: options.now,
    });
    claimStatuses.push(exportStatus);
  }

  return {
    claimHeads,
    citations,
    claimStatuses: claimStatuses.sort((left, right) => left.claimId.localeCompare(right.claimId)),
    claimHeadById,
    capabilities: {
      governanceProfileAtCreationAvailable: claimHeads.every(
        (entry) => resolveGovernanceProfile(entry) !== 'unknown',
      ),
      schemaValidationSurfaceAvailable: true,
    },
    warnings,
  };
}

async function replayExportAlerts(projectRoot, options = {}) {
  if (!Array.isArray(options.currentClaimHeads) || !Array.isArray(options.currentCitations)) {
    return {
      alerts: [],
      warnings: ['Post-export safety replay skipped because current projections are unavailable.'],
    };
  }

  const warnings = [];
  const snapshots = await readExportSnapshots(projectRoot, warnings);
  const existingAlerts = await readJsonLines(
    path.join(projectRoot, ALERTS_PATH),
    validateExportAlertRecord,
    warnings,
    'export alert record',
  );
  const exportRecords = await readJsonLines(
    path.join(projectRoot, EXPORT_LOG_PATH),
    validateExportRecord,
    warnings,
    'export record',
  );
  const exportedClaimKeys = new Set(
    exportRecords.map((record) => `${record.snapshotId}::${record.claimId}`),
  );
  const existingAlertsByKey = new Map();
  for (const alert of existingAlerts) {
    existingAlertsByKey.set(buildExportAlertReplayKey(alert), alert);
  }

  const currentHeadsById = new Map(
    options.currentClaimHeads.map((entry) => [entry.claimId, entry]),
  );
  const currentCitationsByKey = new Map(
    options.currentCitations
      .filter((entry) => typeof entry?.claimId === 'string' && typeof entry?.citationId === 'string')
      .map((entry) => [buildCitationKey(entry.claimId, entry.citationId), entry]),
  );
  const appendedAlerts = [];

  for (const snapshot of snapshots) {
    const claimsById = new Map(snapshot.claims.map((entry) => [entry.claimId, entry]));

    for (const snapshotClaim of snapshot.claims) {
      if (!exportedClaimKeys.has(`${snapshot.snapshotId}::${snapshotClaim.claimId}`)) {
        continue;
      }

      const currentHead = currentHeadsById.get(snapshotClaim.claimId) ?? null;
      for (const candidate of buildClaimAlertCandidates(snapshot, snapshotClaim, currentHead)) {
        const replayKey = buildExportAlertReplayKey(candidate);
        if (!shouldAppendAlert(existingAlertsByKey.get(replayKey), candidate)) {
          continue;
        }
        const persisted = await appendExportAlert(projectRoot, candidate, {
          detectedAt: options.now,
        });
        existingAlertsByKey.set(replayKey, persisted);
        appendedAlerts.push(persisted);
      }
    }

    for (const snapshotCitation of snapshot.citations) {
      if (!exportedClaimKeys.has(`${snapshot.snapshotId}::${snapshotCitation.claimId}`)) {
        continue;
      }

      const snapshotClaim = claimsById.get(snapshotCitation.claimId) ?? null;
      if (snapshotClaim == null || snapshotCitation.verificationStatusAtExport !== 'VERIFIED') {
        continue;
      }

      const currentCitation = currentCitationsByKey.get(
        buildCitationKey(snapshotCitation.claimId, snapshotCitation.citationId),
      ) ?? null;
      const candidate = buildCitationAlertCandidate(
        snapshot,
        snapshotClaim,
        snapshotCitation,
        currentCitation,
      );
      if (candidate == null) {
        continue;
      }

      const replayKey = buildExportAlertReplayKey(candidate);
      if (!shouldAppendAlert(existingAlertsByKey.get(replayKey), candidate)) {
        continue;
      }
      const persisted = await appendExportAlert(projectRoot, candidate, {
        detectedAt: options.now,
      });
      existingAlertsByKey.set(replayKey, persisted);
      appendedAlerts.push(persisted);
    }
  }

  return {
    alerts: appendedAlerts,
    warnings,
  };
}

async function syncWritingIndex(projectRoot, snapshot, options = {}) {
  const currentIndex = await readFlowIndex(projectRoot);
  const blockedMessages = options.blockedClaims.flatMap((claim) => (
    claim.reasons.length > 0
      ? [`${claim.claimId}: ${claim.reasons.join(', ')}`]
      : [`${claim.claimId}: not export-eligible`]
  ));
  const nextActions = [];

  if (options.seeds.length > 0) {
    nextActions.push(
      `draft prose from ${options.seeds.length} claim-backed seed${options.seeds.length === 1 ? '' : 's'}`,
    );
  }
  if (options.blockedClaims.length > 0) {
    nextActions.push(`resolve export blockers for ${options.blockedClaims[0].claimId}`);
  }
  if (options.replayAlerts.length > 0) {
    nextActions.push(`review ${options.replayAlerts.length} post-export alert${options.replayAlerts.length === 1 ? '' : 's'}`);
  }
  if (nextActions.length === 0) {
    nextActions.push(`review writing snapshot ${snapshot.snapshotId}`);
  }

  const blockers = uniqueStrings([
    ...blockedMessages,
    ...options.warnings
      .filter((warning) => warning.includes('unavailable') || warning.includes('No claim heads')),
  ]).slice(0, 5);

  const nextIndex = {
    ...currentIndex,
    schemaVersion: currentIndex.schemaVersion ?? 'vibe.flow.index.v1',
    activeFlow: FLOW_NAME,
    currentStage: WRITING_STAGE,
    nextActions: uniqueStrings(nextActions).slice(0, 5),
    blockers,
    lastCommand: COMMAND_NAME,
    updatedAt: options.now,
  };

  return writeFlowIndex(projectRoot, nextIndex);
}

async function discoverBundles(projectRoot, experimentIds) {
  if (!Array.isArray(experimentIds) || experimentIds.length === 0) {
    return {
      bundlesByExperiment: new Map(),
      warnings: [],
    };
  }

  return discoverBundlesByExperiment(projectRoot, experimentIds);
}

async function readExportSnapshots(projectRoot, warnings) {
  const snapshotsRoot = resolveInside(projectRoot, ...SNAPSHOTS_SEGMENTS);

  let entries;
  try {
    entries = await readdir(snapshotsRoot, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  const snapshots = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) {
      continue;
    }

    const snapshotPath = resolveInside(snapshotsRoot, entry.name);
    let parsed;
    try {
      parsed = JSON.parse(await readFile(snapshotPath, 'utf8'));
      validateExportSnapshot(parsed, {
        context: `Export snapshot ${entry.name}`,
      });
    } catch (error) {
      warnings.push(`Ignoring invalid export snapshot ${entry.name}: ${error.message}`);
      continue;
    }

    snapshots.push(parsed);
  }

  return snapshots;
}

async function readJsonLines(targetPath, validate, warnings, label) {
  let contents;
  try {
    contents = await readFile(targetPath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  const records = [];
  for (const line of contents.split(/\r?\n/u)) {
    if (line.trim() === '') {
      continue;
    }

    try {
      const parsed = JSON.parse(line);
      validate(parsed, {
        context: label,
      });
      records.push(parsed);
    } catch (error) {
      warnings.push(`Ignoring invalid ${label}: ${error.message}`);
    }
  }

  return records;
}

function buildClaimAlertCandidates(snapshot, snapshotClaim, currentHead) {
  if (currentHead == null) {
    return [];
  }

  const candidates = [];
  if (currentHead.currentStatus === 'KILLED' && snapshotClaim.statusAtExport !== 'KILLED') {
    candidates.push(buildAlertRecord(snapshot, snapshotClaim, {
      kind: 'claim_killed',
      severity: 'warning',
      message: `${snapshotClaim.claimId} was exported but is now KILLED.`,
      currentHead,
    }));
  }

  if (currentHead.currentStatus === 'DISPUTED' && snapshotClaim.statusAtExport !== 'DISPUTED') {
    candidates.push(buildAlertRecord(snapshot, snapshotClaim, {
      kind: 'claim_disputed',
      severity: 'warning',
      message: `${snapshotClaim.claimId} was exported but is now DISPUTED — remove from draft.`,
      currentHead,
    }));
  }

  if (
    typeof snapshotClaim.confidenceAtExport === 'number'
    && typeof currentHead.confidence === 'number'
    && Math.abs(snapshotClaim.confidenceAtExport - currentHead.confidence) >= CONFIDENCE_ALERT_DELTA
  ) {
    candidates.push(buildAlertRecord(snapshot, snapshotClaim, {
      kind: 'confidence_changed',
      severity: 'info',
      message: `${snapshotClaim.claimId} confidence changed: ${snapshotClaim.confidenceAtExport.toFixed(2)} -> ${currentHead.confidence.toFixed(2)} — review draft language.`,
      currentHead,
    }));
  }

  return candidates;
}

function buildCitationAlertCandidate(snapshot, snapshotClaim, snapshotCitation, currentCitation) {
  if (currentCitation == null) {
    return null;
  }

  const verificationStatus = normalizeVerificationStatusAtExport(currentCitation);
  const isInvalidated = verificationStatus !== 'VERIFIED'
    || currentCitation.retractionStatus === 'RETRACTED';
  if (!isInvalidated) {
    return null;
  }

  return buildAlertRecord(snapshot, snapshotClaim, {
    kind: 'citation_invalidated',
    severity: 'warning',
    message: `Citation ${snapshotCitation.citationId} in ${snapshotCitation.claimId} is no longer verified — review evidence chain.`,
    citationId: snapshotCitation.citationId,
  });
}

function buildAlertRecord(snapshot, snapshotClaim, options) {
  return {
    alertId: `WALERT-${Date.now()}-${randomUUID().slice(0, 8)}`,
    claimId: snapshotClaim.claimId,
    snapshotId: snapshot.snapshotId,
    kind: options.kind,
    severity: options.severity,
    message: options.message,
    citationId: options.citationId ?? null,
    snapshotStatus: snapshotClaim.statusAtExport,
    currentStatus: options.currentHead?.currentStatus ?? snapshotClaim.statusAtExport,
    snapshotConfidence: snapshotClaim.confidenceAtExport,
    currentConfidence: normalizeConfidence(
      options.currentHead?.confidence ?? snapshotClaim.confidenceAtExport,
    ),
  };
}

function shouldAppendAlert(previousAlert, nextAlert) {
  if (previousAlert == null) {
    return true;
  }

  return previousAlert.message !== nextAlert.message
    || previousAlert.currentStatus !== nextAlert.currentStatus
    || previousAlert.currentConfidence !== nextAlert.currentConfidence
    || previousAlert.snapshotConfidence !== nextAlert.snapshotConfidence;
}

function buildManifestIndex(manifests) {
  const index = new Map();

  for (const manifest of manifests) {
    for (const claimId of manifest.relatedClaims ?? []) {
      if (!index.has(claimId)) {
        index.set(claimId, []);
      }
      index.get(claimId).push(cloneValue(manifest));
    }
  }

  for (const values of index.values()) {
    values.sort((left, right) => left.experimentId.localeCompare(right.experimentId));
  }

  return index;
}

function buildExportNotes(claimStatus) {
  const notes = [];

  if (claimStatus.profileSafetyMode === 'degraded_compatibility') {
    notes.push('Compatibility mode: governance profile metadata was unavailable at export time.');
  }

  if (claimStatus.reasons.includes(EXPORT_ELIGIBILITY_REASON_CODES.reviewDebtSignal)) {
    notes.push('Review debt signal present: the kernel still reports unresolved review debt for this claim.');
  }

  return notes;
}

function buildExportRecordNotes(claimStatus) {
  const notes = buildExportNotes(claimStatus);
  return notes.length > 0 ? notes.join(' ') : null;
}

function hasEligibilityReader(reader) {
  return reader != null
    && typeof reader.listClaimHeads === 'function'
    && typeof reader.listUnresolvedClaims === 'function'
    && typeof reader.listCitationChecks === 'function';
}

function createEligibilityReader(claimHeads, unresolvedClaims, citations) {
  return {
    async listClaimHeads() {
      return cloneValue(claimHeads);
    },
    async listUnresolvedClaims() {
      return cloneValue(unresolvedClaims);
    },
    async listCitationChecks(options = {}) {
      if (typeof options.claimId !== 'string' || options.claimId.trim() === '') {
        return cloneValue(citations);
      }

      return cloneValue(citations.filter((entry) => entry?.claimId === options.claimId));
    },
  };
}

async function safeReaderArray(reader, methodName, argument, label, warnings) {
  try {
    const result = argument === undefined
      ? await reader[methodName]()
      : await reader[methodName](argument);
    return Array.isArray(result) ? cloneValue(result) : [];
  } catch (error) {
    if (error instanceof KernelBridgeContractMismatchError) {
      await recordKernelTruthMismatchGovernanceEvent(methodName);
      warnings.push(`Unable to read ${label}: kernel truth mismatch`);
    } else {
      warnings.push(`Unable to read ${label}: ${error.message}`);
    }
    return [];
  }
}

async function recordKernelTruthMismatchGovernanceEvent(projectionName) {
  try {
    await logGovernanceEventViaPlugin({
      event_type: 'kernel_vre_truth_mismatch',
      source_component: WRITING_GOVERNANCE_SOURCE_COMPONENT,
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

async function createSeedRootOnce(seedRoot, snapshotId) {
  await mkdir(path.dirname(seedRoot), { recursive: true });

  try {
    await mkdir(seedRoot);
  } catch (error) {
    if (error?.code === 'EEXIST') {
      throw new WritingFlowValidationError(
        `Writing seed directory for snapshot ${snapshotId} already exists; refusing to overwrite.`,
      );
    }

    throw error;
  }
}

async function removeSeedRootIfEmpty(seedRoot) {
  try {
    await rmdir(seedRoot);
  } catch (error) {
    if (error?.code !== 'ENOENT' && error?.code !== 'ENOTEMPTY') {
      throw error;
    }
  }
}

async function atomicPublishSeedTemp(tempPath, targetPath) {
  try {
    await link(tempPath, targetPath);
    return;
  } catch (error) {
    if (error?.code === 'EEXIST') {
      throw error;
    }
    if (error?.code !== 'EXDEV') {
      throw error;
    }
  }
  // EXDEV fallback (see P2-B note in export-snapshot.js).
  const contents = await readFile(tempPath);
  await writeFile(targetPath, contents, { flag: 'wx' });
}

async function writeTextOnce(targetPath, content) {
  await mkdir(path.dirname(targetPath), { recursive: true });
  const tempPath = `${targetPath}.tmp-${process.pid}-${randomUUID()}`;

  try {
    await writeFile(tempPath, `${content}\n`, {
      encoding: 'utf8',
      flag: 'wx',
    });
    await atomicPublishSeedTemp(tempPath, targetPath);
  } catch (error) {
    if (error?.code === 'EEXIST') {
      throw new WritingFlowValidationError(
        `Writing seed already exists at ${targetPath}; refusing to overwrite.`,
      );
    }

    throw error;
  } finally {
    try {
      await unlink(tempPath);
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        throw error;
      }
    }
  }
}

function resolveProjectRoot(projectPath) {
  if (typeof projectPath !== 'string' || projectPath.trim() === '') {
    throw new WritingFlowValidationError('projectPath must be a non-empty string.');
  }

  return path.resolve(projectPath);
}

function resolveInside(baseDir, ...segments) {
  const target = path.resolve(baseDir, ...segments);
  const relative = path.relative(baseDir, target);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new WritingFlowValidationError(`Resolved path escapes the project root: ${target}`);
  }

  return target;
}

function normalizeRequestedClaimIds(claimIds) {
  if (claimIds == null) {
    return null;
  }

  if (!Array.isArray(claimIds)) {
    throw new WritingFlowValidationError('claimIds must be an array when provided.');
  }

  return new Set(
    claimIds.map((claimId) => {
      if (typeof claimId !== 'string' || !/^C-[0-9]{3}$/u.test(claimId)) {
        throw new WritingFlowValidationError('claimIds entries must match C-XXX.');
      }

      return claimId;
    }),
  );
}

function filterClaimHeads(claimHeads, requestedClaimIds) {
  return claimHeads
    .filter((entry) => typeof entry?.claimId === 'string')
    .filter((entry) => requestedClaimIds == null || requestedClaimIds.has(entry.claimId))
    .sort((left, right) => left.claimId.localeCompare(right.claimId));
}

function filterClaimObjects(entries, requestedClaimIds) {
  return entries.filter((entry) => {
    const claimId = typeof entry === 'string' ? entry : entry?.claimId;
    return typeof claimId === 'string'
      && (requestedClaimIds == null || requestedClaimIds.has(claimId));
  });
}

function filterCitations(citations, requestedClaimIds) {
  return citations
    .filter((entry) => typeof entry?.claimId === 'string' && typeof entry?.citationId === 'string')
    .filter((entry) => requestedClaimIds == null || requestedClaimIds.has(entry.claimId))
    .sort((left, right) => {
      const byClaim = left.claimId.localeCompare(right.claimId);
      return byClaim !== 0 ? byClaim : left.citationId.localeCompare(right.citationId);
    });
}

function normalizeVerificationStatusAtExport(citation) {
  const verificationStatus = typeof citation?.verificationStatus === 'string'
    ? citation.verificationStatus
    : 'UNKNOWN';

  if (verificationStatus === 'VERIFIED') {
    return 'VERIFIED';
  }
  if (verificationStatus === 'RETRACTED' || citation?.retractionStatus === 'RETRACTED') {
    return 'RETRACTED';
  }
  if (verificationStatus === 'PENDING' || verificationStatus === 'UNRESOLVED' || verificationStatus === 'ERROR') {
    return 'UNVERIFIED';
  }

  return verificationStatus === 'UNVERIFIED' ? 'UNVERIFIED' : 'UNKNOWN';
}

function resolveGovernanceProfile(head) {
  const candidate = head?.governanceProfileAtCreation ?? head?.claimMetadata?.governanceProfileAtCreation ?? null;
  return candidate === 'default' || candidate === 'strict' ? candidate : 'unknown';
}

function normalizeGovernanceProfileForRecord(value) {
  return value === 'strict' ? 'strict' : 'default';
}

function normalizeTimestamp(value, label) {
  if (typeof value !== 'string' || value.trim() === '' || Number.isNaN(Date.parse(value))) {
    throw new WritingFlowValidationError(`${label} must be a valid ISO date-time string.`);
  }

  return value.trim();
}

function normalizeSnapshotId(value) {
  if (typeof value !== 'string' || !/^WEXP-.+$/u.test(value)) {
    throw new WritingFlowValidationError('snapshotId must match WEXP-....');
  }

  return value;
}

function buildSnapshotId(now) {
  return `WEXP-${now.replace(/[^0-9]/gu, '').slice(0, 14)}-${randomUUID().slice(0, 8)}`;
}

function buildCitationKey(claimId, citationId) {
  return `${claimId}::${citationId}`;
}

function normalizeConfidence(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return null;
  }

  return Math.max(0, Math.min(1, value));
}

function toProjectRelativePath(...segments) {
  return path.posix.join(
    ...segments.map((segment) => String(segment).replaceAll('\\', '/')),
  );
}

function uniqueStrings(values) {
  return [...new Set(values)];
}

function cloneValue(value) {
  return globalThis.structuredClone
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

// WP-184 Phase 7 Wave 1 — finalizeExportDeliverable.
//
// Reads a persisted export snapshot under
// `.vibe-science-environment/writing/exports/snapshots/<snapshotId>.json`
// (written by buildWritingHandoff / writeExportSnapshot) and emits a single
// markdown deliverable file at
// `.vibe-science-environment/writing/deliverables/<snapshotId>/<type>/deliverable.md`.
//
// Idempotency: fail-closed on re-invocation (`{flag:'wx'}` via writeTextOnce).
// The helper never touches the snapshot file itself (Phase 5.6 append-once
// immutability preserved).
export async function finalizeExportDeliverable(projectPath, input = {}) {
  const projectRoot = resolveProjectRoot(projectPath);

  if (input == null || typeof input !== 'object') {
    throw new WritingFlowValidationError(
      'finalizeExportDeliverable: input must be an object matching writing-export-finalize-input.schema.json.',
    );
  }
  const snapshotId = input.exportSnapshotId;
  const deliverableType = input.deliverableType;
  if (typeof snapshotId !== 'string' || !/^WEXP-.+$/u.test(snapshotId)) {
    throw new WritingFlowValidationError(
      `finalizeExportDeliverable: exportSnapshotId "${snapshotId}" is missing or does not match WEXP-*.`,
    );
  }
  const VALID_TYPES = new Set(['draft', 'advisor-pack', 'rebuttal-pack']);
  if (!VALID_TYPES.has(deliverableType)) {
    throw new WritingFlowValidationError(
      `finalizeExportDeliverable: deliverableType "${deliverableType}" is not one of draft|advisor-pack|rebuttal-pack.`,
    );
  }

  const snapshotPath = resolveInside(
    projectRoot,
    ...SNAPSHOTS_SEGMENTS,
    `${snapshotId}.json`,
  );
  let snapshot;
  try {
    const raw = await readFile(snapshotPath, 'utf8');
    snapshot = JSON.parse(raw);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new WritingFlowValidationError(
        `finalizeExportDeliverable: export snapshot ${snapshotId} not found at ${toProjectRelativePath(...SNAPSHOTS_SEGMENTS, `${snapshotId}.json`)}.`,
      );
    }
    throw error;
  }
  validateExportSnapshot(snapshot, { snapshotId });

  const claimRefs = Array.isArray(snapshot.claimIds) ? [...snapshot.claimIds] : [];
  const eligibleClaims = Array.isArray(snapshot.claims)
    ? snapshot.claims.filter((claim) => claim?.eligible)
    : [];

  const deliverableRelative = toProjectRelativePath(
    '.vibe-science-environment',
    'writing',
    'deliverables',
    snapshotId,
    deliverableType,
    'deliverable.md',
  );
  const deliverableAbsolute = resolveInside(
    projectRoot,
    ...deliverableRelative.split('/'),
  );

  const generatedAt = normalizeTimestamp(
    input.generatedAt ?? new Date().toISOString(),
    'generatedAt',
  );
  const content = renderDeliverableMarkdown({
    snapshotId,
    deliverableType,
    generatedAt,
    claimRefs,
    eligibleClaims,
  });

  try {
    await writeTextOnce(deliverableAbsolute, content);
  } catch (error) {
    if (error instanceof WritingFlowValidationError) {
      throw new WritingFlowValidationError(
        `finalizeExportDeliverable: deliverable already exists at ${deliverableRelative}; refusing to overwrite (fail-closed policy).`,
      );
    }
    throw error;
  }

  return {
    deliverableType,
    deliverablePath: deliverableRelative,
    snapshotId,
    claimRefs,
    warnings: [],
  };
}

function renderDeliverableMarkdown({
  snapshotId,
  deliverableType,
  generatedAt,
  claimRefs,
  eligibleClaims,
}) {
  const frontmatter = [
    '---',
    `snapshotId: ${snapshotId}`,
    `deliverableType: ${deliverableType}`,
    `generatedAt: ${generatedAt}`,
    `claimRefs: [${claimRefs.map((id) => `"${id}"`).join(', ')}]`,
    '---',
  ].join('\n');

  const body = [
    `# ${deliverableType} deliverable for ${snapshotId}`,
    '',
    `Generated at ${generatedAt}.`,
    '',
    `This deliverable was assembled from export snapshot \`${snapshotId}\`.`,
    `It references ${claimRefs.length} claim(s): ${claimRefs.join(', ') || '(none)'}.`,
    '',
    '## Eligible claim-backed content',
    '',
  ];

  if (eligibleClaims.length === 0) {
    body.push('_No eligible claim-backed blocks in this snapshot._');
  } else {
    for (const claim of eligibleClaims) {
      body.push(`### ${claim.claimId}`);
      body.push('');
      body.push(`- statusAtExport: \`${claim.statusAtExport}\``);
      body.push(`- confidenceAtExport: \`${claim.confidenceAtExport ?? 'null'}\``);
      body.push(`- governanceProfileAtCreation: \`${claim.governanceProfileAtCreation ?? 'null'}\``);
      body.push('');
    }
  }

  return [frontmatter, '', ...body].join('\n');
}
