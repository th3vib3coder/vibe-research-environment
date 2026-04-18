import path from 'node:path';

import { exportSessionDigest } from '../flows/session-digest.js';
import { registerPaper } from '../flows/literature.js';
import { reviewSessionDigest } from '../flows/session-digest-review.js';
import { syncMemory } from '../memory/sync.js';

function relativeUnder(projectPath, absolutePath) {
  return path.relative(projectPath, absolutePath).replace(/\\/gu, '/');
}

async function runSessionDigestExport(projectPath, input = {}) {
  const result = await exportSessionDigest(projectPath, {
    sourceSessionId: input.sourceSessionId ?? null,
    warnings: input.warnings ?? [],
  });

  return {
    summary: `Exported session digest ${result.digest.digestId}.`,
    artifactRefs: [
      relativeUnder(projectPath, result.jsonPath),
      relativeUnder(projectPath, result.markdownPath),
    ],
    warningCount: result.digest.warnings.length,
    payload: result,
  };
}

async function runLiteratureFlowRegister(projectPath, input = {}) {
  if (input == null || typeof input !== 'object') {
    throw new Error('literature-flow-register input must be an object matching literature-register-input schema.');
  }
  if (typeof input.title !== 'string' || input.title.trim() === '') {
    throw new Error('literature-flow-register requires input.title');
  }

  const result = await registerPaper(projectPath, input);
  const paperId = result.paper?.id ?? 'unknown';
  const artifactRef = `.vibe-science-environment/flows/literature.json#papers/${paperId}`;

  return {
    summary: `Registered paper ${paperId} (${result.paper?.title ?? 'untitled'}).`,
    artifactRefs: [artifactRef],
    warningCount: Array.isArray(result.warnings) ? result.warnings.length : 0,
    payload: {
      paper: result.paper,
      state: result.state,
    },
  };
}

async function runMemorySyncRefresh(projectPath, input = {}) {
  const result = await syncMemory(projectPath, {
    reader: input.reader,
    syncedAt: input.syncedAt,
    decisionLimit: input.decisionLimit,
    recentGateLimit: input.recentGateLimit,
    claimLimit: input.claimLimit,
    unresolvedLimit: input.unresolvedLimit,
  });

  const mirrors = Array.isArray(result.mirrors) ? result.mirrors : [];
  const artifactRefs = mirrors
    .map((mirror) => mirror?.relativePath ?? mirror?.path ?? null)
    .filter(Boolean);

  const kernelAvailable = mirrors.some((mirror) => mirror?.sourceMode === 'kernel-backed') ||
    result.status === 'ok';

  return {
    summary: `Memory sync ${result.status} at ${result.syncedAt}.`,
    artifactRefs,
    warningCount: Array.isArray(result.warnings) ? result.warnings.length : 0,
    payload: {
      syncState: result.state,
      kernelAvailable,
    },
  };
}

// WP-164 Phase 6 Wave 2: session-digest-review is a review-lane adapter.
// Unlike the execution-lane adapters above, it does NOT produce a lane-run
// summary/artifactRefs shape; review-lane.js consumes the
// `{comparedArtifactRefs, executionLaneRunId}` output to replace its default
// `resolveReviewTask` branch and then drives `invokeLaneBinding`
// unchanged. See `environment/flows/session-digest-review.js` for details.
async function runSessionDigestReviewAdapter(projectPath, input = {}) {
  return reviewSessionDigest(projectPath, input);
}

const ADAPTERS = Object.freeze({
  'session-digest-export': runSessionDigestExport,
  'literature-flow-register': runLiteratureFlowRegister,
  'memory-sync-refresh': runMemorySyncRefresh,
  'session-digest-review': runSessionDigestReviewAdapter,
});

export function getTaskAdapter(taskKind) {
  return ADAPTERS[taskKind] ?? null;
}

export function listAdapterTaskKinds() {
  return Object.keys(ADAPTERS).sort();
}
