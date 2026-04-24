const STAGE_INTENTS = Object.freeze({
  orientation: Object.freeze({
    allowedTaskKinds: ['literature-flow-register', 'analysis-execution-run'],
    keywords: ['question', 'scope', 'dataset', 'literature', 'objective', 'hypothesis']
  }),
  analysis: Object.freeze({
    allowedTaskKinds: ['analysis-execution-run'],
    keywords: ['analysis', 'perturbation', 'signature', 'differential', 'cluster', 'experiment', 'result']
  }),
  results: Object.freeze({
    allowedTaskKinds: ['analysis-execution-run', 'package-results'],
    keywords: ['result', 'package', 'summary', 'figure', 'table', 'bundle', 'export']
  }),
  review: Object.freeze({
    allowedTaskKinds: ['session-digest-review'],
    keywords: ['review', 'reviewer', 'reviewer-2', 'digest', 'checkpoint', 'verdict']
  }),
  writing: Object.freeze({
    allowedTaskKinds: ['writing-export-finalize'],
    keywords: ['writing', 'draft', 'manuscript', 'export']
  })
});

const CONTRADICTION_PATTERNS = Object.freeze([
  Object.freeze({
    code: 'explicit-tangent',
    pattern: /\b(tangential|unrelated|off-topic|out of scope|orthogonal)\b/iu
  }),
  Object.freeze({
    code: 'dataset-scope-shift',
    pattern: /\b(new|different|unrelated)\s+(dataset|cohort|atlas|study)\b/iu
  }),
  Object.freeze({
    code: 'biological-direction-shift',
    pattern: /\b(new|different|unrelated)\s+(biology|biological direction|lineage|cell type|pathway)\b/iu
  })
]);

const TOKEN_STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'that',
  'this',
  'into',
  'then',
  'than',
  'still',
  'after',
  'before',
  'while',
  'only',
  'more',
  'work',
  'task',
  'tasks',
  'stage',
  'phase'
]);

function normalizeText(value) {
  return typeof value === 'string' ? value.toLowerCase() : '';
}

function tokenize(value) {
  return new Set(
    normalizeText(value)
      .match(/[a-z0-9]+/gu)?.filter((token) => token.length > 1 && !TOKEN_STOPWORDS.has(token)) ?? []
  );
}

function setIntersectionSize(left, right) {
  let overlap = 0;
  for (const token of left) {
    if (right.has(token)) {
      overlap += 1;
    }
  }
  return overlap;
}

function deriveStageCursor(objectiveRecord) {
  const stages = Array.isArray(objectiveRecord?.stages) ? objectiveRecord.stages : [];
  const currentStage = stages.find((stage) => stage?.status !== 'completed') ?? stages.at(-1) ?? null;
  return currentStage?.stageId ?? 'orientation';
}

function readRecentQueueRecords(queueState) {
  const records = Array.isArray(queueState?.latestRecords)
    ? queueState.latestRecords
    : Array.isArray(queueState?.records)
      ? queueState.records
      : [];
  return records.slice(-3);
}

function readRecentEvents(events) {
  return Array.isArray(events) ? events.slice(-5) : [];
}

function readRecentHandoffs(handoffs) {
  return Array.isArray(handoffs) ? handoffs.slice(-3) : [];
}

function summarizeRecentEvidence(queueRecords, events, handoffs, openBlockers) {
  return [
    ...queueRecords.map((record) => [
      record.taskKind,
      record.taskId,
      record.analysisId,
      ...(Array.isArray(record.resultArtifactPaths) ? record.resultArtifactPaths : [])
    ].filter(Boolean).join(' ')),
    ...events.map((event) => [
      event.kind,
      event.payload?.code,
      event.payload?.message,
      event.payload?.summary,
      event.payload?.reason
    ].filter(Boolean).join(' ')),
    ...handoffs.map((handoff) => handoff.summary).filter(Boolean),
    ...openBlockers.map((blocker) => [blocker.code, blocker.message].filter(Boolean).join(' '))
  ].filter(Boolean);
}

function normalizeCheckpointResult(result, phase) {
  if (typeof result === 'string') {
    return {
      status: result,
      phase
    };
  }
  return {
    ...(result ?? {}),
    phase: result?.phase ?? phase
  };
}

