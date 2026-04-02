import { mkdir, rename, rm, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  assertValid,
  atomicWriteJson,
  loadValidator,
  readJson,
  readJsonl,
  resolveInside,
  resolveProjectRoot,
} from '../control/_io.js';
import { listAttempts } from '../control/attempts.js';
import { listDecisions } from '../control/decisions.js';
import { getSessionSnapshot } from '../control/session-snapshot.js';

const SCHEMA_FILE = 'session-digest.schema.json';
const DIGEST_PREFIX = 'DIGEST-';
const EXPERIMENT_ID_PATTERN = /^EXP-[0-9]{3}$/u;
const ATTEMPT_ID_PATTERN = /^ATT-.+$/u;

export class SessionDigestError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = new.target.name;
  }
}

export async function exportSessionDigest(projectPath, options = {}) {
  const projectRoot = resolveProjectRoot(projectPath);
  const generatedAt = normalizeTimestamp(options.now ?? new Date().toISOString(), 'now');
  const snapshot = await getSessionSnapshot(projectRoot);
  const flowIndex = snapshot == null ? await readFlowIndexIfPresent(projectRoot) : null;
  const latestMetrics = await readLatestMetricsRecord(projectRoot);

  const sourceSessionId = normalizeNullableString(
    options.sourceSessionId ?? latestMetrics?.sessionId ?? null,
  );
  const digestId = normalizeDigestId(
    options.digestId ?? `${DIGEST_PREFIX}${sourceSessionId ?? 'unspecified'}`,
  );
  const attemptData = await deriveAttemptLineage(projectRoot, snapshot, latestMetrics, options);
  const decisionData = await deriveDecisionLineage(projectRoot, attemptData.ids, options);
  const experimentIds = deriveExperimentIds(
    options.experimentIds,
    attemptData.records,
    decisionData.records,
  );
  const warnings = buildWarnings({
    snapshotAvailable: snapshot != null,
    sourceSessionId,
    attemptIds: attemptData.ids,
    decisionIds: decisionData.ids,
    derivedAttemptLineage: attemptData.derived,
    latestMetrics,
    extraWarnings: options.warnings,
  });

  const digest = {
    schemaVersion: 'vibe-env.session-digest.v1',
    digestId,
    sourceSessionId,
    generatedAt,
    activeFlow: snapshot?.activeFlow ?? flowIndex?.activeFlow ?? null,
    lastCommand: snapshot?.lastCommand ?? flowIndex?.lastCommand ?? null,
    nextActions: cloneValue(snapshot?.nextActions ?? flowIndex?.nextActions ?? []),
    blockers: cloneValue(snapshot?.blockers ?? flowIndex?.blockers ?? []),
    experimentIds,
    decisionIds: decisionData.ids,
    attemptIds: attemptData.ids,
    warnings,
  };

  const validate = await loadValidator(projectRoot, SCHEMA_FILE);
  assertValid(validate, digest, 'session digest');

  const digestDir = resolveInside(
    projectRoot,
    '.vibe-science-environment',
    'results',
    'summaries',
    digestId,
  );

  await rm(digestDir, { recursive: true, force: true });
  await mkdir(digestDir, { recursive: true });
  await atomicWriteJson(path.join(digestDir, 'session-digest.json'), digest);
  await atomicWriteText(path.join(digestDir, 'session-digest.md'), renderDigestMarkdown(digest));

  return {
    digest,
    digestDir,
    jsonPath: path.join(digestDir, 'session-digest.json'),
    markdownPath: path.join(digestDir, 'session-digest.md'),
  };
}

async function deriveAttemptLineage(projectRoot, snapshot, latestMetrics, options = {}) {
  const allAttempts = await listAttempts(projectRoot, { limit: options.attemptLimit ?? 100 });

  if (Array.isArray(options.attemptIds)) {
    const attemptIds = uniqueStrings(options.attemptIds.map((value) => normalizeAttemptId(value)));
    return {
      ids: attemptIds,
      records: allAttempts.filter((record) => attemptIds.includes(record.attemptId)),
      derived: false,
    };
  }

  const candidateAttemptId = normalizeNullableString(
    options.lastAttemptId ?? latestMetrics?.lastAttemptId ?? snapshot?.lastAttemptId ?? null,
  );

  if (candidateAttemptId == null) {
    return {
      ids: [],
      records: [],
      derived: false,
    };
  }

  const attemptId = normalizeAttemptId(candidateAttemptId);
  const record = allAttempts.find((entry) => entry.attemptId === attemptId) ?? null;

  return {
    ids: [attemptId],
    records: record == null ? [] : [record],
    derived: true,
  };
}

async function deriveDecisionLineage(projectRoot, attemptIds, options = {}) {
  const allDecisions = await listDecisions(projectRoot, { limit: options.decisionLimit ?? 100 });

  if (Array.isArray(options.decisionIds)) {
    const decisionIds = uniqueStrings(
      options.decisionIds.map((value) => normalizeNonEmptyString(value, 'decisionId')),
    );
    return {
      ids: decisionIds,
      records: allDecisions.filter((record) => decisionIds.includes(record.decisionId)),
    };
  }

  if (attemptIds.length === 0) {
    return {
      ids: [],
      records: [],
    };
  }

  const matchingRecords = allDecisions.filter((record) => attemptIds.includes(record.attemptId ?? ''));
  return {
    ids: uniqueStrings(matchingRecords.map((record) => record.decisionId)),
    records: matchingRecords,
  };
}

