export class EvidenceReconcileError extends Error {
  constructor({ code, message, extra = {} }) {
    super(message);
    this.name = 'EvidenceReconcileError';
    this.code = code;
    this.extra = extra;
  }
}

function fail(code, message, extra = {}) {
  throw new EvidenceReconcileError({ code, message, extra });
}

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function countGovernanceByType(rows) {
  if (!Array.isArray(rows)) {
    fail(
      'E_EVIDENCE_RECONCILE_SOURCE_MISSING',
      'governance_events_aggregated must be an array.'
    );
  }

  const counts = {};
  for (const row of rows) {
    if (typeof row?.event_type !== 'string') {
      fail(
        'E_EVIDENCE_RECONCILE_SOURCE_MISSING',
        'governance event row missing event_type.',
        { row }
      );
    }
    const count = Number(row.count);
    if (!Number.isInteger(count) || count < 0) {
      fail(
        'E_EVIDENCE_RECONCILE_SOURCE_MISSING',
        'governance event count must be a non-negative integer.',
        { row }
      );
    }
    counts[row.event_type] = (counts[row.event_type] ?? 0) + count;
  }
  return counts;
}

function countEdgesByRelation(edgesByRelation, edgeRelations) {
  if (!isPlainObject(edgesByRelation)) {
    fail(
      'E_EVIDENCE_RECONCILE_SOURCE_MISSING',
      'edges_by_relation must be an object.'
    );
  }

  const counts = {};
  for (const relation of edgeRelations) {
    if (!Object.hasOwn(edgesByRelation, relation)) {
      fail(
        'E_EVIDENCE_RECONCILE_SOURCE_MISSING',
        `edges_by_relation missing ${relation}.`,
        { relation }
      );
    }
    const edges = edgesByRelation[relation];
    if (!Array.isArray(edges)) {
      fail(
        'E_EVIDENCE_RECONCILE_SOURCE_MISSING',
        `edges_by_relation.${relation} must be an array.`,
        { relation }
      );
    }
    counts[relation] = edges.length;
  }
  return counts;
}

function normalizeR2Counts(excerpt) {
  const byStatus = excerpt?.r2_verdicts_by_status;
  if (!isPlainObject(byStatus)) {
    fail(
      'E_EVIDENCE_RECONCILE_SOURCE_MISSING',
      'r2_verdicts_by_status is required as an explicit R2 verdict source.'
    );
  }

  const counts = {};
  for (const [status, value] of Object.entries(byStatus)) {
    const count = Number(value);
    if (!Number.isInteger(count) || count < 0) {
      fail(
        'E_EVIDENCE_RECONCILE_SOURCE_MISSING',
        'R2 verdict status counts must be non-negative integers.',
        { status, value }
      );
    }
    counts[status] = count;
  }
  return counts;
}

function assertExpectedObject(value, label) {
  if (!isPlainObject(value)) {
    fail(
      'E_EVIDENCE_RECONCILE_SOURCE_MISSING',
      `${label} expected counts must be an object.`
    );
  }
}

function compareCounts({ source, actual, expected }) {
  assertExpectedObject(expected, source);
  const keys = [...new Set([
    ...Object.keys(expected),
    ...Object.keys(actual)
  ])].sort();

  for (const key of keys) {
    const expectedCount = Number(expected[key] ?? 0);
    const actualCount = Number(actual[key] ?? 0);
    if (!Number.isInteger(expectedCount) || expectedCount < 0) {
      fail(
        'E_EVIDENCE_RECONCILE_SOURCE_MISSING',
        `${source}.${key} expected count must be a non-negative integer.`,
        { source, key, expectedCount: expected[key] }
      );
    }
    if (expectedCount > 0 && actualCount === 0) {
      fail(
        'E_EVIDENCE_RECONCILE_FALSE_ZERO',
        `${source}.${key} reported zero while the corpus has rows.`,
        { source, key, expectedCount, actualCount }
      );
    }
    if (actualCount !== expectedCount) {
      fail(
        'E_EVIDENCE_RECONCILE_DIVERGENCE',
        `${source}.${key} count diverged from the corpus.`,
        { source, key, expectedCount, actualCount }
      );
    }
  }
}

export function reconcileEvidenceExcerpt(excerpt, expectedCounts, {
  edgeRelations = []
} = {}) {
  if (!isPlainObject(excerpt)) {
    fail('E_EVIDENCE_RECONCILE_SOURCE_MISSING', 'excerpt must be an object.');
  }
  if (!isPlainObject(expectedCounts)) {
    fail(
      'E_EVIDENCE_RECONCILE_SOURCE_MISSING',
      'expectedCounts must be an object.'
    );
  }
  if (!Array.isArray(edgeRelations) || edgeRelations.length === 0) {
    fail(
      'E_EVIDENCE_RECONCILE_SOURCE_MISSING',
      'edgeRelations must list the reviewed relation buckets.'
    );
  }

  compareCounts({
    source: 'governanceEventsByType',
    actual: countGovernanceByType(excerpt.governance_events_aggregated),
    expected: expectedCounts.governanceEventsByType
  });

  compareCounts({
    source: 'claimEdgesByRelation',
    actual: countEdgesByRelation(excerpt.edges_by_relation, edgeRelations),
    expected: expectedCounts.claimEdgesByRelation
  });

  const expectedR2 = expectedCounts.r2Verdicts;
  if (!isPlainObject(expectedR2)) {
    fail(
      'E_EVIDENCE_RECONCILE_SOURCE_MISSING',
      'r2Verdicts expected counts must exist.'
    );
  }
  const actualR2ByStatus = normalizeR2Counts(excerpt);
  compareCounts({
    source: 'r2Verdicts.byStatus',
    actual: actualR2ByStatus,
    expected: expectedR2.byStatus
  });
  const actualR2Total = Object.values(actualR2ByStatus)
    .reduce((total, count) => total + count, 0);
  compareCounts({
    source: 'r2Verdicts',
    actual: { total: actualR2Total },
    expected: { total: expectedR2.total }
  });

  return { ok: true };
}