export function evaluateDeterministicStrategicCheckpoint(context = {}) {
  const objectiveRecord = context.objectiveRecord ?? null;
  const phase = context.phase ?? 'pre-slice';
  if (objectiveRecord == null || typeof objectiveRecord.question !== 'string') {
    return normalizeCheckpointResult({
      status: 'uncertain',
      message: 'Strategic checkpoint could not read the objective question from durable state.'
    }, phase);
  }

  const currentStage = context.snapshotState?.snapshot?.stageCursor?.current ?? deriveStageCursor(objectiveRecord);
  const stageIntent = STAGE_INTENTS[currentStage] ?? null;
  if (stageIntent == null) {
    return normalizeCheckpointResult({
      status: 'uncertain',
      message: `Strategic checkpoint has no reviewed stage-intent map for ${currentStage}.`
    }, phase);
  }

  const queueRecords = readRecentQueueRecords(context.queueState);
  const recentEvents = readRecentEvents(context.events);
  const recentHandoffs = readRecentHandoffs(context.handoffs);
  const openBlockers = Array.isArray(context.snapshotState?.snapshot?.openBlockers)
    ? context.snapshotState.snapshot.openBlockers
    : [];
  const evidenceParts = summarizeRecentEvidence(queueRecords, recentEvents, recentHandoffs, openBlockers);
  const evidenceText = evidenceParts.join(' ');
  const objectiveTokens = tokenize(`${objectiveRecord.title ?? ''} ${objectiveRecord.question}`);
  const evidenceTokens = tokenize(evidenceText);
  const handoffTokens = tokenize(recentHandoffs.map((handoff) => handoff.summary ?? '').join(' '));
  const stageIntentTokens = tokenize(stageIntent.keywords.join(' '));
  const objectiveOverlap = setIntersectionSize(objectiveTokens, evidenceTokens);
  const stageOverlap = setIntersectionSize(stageIntentTokens, handoffTokens);
  const taskKindsOutsideStage = queueRecords
    .map((record) => record.taskKind)
    .filter((taskKind) => typeof taskKind === 'string' && !stageIntent.allowedTaskKinds.includes(taskKind));
  const contradictionFlags = CONTRADICTION_PATTERNS
    .filter((entry) => entry.pattern.test(evidenceText))
    .map((entry) => entry.code);
  const finalQuarter = phase === 'final-quarter' || context.snapshotState?.snapshot?.budgetRemaining?.maxIterationsLeft <= 1;

  if (taskKindsOutsideStage.length > 0) {
    return normalizeCheckpointResult({
      status: 'drifted',
      message: `Recent task kinds drifted outside the ${currentStage} stage intent: ${[...new Set(taskKindsOutsideStage)].join(', ')}.`,
      signals: {
        taskKindsOutsideStage,
        objectiveOverlap,
        stageOverlap,
        contradictionFlags
      }
    }, phase);
  }

  if (contradictionFlags.length > 0 && objectiveOverlap === 0) {
    return normalizeCheckpointResult({
      status: 'drifted',
      message: `Recent unattended evidence introduced an explicit strategic contradiction (${contradictionFlags.join(', ')}).`,
      signals: {
        taskKindsOutsideStage,
        objectiveOverlap,
        stageOverlap,
        contradictionFlags
      }
    }, phase);
  }

  if (recentHandoffs.length === 0 && contradictionFlags.length === 0 && taskKindsOutsideStage.length === 0) {
    return normalizeCheckpointResult({
      status: 'aligned',
      message: 'No contradictory unattended evidence was found for this wake.',
      signals: {
        taskKindsOutsideStage,
        objectiveOverlap,
        stageOverlap,
        contradictionFlags
      }
    }, phase);
  }

  if (objectiveOverlap === 0 && recentHandoffs.length > 0 && stageOverlap === 0) {
    return normalizeCheckpointResult({
      status: 'drifted',
      message: 'Recent handoff summaries no longer overlap the objective question or the current stage intent.',
      signals: {
        taskKindsOutsideStage,
        objectiveOverlap,
        stageOverlap,
        contradictionFlags
      }
    }, phase);
  }

  if (
    finalQuarter &&
    (objectiveOverlap <= 1 || (recentHandoffs.length > 0 && stageOverlap === 0))
  ) {
    return normalizeCheckpointResult({
      status: 'uncertain',
      message: 'Final-quarter checkpoint could not prove the next unattended slice still serves the objective strongly enough to continue without review.',
      signals: {
        taskKindsOutsideStage,
        objectiveOverlap,
        stageOverlap,
        contradictionFlags
      }
    }, phase);
  }

  if (objectiveOverlap <= 1 || (recentHandoffs.length > 0 && stageOverlap === 0)) {
    return normalizeCheckpointResult({
      status: 'uncertain',
      message: 'Strategic checkpoint found only weak overlap between the objective, current stage, and recent unattended evidence.',
      signals: {
        taskKindsOutsideStage,
        objectiveOverlap,
        stageOverlap,
        contradictionFlags
      }
    }, phase);
  }

  return normalizeCheckpointResult({
    status: 'aligned',
    message: 'Recent unattended evidence still overlaps the objective question and current stage intent.',
    signals: {
      taskKindsOutsideStage,
      objectiveOverlap,
      stageOverlap,
      contradictionFlags
    }
  }, phase);
}

export const INTERNALS = Object.freeze({
  CONTRADICTION_PATTERNS,
  STAGE_INTENTS,
  deriveStageCursor,
  normalizeCheckpointResult,
  summarizeRecentEvidence,
  tokenize
});