async function readLatestMetricsRecord(projectRoot) {
  const metricsPath = resolveInside(
    projectRoot,
    '.vibe-science-environment',
    'metrics',
    'costs.jsonl',
  );
  const records = await readJsonl(metricsPath);
  if (records.length === 0) {
    return null;
  }

  return [...records].sort((left, right) =>
    String(right.recordedAt ?? '').localeCompare(String(left.recordedAt ?? '')),
  )[0];
}

async function readFlowIndexIfPresent(projectRoot) {
  const flowIndexPath = resolveInside(
    projectRoot,
    '.vibe-science-environment',
    'flows',
    'index.json',
  );

  try {
    return await readJson(flowIndexPath);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

function deriveExperimentIds(explicitExperimentIds, attemptRecords, decisionRecords) {
  if (Array.isArray(explicitExperimentIds)) {
    return uniqueStrings(explicitExperimentIds.map((value) => normalizeExperimentId(value)));
  }

  const experimentIds = [];

  for (const record of attemptRecords) {
    if (EXPERIMENT_ID_PATTERN.test(record.targetId ?? '')) {
      experimentIds.push(record.targetId);
    }
  }

  for (const record of decisionRecords) {
    if (EXPERIMENT_ID_PATTERN.test(record.targetId ?? '')) {
      experimentIds.push(record.targetId);
    }
  }

  return uniqueStrings(experimentIds);
}

function buildWarnings(context) {
  const warnings = [];

  if (!context.snapshotAvailable) {
    warnings.push('Session snapshot unavailable; used flow index fallback when possible.');
  }
  if (context.sourceSessionId == null) {
    warnings.push('No canonical sourceSessionId was available; digest uses a null source session.');
  }
  if (context.attemptIds.length === 0) {
    warnings.push('No attempt lineage could be resolved for this digest.');
  } else if (context.derivedAttemptLineage) {
    warnings.push('Attempt lineage was approximated from the latest known attempt because attempts are not yet session-scoped.');
  }
  if (context.decisionIds.length === 0) {
    warnings.push('No decision lineage could be resolved for this digest.');
  }
  if (context.latestMetrics == null) {
    warnings.push('No session metrics record was available during digest export.');
  }
  if (Array.isArray(context.extraWarnings)) {
    warnings.push(
      ...context.extraWarnings.map((value) => normalizeNonEmptyString(value, 'warning')),
    );
  }

  return uniqueStrings(warnings);
}

function renderDigestMarkdown(digest) {
  return [
    '# Session Digest',
    '',
    `- Digest ID: ${digest.digestId}`,
    `- Source Session: ${digest.sourceSessionId ?? 'unavailable'}`,
    `- Generated At: ${digest.generatedAt}`,
    `- Active Flow: ${digest.activeFlow ?? 'unavailable'}`,
    `- Last Command: ${digest.lastCommand ?? 'unavailable'}`,
    '',
    renderBulletSection('Next Actions', digest.nextActions, 'No next actions were available.'),
    '',
    renderBulletSection('Blockers', digest.blockers, 'No blockers were available.'),
    '',
    renderBulletSection('Touched Experiments', digest.experimentIds, 'No experiment ids were resolved.'),
    '',
    renderBulletSection('Referenced Decisions', digest.decisionIds, 'No decision ids were resolved.'),
    '',
    renderBulletSection('Attempt Lineage', digest.attemptIds, 'No attempt lineage was resolved.'),
    '',
    renderBulletSection('Warnings', digest.warnings, 'No warnings were recorded.'),
    '',
    '## Evidence Boundary',
    '- This digest is an operational export, not a truth artifact.',
    '- It does not certify claim truth, citation verification, gate outcomes, or governance truth.',
    '',
  ].join('\n');
}

function renderBulletSection(title, items, emptyMessage) {
  const lines = [`## ${title}`];

  if (!Array.isArray(items) || items.length === 0) {
    lines.push(`- ${emptyMessage}`);
    return lines.join('\n');
  }

  for (const item of items) {
    lines.push(`- ${item}`);
  }

  return lines.join('\n');
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

function normalizeDigestId(value) {
  const digestId = normalizeNonEmptyString(value, 'digestId');
  if (!digestId.startsWith(DIGEST_PREFIX)) {
    throw new SessionDigestError('digestId must start with DIGEST-.');
  }
  return digestId;
}

function normalizeAttemptId(value) {
  const attemptId = normalizeNonEmptyString(value, 'attemptId');
  if (!ATTEMPT_ID_PATTERN.test(attemptId)) {
    throw new SessionDigestError('attemptId must match ATT-....');
  }
  return attemptId;
}

function normalizeExperimentId(value) {
  const experimentId = normalizeNonEmptyString(value, 'experimentId');
  if (!EXPERIMENT_ID_PATTERN.test(experimentId)) {
    throw new SessionDigestError('experimentId must match EXP-XXX.');
  }
  return experimentId;
}

function normalizeNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new SessionDigestError(`${label} must be a non-empty string.`);
  }
  return value.trim();
}

function normalizeNullableString(value) {
  if (value == null) {
    return null;
  }
  return normalizeNonEmptyString(String(value), 'value');
}

function normalizeTimestamp(value, label) {
  if (typeof value !== 'string' || value.trim() === '' || Number.isNaN(Date.parse(value))) {
    throw new SessionDigestError(`${label} must be an ISO date-time string.`);
  }
  return value.trim();
}

function uniqueStrings(values) {
  return [...new Set(values)];
}

function cloneValue(value) {
  return globalThis.structuredClone
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}
