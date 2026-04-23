import { randomUUID } from 'node:crypto';
import { appendFile } from 'node:fs/promises';

import {
  assertValid,
  loadValidator,
  now,
  readJsonl,
} from '../control/_io.js';
import { ORCHESTRATOR_FILES } from './_paths.js';
import {
  appendOrchestratorJsonl,
  readOrchestratorJsonl,
  withOrchestratorLock,
} from './_io.js';
import { resolveOrchestratorPath } from './_paths.js';

const LANE_RUN_SCHEMA = 'lane-run-record.schema.json';
const PHASE9_LANE_RUN_SCHEMA = 'phase9-lane-run-record.schema.json';
const RECOVERY_SCHEMA = 'recovery-record.schema.json';
const ESCALATION_SCHEMA = 'escalation-record.schema.json';
const EXTERNAL_REVIEW_SCHEMA = 'external-review-record.schema.json';
const ORCHESTRATOR_LANE_RUN_SCHEMA_VERSION = 'vibe-orch.lane-run-record.v1';
const PHASE9_LANE_RUN_SCHEMA_VERSION = 'phase9.lane-run-record.v1';

function generateId(prefix) {
  const stamp = now()
    .replace(/[:.]/gu, '-')
    .replace('T', '-')
    .replace('Z', '');
  return `${prefix}-${stamp}-${randomUUID().slice(0, 8)}`;
}

function sortDescending(records, field) {
  return [...records].sort((left, right) => {
    const leftValue = left[field] ?? null;
    const rightValue = right[field] ?? null;
    if (typeof leftValue === 'number' && typeof rightValue === 'number') {
      return rightValue - leftValue;
    }
    return String(rightValue ?? '').localeCompare(String(leftValue ?? ''));
  });
}

function filterLaneRunsByVersion(records, schemaVersion) {
  return records.filter((record) => record?.schemaVersion === schemaVersion);
}

async function validateRecords(projectPath, records, schemaFile, label) {
  const validate = await loadValidator(projectPath, schemaFile);
  for (const [index, record] of records.entries()) {
    assertValid(validate, record, `${label} record ${index + 1}`);
  }
}

export async function appendLaneRun(projectPath, data = {}) {
  const record = {
    schemaVersion: ORCHESTRATOR_LANE_RUN_SCHEMA_VERSION,
    laneRunId: data.laneRunId ?? generateId('ORCH-RUN'),
    laneId: data.laneId,
    taskId: data.taskId ?? null,
    providerRef: data.providerRef ?? null,
    integrationKind: data.integrationKind,
    fallbackApplied: data.fallbackApplied ?? false,
    supervisionCapability: data.supervisionCapability,
    status: data.status,
    attemptNumber: data.attemptNumber ?? 1,
    threadId: data.threadId ?? null,
    startedAt: data.startedAt ?? now(),
    endedAt: data.endedAt ?? null,
    artifactRefs: data.artifactRefs ?? [],
    summary: data.summary ?? null,
    errorCode: data.errorCode ?? null,
    warningCount: data.warningCount ?? 0,
  };

  // WP-162 strict widening: persist `evidenceMode` only when the caller
  // supplied one. Existing records without the field remain valid.
  if (data.evidenceMode !== undefined) {
    record.evidenceMode = data.evidenceMode;
  }

  await appendOrchestratorJsonl(projectPath, ORCHESTRATOR_FILES.laneRuns, record, {
    schemaFile: LANE_RUN_SCHEMA,
    label: 'lane run record',
  });
  return record;
}

export async function listLaneRuns(projectPath, filters = {}) {
  let records = filterLaneRunsByVersion(
    await readJsonl(resolveOrchestratorPath(projectPath, ORCHESTRATOR_FILES.laneRuns)),
    ORCHESTRATOR_LANE_RUN_SCHEMA_VERSION,
  );
  await validateRecords(projectPath, records, LANE_RUN_SCHEMA, 'lane run');

  if (filters.laneId) {
    records = records.filter((record) => record.laneId === filters.laneId);
  }
  if (filters.taskId) {
    records = records.filter((record) => record.taskId === filters.taskId);
  }
  if (filters.status) {
    records = records.filter((record) => record.status === filters.status);
  }

  return sortDescending(records, 'startedAt');
}

