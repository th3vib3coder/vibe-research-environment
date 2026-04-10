import { listAttempts } from '../control/attempts.js';
import { listDecisions } from '../control/decisions.js';
import { getResultsOverview } from '../flows/results-discovery.js';
import { getWritingOverview } from '../flows/writing-overview.js';
import { listLaneRuns } from './ledgers.js';

const SOURCE_PRIORITY = Object.freeze({
  'decision-log': 0,
  'attempt-summary': 1,
  'lane-run': 2,
  'export-alert': 3,
  'writing-pack': 4,
  'experiment-bundle': 5,
  'memory-mirror': 6,
});

function cloneValue(value) {
  return globalThis.structuredClone
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function normalizeQueryText(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().toLowerCase();
}

function normalizeLimit(value, defaultValue = 10) {
  if (value == null) {
    return defaultValue;
  }
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError('limit must be a non-negative integer when provided.');
  }
  return value;
}

function buildSearchTerms(queryText) {
  const normalized = normalizeQueryText(queryText);
  if (normalized === '') {
    return [];
  }

  return normalized
    .split(/\s+/u)
    .filter(Boolean);
}

function scoreHit(hit, terms) {
  if (terms.length === 0) {
    return 1;
  }

  const haystack = [
    hit.title,
    hit.summary,
    hit.sourceType,
    hit.sourceRef,
  ]
    .filter((value) => typeof value === 'string' && value.trim() !== '')
    .join(' ')
    .toLowerCase();

  let score = 0;
  for (const term of terms) {
    if (!haystack.includes(term)) {
      return 0;
    }
    score += 1;
  }

  return score;
}

function compareHits(left, right) {
  const leftScore = left._score ?? 0;
  const rightScore = right._score ?? 0;
  if (leftScore !== rightScore) {
    return rightScore - leftScore;
  }

  const leftPriority = SOURCE_PRIORITY[left.sourceType] ?? 99;
  const rightPriority = SOURCE_PRIORITY[right.sourceType] ?? 99;
  if (leftPriority !== rightPriority) {
    return leftPriority - rightPriority;
  }

  return String(right.recordedAt ?? '').localeCompare(String(left.recordedAt ?? ''));
}

function finalizeHits(hits, queryText, limit) {
  const terms = buildSearchTerms(queryText);
  const filtered = [];

  for (const hit of hits) {
    const score = scoreHit(hit, terms);
    if (terms.length > 0 && score === 0) {
      continue;
    }

    filtered.push({
      ...hit,
      _score: score,
    });
  }

  filtered.sort(compareHits);

  return filtered
    .slice(0, limit)
    .map(({ _score, ...hit }) => hit);
}

function buildDecisionHits(records) {
  return records.map((record) => ({
    hitId: record.decisionId,
    sourceType: 'decision-log',
    title: `Decision: ${record.kind}`,
    summary: [
      record.reason,
      record.flow ? `flow=${record.flow}` : null,
      record.targetId ? `target=${record.targetId}` : null,
    ]
      .filter(Boolean)
      .join(' | '),
    sourceRef: `.vibe-science-environment/control/decisions.jsonl#${record.decisionId}`,
    recordedAt: record.recordedAt ?? null,
    isStale: false,
  }));
}

function buildAttemptHits(records) {
  return records.map((record) => ({
    hitId: record.attemptId,
    sourceType: 'attempt-summary',
    title: `Attempt: ${record.status}`,
    summary: [
      record.scope ? `scope=${record.scope}` : null,
      record.targetId ? `target=${record.targetId}` : null,
      record.summary,
      record.errorCode ? `error=${record.errorCode}` : null,
    ]
      .filter(Boolean)
      .join(' | '),
    sourceRef: `.vibe-science-environment/control/attempts.jsonl#${record.attemptId}`,
    recordedAt: record.lastHeartbeatAt ?? record.startedAt ?? null,
    isStale: false,
  }));
}

function buildResultBundleHits(overview) {
  return overview.bundles.map((bundle) => ({
    hitId: `bundle:${bundle.experimentId}`,
    sourceType: 'experiment-bundle',
    title: `Result bundle: ${bundle.experimentId}`,
    summary: [
      bundle.relatedClaims?.length
        ? `claims=${bundle.relatedClaims.join(',')}`
        : null,
      Number.isInteger(bundle.artifactCount)
        ? `artifacts=${bundle.artifactCount}`
        : null,
      bundle.datasetHash ? `dataset=${bundle.datasetHash}` : null,
      bundle.latestSessionDigest?.digestId
        ? `latestDigest=${bundle.latestSessionDigest.digestId}`
        : null,
    ]
      .filter(Boolean)
      .join(' | '),
    sourceRef: bundle.bundleManifestPath,
    recordedAt: bundle.bundledAt ?? null,
    isStale: false,
  }));
}

