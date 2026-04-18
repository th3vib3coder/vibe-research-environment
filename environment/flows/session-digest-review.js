import { getLatestLaneRun, listLaneRuns } from '../orchestrator/ledgers.js';
import { getQueueTask } from '../orchestrator/queue.js';

// WP-163 Phase 6 Wave 2 — session-digest-review helper.
//
// Returns the review lineage payload review-lane.js needs to replace the
// default `resolveReviewTask` branch for this registered kind. Matches the
// WP-163 contract:
//   (1) read completed `session-digest-export` lane-run via
//       `input.executionLaneRunId` (listLaneRuns / getLatestLaneRun)
//   (2) collect its artifactRefs; if `input.comparedArtifactRefs` supplied,
//       intersect — never expand beyond what execution actually produced.
//   (3) return `{comparedArtifactRefs, executionLaneRunId}`.
//
// The helper does NOT itself call `invokeLaneBinding`; the review-lane
// retains that responsibility so adapter (shape) stays separated from
// evidence producer (provider gateway) — same division as Phase 5.5 WP-128.

export class SessionDigestReviewError extends Error {
  constructor(message, { code } = {}) {
    super(message);
    this.name = 'SessionDigestReviewError';
    if (code) this.code = code;
  }
}

function intersectArtifacts(available, requested) {
  if (!Array.isArray(requested) || requested.length === 0) {
    return [...available];
  }
  const allowedSet = new Set(available);
  const selected = [];
  const missing = [];
  for (const ref of requested) {
    if (allowedSet.has(ref)) {
      selected.push(ref);
    } else {
      missing.push(ref);
    }
  }
  if (missing.length > 0) {
    throw new SessionDigestReviewError(
      `session-digest-review: comparedArtifactRefs not present in execution lane run: ${missing.join(', ')}. Review cannot expand beyond what execution produced.`,
      { code: 'contract-mismatch' },
    );
  }
  return selected;
}

export async function reviewSessionDigest(projectPath, input = {}) {
  if (input == null || typeof input !== 'object') {
    throw new SessionDigestReviewError(
      'session-digest-review: input must be an object matching session-digest-review-input.schema.json.',
      { code: 'contract-mismatch' },
    );
  }
  const { executionLaneRunId, comparedArtifactRefs } = input;

  if (typeof executionLaneRunId !== 'string' || !/^ORCH-RUN-.+$/u.test(executionLaneRunId)) {
    throw new SessionDigestReviewError(
      `session-digest-review: executionLaneRunId "${executionLaneRunId}" is missing or does not match ORCH-RUN-*.`,
      { code: 'contract-mismatch' },
    );
  }

  // WP-168 (Phase 6 Wave 3, adversarial finding 5): self-reference guard via
  // laneId mismatch. Look across ALL lanes — if the referenced lane-run is
  // actually a review run (or any non-execution lane), reject as contract
  // mismatch with a precise message, instead of surfacing as the vague
  // "not found in execution lane-runs" error.
  const allLaneRuns = await listLaneRuns(projectPath, {});
  const anyRun = allLaneRuns.find((record) => record.laneRunId === executionLaneRunId);
  if (anyRun && anyRun.laneId !== 'execution') {
    throw new SessionDigestReviewError(
      `session-digest-review: executionLaneRunId ${executionLaneRunId} belongs to lane "${anyRun.laneId}", not "execution". A review task cannot reference a non-execution lane run (including its own review lane run).`,
      { code: 'contract-mismatch' },
    );
  }

  // WP-163: verify the referenced lane-run exists in THIS project's
  // lane-runs.jsonl. Cross-session review is deferred to Phase 7+ per
  // "Provider Binding Decisions Frozen For Wave 4" §2 — we refuse to
  // resolve refs against another session's ledger.
  const executionRun = allLaneRuns.find(
    (record) => record.laneRunId === executionLaneRunId && record.laneId === 'execution',
  );
  if (!executionRun) {
    throw new SessionDigestReviewError(
      `session-digest-review: executionLaneRunId ${executionLaneRunId} did not resolve in the current project's lane-runs.jsonl. Cross-session review is not supported in Phase 6.`,
      { code: 'contract-mismatch' },
    );
  }

  if (executionRun.status !== 'completed') {
    throw new SessionDigestReviewError(
      `session-digest-review: lane run ${executionLaneRunId} has status "${executionRun.status}"; only completed execution runs may be reviewed.`,
      { code: 'contract-mismatch' },
    );
  }

  // WP-168 (adversarial finding 4): tighten to require the referenced lane-run
  // comes from a `session-digest-export` task. Without this, any completed
  // execution lane-run with artifactRefs (e.g., memory-sync-refresh,
  // literature-flow-register) would be silently accepted as a digest subject.
  if (executionRun.taskId) {
    const queueTask = await getQueueTask(projectPath, executionRun.taskId);
    const taskKind = queueTask?.targetRef?.kind ?? null;
    if (taskKind !== 'session-digest-export') {
      throw new SessionDigestReviewError(
        `session-digest-review: lane run ${executionLaneRunId} was produced by task kind "${taskKind ?? 'unknown'}", not "session-digest-export". Review requires a digest-producing execution run.`,
        { code: 'contract-mismatch' },
      );
    }
  }

  // Intersect vs expand: never let the reviewer reach outside the producer's
  // declared artifactRefs.
  const available = Array.isArray(executionRun.artifactRefs) ? executionRun.artifactRefs : [];
  if (available.length === 0) {
    throw new SessionDigestReviewError(
      `session-digest-review: execution lane run ${executionLaneRunId} has no artifactRefs to compare.`,
      { code: 'contract-mismatch' },
    );
  }
  const selected = intersectArtifacts(available, comparedArtifactRefs);

  return {
    comparedArtifactRefs: selected,
    executionLaneRunId,
  };
}

// Convenience re-export for task-registry `helperExport`: callers look up the
// helper by name and the registry verifies it is a function. `getLatestLaneRun`
// is re-exported so downstream tests can exercise the same resolution path.
export { getLatestLaneRun };