export async function appendPhase9LaneRun(projectPath, data = {}) {
  const laneRunsPath = resolveOrchestratorPath(projectPath, ORCHESTRATOR_FILES.laneRuns);
  return withOrchestratorLock(projectPath, ORCHESTRATOR_FILES.laneRuns, async () => {
    const existingRecords = await readJsonl(laneRunsPath);
    const existingPhase9Records = filterLaneRunsByVersion(
      existingRecords,
      PHASE9_LANE_RUN_SCHEMA_VERSION,
    );
    const record = {
      schemaVersion: PHASE9_LANE_RUN_SCHEMA_VERSION,
      objectiveId: data.objectiveId,
      recordSeq: (existingPhase9Records.at(-1)?.recordSeq ?? 0) + 1,
      experimentId: data.experimentId,
      analysisId: data.analysisId,
      taskId: data.taskId,
      manifestPath: data.manifestPath,
      scriptSha256: data.scriptSha256,
      inputPaths: data.inputPaths ?? [],
      outputPaths: data.outputPaths ?? [],
      runner: data.runner,
      argv: data.argv ?? [],
      startedAt: data.startedAt ?? now(),
      endedAt: data.endedAt ?? null,
      exitCode: data.exitCode ?? null,
      stdoutPath: data.stdoutPath ?? null,
      stderrPath: data.stderrPath ?? null,
      provenanceHash: data.provenanceHash,
      status: data.status,
    };

    const validate = await loadValidator(projectPath, PHASE9_LANE_RUN_SCHEMA);
    assertValid(validate, record, 'phase9 lane run record');
    await appendFile(laneRunsPath, `${JSON.stringify(record)}\n`, 'utf8');
    return record;
  });
}

export async function listPhase9LaneRuns(projectPath, filters = {}) {
  let records = filterLaneRunsByVersion(
    await readJsonl(resolveOrchestratorPath(projectPath, ORCHESTRATOR_FILES.laneRuns)),
    PHASE9_LANE_RUN_SCHEMA_VERSION,
  );
  await validateRecords(projectPath, records, PHASE9_LANE_RUN_SCHEMA, 'phase9 lane run');

  if (filters.objectiveId) {
    records = records.filter((record) => record.objectiveId === filters.objectiveId);
  }
  if (filters.experimentId) {
    records = records.filter((record) => record.experimentId === filters.experimentId);
  }
  if (filters.analysisId) {
    records = records.filter((record) => record.analysisId === filters.analysisId);
  }
  if (filters.taskId) {
    records = records.filter((record) => record.taskId === filters.taskId);
  }
  if (filters.status) {
    records = records.filter((record) => record.status === filters.status);
  }

  return sortDescending(records, 'recordSeq');
}

export async function getLatestLaneRun(projectPath, filters = {}) {
  const [latest] = await listLaneRuns(projectPath, filters);
  return latest ?? null;
}

export async function appendRecoveryRecord(projectPath, data = {}) {
  const record = {
    schemaVersion: 'vibe-orch.recovery-record.v1',
    recoveryId: data.recoveryId ?? generateId('ORCH-REC'),
    taskId: data.taskId ?? null,
    laneRunId: data.laneRunId ?? null,
    failureClass: data.failureClass,
    recoveryAction: data.recoveryAction,
    attemptNumber: data.attemptNumber ?? null,
    nextLaneId: data.nextLaneId ?? null,
    result: data.result,
    cooldownUntil: data.cooldownUntil ?? null,
    escalationId: data.escalationId ?? null,
    summary: data.summary ?? null,
    recordedAt: data.recordedAt ?? now(),
  };

  await appendOrchestratorJsonl(projectPath, ORCHESTRATOR_FILES.recoveryLog, record, {
    schemaFile: RECOVERY_SCHEMA,
    label: 'recovery record',
  });
  return record;
}