function buildWritingPackHits(overview) {
  const packs = [
    ...(overview.advisorPacks ?? []),
    ...(overview.rebuttalPacks ?? []),
  ];

  return packs.map((pack) => ({
    hitId: `pack:${pack.kind}:${pack.packId}`,
    sourceType: 'writing-pack',
    title: `${pack.kind} pack: ${pack.packId}`,
    summary: [
      pack.figureCount > 0 ? `figures=${pack.figureCount}` : null,
      Array.isArray(pack.files) && pack.files.length > 0
        ? `files=${pack.files.join(',')}`
        : null,
    ]
      .filter(Boolean)
      .join(' | '),
    sourceRef: pack.dir,
    recordedAt: pack.updatedAt ?? null,
    isStale: false,
  }));
}

function buildExportAlertHits(overview) {
  return (overview.alerts ?? []).map((alert) => ({
    hitId: alert.alertId,
    sourceType: 'export-alert',
    title: `Export alert: ${alert.kind}`,
    summary: [
      alert.claimId ? `claim=${alert.claimId}` : null,
      alert.snapshotId ? `snapshot=${alert.snapshotId}` : null,
      alert.message ?? null,
    ]
      .filter(Boolean)
      .join(' | '),
    sourceRef: `.vibe-science-environment/writing/exports/export-alerts.jsonl#${alert.alertId}`,
    recordedAt: alert.detectedAt ?? null,
    isStale: false,
  }));
}

function buildLaneRunHits(records) {
  const latestByScope = new Set();
  return records.map((record) => {
    const key = `${record.taskId ?? 'none'}:${record.laneId}`;
    const isStale = latestByScope.has(key);
    latestByScope.add(key);

    return {
      hitId: record.laneRunId,
      sourceType: 'lane-run',
      title: `Lane run: ${record.laneId}`,
      summary: [
        record.status ? `status=${record.status}` : null,
        record.providerRef ? `provider=${record.providerRef}` : null,
        record.summary,
      ]
        .filter(Boolean)
        .join(' | '),
      sourceRef: `.vibe-science-environment/orchestrator/lane-runs.jsonl#${record.laneRunId}`,
      recordedAt: record.startedAt ?? null,
      isStale,
    };
  });
}

export function buildSourceRefsFromHits(hits = []) {
  const refs = [];
  const seen = new Set();

  for (const hit of hits) {
    const key = `${hit.sourceType}::${hit.sourceRef}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    refs.push({
      sourceType: hit.sourceType,
      label: hit.title ?? hit.sourceType,
      ref: hit.sourceRef,
      recordedAt: hit.recordedAt ?? null,
    });
  }

  return refs;
}

export async function collectRecallHits(projectPath, options = {}) {
  const limit = normalizeLimit(options.limit, 10);
  const searchLimit = Math.max(limit * 2, 10);
  const warnings = [];

  const [attempts, decisions, results, writing, laneRuns] = await Promise.all([
    listAttempts(projectPath, { limit: searchLimit }).catch((error) => {
      warnings.push(`attempt summaries unavailable: ${error.message}`);
      return [];
    }),
    listDecisions(projectPath, { limit: searchLimit }).catch((error) => {
      warnings.push(`decision summaries unavailable: ${error.message}`);
      return [];
    }),
    getResultsOverview(projectPath, {
      bundleLimit: searchLimit,
      digestLimit: searchLimit,
    }).catch((error) => {
      warnings.push(`result bundle summaries unavailable: ${error.message}`);
      return {
        bundles: [],
        warnings: [],
      };
    }),
    getWritingOverview(projectPath, {
      alertLimit: searchLimit,
      packLimit: searchLimit,
      exportLimit: 0,
      snapshotLimit: 0,
    }).catch((error) => {
      warnings.push(`writing summaries unavailable: ${error.message}`);
      return {
        advisorPacks: [],
        rebuttalPacks: [],
        alerts: [],
        warnings: [],
      };
    }),
    listLaneRuns(projectPath).catch((error) => {
      warnings.push(`lane run summaries unavailable: ${error.message}`);
      return [];
    }),
  ]);

  warnings.push(...cloneValue(results.warnings ?? []));
  warnings.push(...cloneValue(writing.warnings ?? []));

  const hits = [
    ...buildDecisionHits(decisions),
    ...buildAttemptHits(attempts),
    ...buildResultBundleHits(results),
    ...buildWritingPackHits(writing),
    ...buildExportAlertHits(writing),
    ...buildLaneRunHits(laneRuns),
  ];

  return {
    hits: finalizeHits(hits, options.queryText ?? '', limit),
    warnings,
  };
}

export async function listRecallHits(projectPath, options = {}) {
  return collectRecallHits(projectPath, options);
}

export const INTERNALS = {
  SOURCE_PRIORITY,
  buildSourceRefsFromHits,
  buildAttemptHits,
  buildDecisionHits,
  buildExportAlertHits,
  buildLaneRunHits,
  buildResultBundleHits,
  buildSearchTerms,
  buildWritingPackHits,
  finalizeHits,
  normalizeLimit,
  normalizeQueryText,
  scoreHit,
};
