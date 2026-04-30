import { copyFile, mkdir, readFile, rename, rm, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { getSessionSnapshot } from '../control/session-snapshot.js';
import { resolveInside, resolveProjectRoot } from '../control/_io.js';
import { readFlowIndex, writeFlowIndex } from '../lib/flow-state.js';
import { KernelBridgeContractMismatchError } from '../lib/kernel-bridge.js';
import { listManifests } from '../lib/manifest.js';
import { logGovernanceEventViaPlugin } from '../orchestrator/governance-logger.js';
import {
  renderAdvisorStatusSummary,
  renderClaimStatus,
  renderExperimentPlan,
  renderExperimentProgress,
  renderNextSteps,
  renderOpenQuestions,
  renderResponseDraft,
  renderReviewerComments,
} from './writing-pack-render.js';
import { getResultsOverview } from './results-discovery.js';
import { getWritingOverview } from './writing-overview.js';

const WRITING_PACKS_GOVERNANCE_SOURCE_COMPONENT = 'vre/flows/writing-packs';
const FLOW_NAME = 'writing';
const COMMAND_NAME = '/flow-writing';

export async function buildAdvisorPack(projectPath, options = {}) {
  const projectRoot = resolveProjectRoot(projectPath);
  const packDate = normalizePackDate(options.date ?? new Date().toISOString().slice(0, 10));
  const packDir = resolveInside(projectRoot, '.vibe-science-environment', 'writing', 'advisor-packs', packDate);
  const [session, flowIndex, manifests, results, writing] = await Promise.all([
    getSessionSnapshot(projectRoot),
    readFlowIndex(projectRoot),
    listManifests(projectRoot),
    getResultsOverview(projectRoot, { bundleLimit: 20, digestLimit: 10 }),
    getWritingOverview(projectRoot, { snapshotLimit: 5, exportLimit: 5, alertLimit: 10, packLimit: 5 }),
  ]);

  await rm(packDir, { recursive: true, force: true });
  await mkdir(packDir, { recursive: true });

  const copiedFigures = await copyAdvisorFigures(projectRoot, packDir, results.bundles);
  await Promise.all([
    atomicWriteText(path.join(packDir, 'status-summary.md'), renderAdvisorStatusSummary(packDate, session, writing)),
    atomicWriteText(path.join(packDir, 'experiment-progress.md'), renderExperimentProgress(manifests, results.bundles)),
    atomicWriteText(path.join(packDir, 'open-questions.md'), renderOpenQuestions(session, flowIndex, manifests, writing)),
    atomicWriteText(path.join(packDir, 'next-steps.md'), renderNextSteps(session, flowIndex, writing)),
  ]);

  const warnings = uniqueStrings([...results.warnings, ...writing.warnings]);
  const index = await syncWritingPackIndex(projectRoot, 'advisor-pack', {
    now: options.now ?? new Date().toISOString(),
    nextActions: [
      `review advisor pack ${packDate}`,
      ...(writing.totalAlerts > 0 ? [`triage ${writing.totalAlerts} export alert${writing.totalAlerts === 1 ? '' : 's'}`] : []),
    ],
    blockers: warnings,
  });

  return {
    packType: 'advisor',
    packId: packDate,
    packDir: toProjectRelativePath('.vibe-science-environment', 'writing', 'advisor-packs', packDate),
    copiedFigures,
    warnings,
    index,
  };
}

export async function buildRebuttalPack(projectPath, submissionId, options = {}) {
  const projectRoot = resolveProjectRoot(projectPath);
  const normalizedSubmissionId = normalizeSubmissionId(submissionId);
  const packDir = resolveInside(projectRoot, '.vibe-science-environment', 'writing', 'rebuttal', normalizedSubmissionId);
  const [results, writing, manifests] = await Promise.all([
    getResultsOverview(projectRoot, { bundleLimit: 20, digestLimit: 10 }),
    getWritingOverview(projectRoot, { snapshotLimit: 5, exportLimit: 10, alertLimit: 10, packLimit: 5 }),
    listManifests(projectRoot),
  ]);
  const challengedClaimIds = normalizeClaimIds(options.claimIds ?? writing.exports.map((entry) => entry.claimId));
  const claimHeads = await safeReaderArray(options.reader, 'listClaimHeads');
  const citationChecks = await safeReaderArray(options.reader, 'listCitationChecks');
  const reviewerComments = await normalizeReviewerComments(projectRoot, options);

  await rm(packDir, { recursive: true, force: true });
  await mkdir(packDir, { recursive: true });

  await Promise.all([
    atomicWriteText(path.join(packDir, 'reviewer-comments.md'), renderReviewerComments(reviewerComments)),
    atomicWriteText(path.join(packDir, 'claim-status.md'), renderClaimStatus(challengedClaimIds, claimHeads, citationChecks, writing.exports)),
    atomicWriteText(path.join(packDir, 'experiment-plan.md'), renderExperimentPlan(challengedClaimIds, manifests, results.bundles)),
    atomicWriteText(path.join(packDir, 'response-draft.md'), renderResponseDraft(reviewerComments, challengedClaimIds, claimHeads, writing.alerts)),
  ]);

  const warnings = uniqueStrings([
    ...writing.warnings,
    ...(challengedClaimIds.length === 0 ? ['No challenged claim ids were supplied or derivable from exports.'] : []),
    ...(!Array.isArray(reviewerComments) || reviewerComments.length === 0
      ? ['No reviewer comments were imported; response draft remains a skeleton.']
      : []),
  ]);
  const index = await syncWritingPackIndex(projectRoot, 'rebuttal-pack', {
    now: options.now ?? new Date().toISOString(),
    nextActions: [
      `review rebuttal pack ${normalizedSubmissionId}`,
      ...(challengedClaimIds.length > 0 ? [`validate response evidence for ${challengedClaimIds[0]}`] : []),
    ],
    blockers: warnings,
  });

  return {
    packType: 'rebuttal',
    packId: normalizedSubmissionId,
    packDir: toProjectRelativePath('.vibe-science-environment', 'writing', 'rebuttal', normalizedSubmissionId),
    warnings,
    claimIds: challengedClaimIds,
    index,
  };
}

async function copyAdvisorFigures(projectRoot, packDir, bundles) {
  const copied = [];
  for (const bundle of bundles ?? []) {
    if (typeof bundle?.bundleManifestPath !== 'string') {
      continue;
    }

    const manifestPath = resolveInside(projectRoot, ...bundle.bundleManifestPath.split('/'));
    let bundleManifest;
    try {
      bundleManifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    } catch {
      continue;
    }

    for (const artifact of bundleManifest.artifacts ?? []) {
      if (artifact?.type !== 'figure' || typeof artifact?.path !== 'string') {
        continue;
      }

      const sourcePath = resolveInside(projectRoot, ...bundle.bundleDir.split('/'), ...artifact.path.split('/'));
      const targetPath = resolveInside(packDir, 'figures', bundle.experimentId, ...artifact.path.split('/'));
      await mkdir(path.dirname(targetPath), { recursive: true });
      await copyFile(sourcePath, targetPath);
      copied.push({
        experimentId: bundle.experimentId,
        sourcePath: toProjectRelativePath(bundle.bundleDir, artifact.path),
        packPath: toProjectRelativePath(
          '.vibe-science-environment',
          'writing',
          'advisor-packs',
          path.basename(packDir),
          'figures',
          bundle.experimentId,
          artifact.path,
        ),
      });
    }
  }

  return copied;
}

async function syncWritingPackIndex(projectRoot, stage, options = {}) {
  const currentIndex = await readFlowIndex(projectRoot);
  return writeFlowIndex(projectRoot, {
    ...currentIndex,
    schemaVersion: currentIndex.schemaVersion ?? 'vibe.flow.index.v1',
    activeFlow: FLOW_NAME,
    currentStage: stage,
    nextActions: uniqueStrings(options.nextActions ?? []).slice(0, 5),
    blockers: uniqueStrings(options.blockers ?? []).slice(0, 5),
    lastCommand: COMMAND_NAME,
    updatedAt: options.now ?? new Date().toISOString(),
  });
}

async function normalizeReviewerComments(projectRoot, options) {
  if (Array.isArray(options.reviewerComments)) {
    return options.reviewerComments.map(normalizeReviewerComment).filter(Boolean);
  }

  if (typeof options.reviewerComments === 'string') {
    return options.reviewerComments.split(/\r?\n/u).map(normalizeReviewerComment).filter(Boolean);
  }

  if (typeof options.reviewerCommentsPath === 'string' && options.reviewerCommentsPath.trim() !== '') {
    const reviewerPath = resolveInside(projectRoot, ...options.reviewerCommentsPath.trim().replaceAll('\\', '/').split('/'));
    const contents = await readFile(reviewerPath, 'utf8');
    return contents.split(/\r?\n/u).map(normalizeReviewerComment).filter(Boolean);
  }

  return [];
}

async function safeReaderArray(reader, methodName) {
  if (reader == null || typeof reader[methodName] !== 'function') {
    return [];
  }

  try {
    const result = await reader[methodName]();
    return Array.isArray(result) ? result : [];
  } catch (error) {
    if (error instanceof KernelBridgeContractMismatchError) {
      await recordKernelTruthMismatchGovernanceEvent(methodName);
    }
    return [];
  }
}

async function recordKernelTruthMismatchGovernanceEvent(projectionName) {
  try {
    await logGovernanceEventViaPlugin({
      event_type: 'kernel_vre_truth_mismatch',
      source_component: WRITING_PACKS_GOVERNANCE_SOURCE_COMPONENT,
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

async function atomicWriteText(targetPath, content) {
  const temporaryPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(temporaryPath, `${content}\n`, 'utf8');

  try {
    await rename(temporaryPath, targetPath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => {});
    throw error;
  }
}

function normalizePackDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value.trim())) {
    throw new TypeError('advisor pack date must match YYYY-MM-DD.');
  }
  return value.trim();
}

function normalizeSubmissionId(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError('submissionId must be a non-empty string.');
  }
  return value.trim();
}

function normalizeClaimIds(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value.filter((entry) => typeof entry === 'string' && /^C-[0-9]{3}$/u.test(entry)))];
}

function normalizeReviewerComment(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function toProjectRelativePath(...segments) {
  return path.posix.join(...segments.map((segment) => String(segment).replaceAll('\\', '/')));
}

function uniqueStrings(values) {
  return [...new Set((values ?? []).filter((entry) => typeof entry === 'string' && entry.trim() !== ''))];
}