export async function listRecoveryRecords(projectPath, filters = {}) {
  let records = await readOrchestratorJsonl(projectPath, ORCHESTRATOR_FILES.recoveryLog, {
    schemaFile: RECOVERY_SCHEMA,
    label: 'recovery record',
  });

  if (filters.taskId) {
    records = records.filter((record) => record.taskId === filters.taskId);
  }
  if (filters.result) {
    records = records.filter((record) => record.result === filters.result);
  }

  return sortDescending(records, 'recordedAt');
}

export async function appendEscalationRecord(projectPath, data = {}) {
  const record = {
    schemaVersion: 'vibe-orch.escalation-record.v1',
    escalationId: data.escalationId ?? generateId('ORCH-ESC'),
    taskId: data.taskId ?? null,
    laneRunId: data.laneRunId ?? null,
    status: data.status,
    triggerKind: data.triggerKind,
    decisionNeeded: data.decisionNeeded,
    contextShown: data.contextShown ?? [],
    resolutionSummary: data.resolutionSummary ?? null,
    recordedAt: data.recordedAt ?? now(),
    resolvedAt: data.resolvedAt ?? null,
  };

  await appendOrchestratorJsonl(projectPath, ORCHESTRATOR_FILES.escalations, record, {
    schemaFile: ESCALATION_SCHEMA,
    label: 'escalation record',
  });
  return record;
}

export async function listEscalationRecords(projectPath, filters = {}) {
  let records = await readOrchestratorJsonl(projectPath, ORCHESTRATOR_FILES.escalations, {
    schemaFile: ESCALATION_SCHEMA,
    label: 'escalation record',
  });

  if (filters.taskId) {
    records = records.filter((record) => record.taskId === filters.taskId);
  }
  if (filters.status) {
    records = records.filter((record) => record.status === filters.status);
  }

  return sortDescending(records, 'recordedAt');
}

export async function appendExternalReviewRecord(projectPath, data = {}) {
  const record = {
    schemaVersion: 'vibe-orch.external-review-record.v1',
    externalReviewId: data.externalReviewId ?? generateId('ORCH-REVIEW'),
    taskId: data.taskId ?? null,
    executionLaneRunId: data.executionLaneRunId,
    reviewLaneRunId: data.reviewLaneRunId,
    verdict: data.verdict,
    materialMismatch: data.materialMismatch,
    summary: data.summary ?? null,
    comparedArtifactRefs: data.comparedArtifactRefs ?? [],
    followUpAction: data.followUpAction,
    escalationId: data.escalationId ?? null,
    recordedAt: data.recordedAt ?? now(),
  };

  await appendOrchestratorJsonl(projectPath, ORCHESTRATOR_FILES.externalReviewLog, record, {
    schemaFile: EXTERNAL_REVIEW_SCHEMA,
    label: 'external review record',
  });
  return record;
}

export async function listExternalReviewRecords(projectPath, filters = {}) {
  let records = await readOrchestratorJsonl(projectPath, ORCHESTRATOR_FILES.externalReviewLog, {
    schemaFile: EXTERNAL_REVIEW_SCHEMA,
    label: 'external review record',
  });

  if (filters.taskId) {
    records = records.filter((record) => record.taskId === filters.taskId);
  }
  if (filters.verdict) {
    records = records.filter((record) => record.verdict === filters.verdict);
  }

  return sortDescending(records, 'recordedAt');
}

export async function getLatestExternalReviewRecord(projectPath, filters = {}) {
  const [latest] = await listExternalReviewRecords(projectPath, filters);
  return latest ?? null;
}

export async function getLatestEscalation(projectPath) {
  const [latest] = await listEscalationRecords(projectPath);
  return latest ?? null;
}

export async function getLatestRecoveryRecord(projectPath) {
  const [latest] = await listRecoveryRecords(projectPath);
  return latest ?? null;
}

export async function listActiveLaneRuns(projectPath) {
  const records = await listLaneRuns(projectPath);
  return records.filter((record) => record.status === 'running');
}
