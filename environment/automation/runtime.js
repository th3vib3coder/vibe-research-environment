import { buildAutomationPlan } from './builtin-plans.js';
import { writeAutomationArtifact } from './artifacts.js';
import { getAutomationById } from './definitions.js';
import {
  appendAutomationRunRecord,
  buildAutomationRunId,
  findLatestRunForIdempotency,
  listAutomationRunRecords,
} from './run-log.js';

const AUTOMATION_RUN_SCHEMA_VERSION = 'vibe-env.automation-run-record.v1';

export class AutomationRuntimeError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = new.target.name;
  }
}

export async function runAutomation(projectPath, automationId, options = {}) {
  const definition = await getAutomationById(projectPath, automationId);
  const triggerType = normalizeTriggerType(options.triggerType ?? 'command');
  const timestamp = normalizeTimestamp(options.now);
  const schedulerContext = normalizeSchedulerContext(options.schedulerContext, triggerType);

  try {
    const plan = await buildAutomationPlan(projectPath, definition, {
      timestamp,
      triggerType,
      schedulerContext,
    });
    const priorRuns = await listAutomationRunRecords(projectPath, definition.automationId);
    const previousForKey = findLatestRunForIdempotency(priorRuns.items, plan.idempotencyKey);

    let status = plan.status;
    let artifactPath = null;
    let blockedReason = plan.blockedReason ?? null;
    let degradedReason = plan.degradedReason ?? null;
    const warnings = cloneValue(plan.warnings ?? []);

    if (previousForKey != null) {
      status = 'blocked';
      blockedReason = `Automation ${definition.automationId} already recorded source state ${plan.idempotencyKey}.`;
      degradedReason = null;
      artifactPath = previousForKey.artifactPath ?? null;
    } else {
      const artifact = await writeAutomationArtifact(
        projectPath,
        definition.automationId,
        plan.artifactFileName,
        plan.artifactContent,
      );
      artifactPath = artifact.relativePath;
    }

    const record = buildAutomationRunRecord({
      automationId: definition.automationId,
      triggerType,
      timestamp,
      status,
      artifactPath,
      sourceSurfaces: plan.sourceSurfaces,
      idempotencyKey: plan.idempotencyKey,
      blockedReason,
      degradedReason,
      schedulerContext,
      warnings,
    });

    await appendAutomationRunRecord(projectPath, definition.automationId, record);

    return {
      automationId: definition.automationId,
      displayName: definition.displayName,
      runId: record.runId,
      status,
      artifactPath,
      idempotencyKey: record.idempotencyKey,
      blockedReason: record.blockedReason,
      degradedReason: record.degradedReason,
      sourceSurfaces: cloneValue(record.sourceSurfaces),
      warnings,
      summary: cloneValue(plan.summary),
    };
  } catch (error) {
    const failedRecord = buildAutomationRunRecord({
      automationId: definition.automationId,
      triggerType,
      timestamp,
      status: 'failed',
      artifactPath: null,
      sourceSurfaces: cloneValue(definition.sourceSurfaces ?? []),
      idempotencyKey: null,
      blockedReason: null,
      degradedReason: null,
      schedulerContext,
      warnings: [`Run failed: ${error.message}`],
    });
    await appendAutomationRunRecord(projectPath, definition.automationId, failedRecord);
    throw new AutomationRuntimeError(error.message);
  }
}

export function runWeeklyResearchDigest(projectPath, options = {}) {
  return runAutomation(projectPath, 'weekly-research-digest', {
    triggerType: options.triggerType ?? 'command',
    now: options.now,
    schedulerContext: options.schedulerContext,
  });
}

export function runStaleMemoryReminder(projectPath, options = {}) {
  return runAutomation(projectPath, 'stale-memory-reminder', {
    triggerType: options.triggerType ?? 'command',
    now: options.now,
    schedulerContext: options.schedulerContext,
  });
}

export function runExportWarningDigest(projectPath, options = {}) {
  return runAutomation(projectPath, 'export-warning-digest', {
    triggerType: options.triggerType ?? 'command',
    now: options.now,
    schedulerContext: options.schedulerContext,
  });
}

function buildAutomationRunRecord({
  automationId,
  triggerType,
  timestamp,
  status,
  artifactPath,
  sourceSurfaces,
  idempotencyKey,
  blockedReason,
  degradedReason,
  schedulerContext,
  warnings,
}) {
  return {
    schemaVersion: AUTOMATION_RUN_SCHEMA_VERSION,
    runId: buildAutomationRunId(timestamp),
    automationId,
    triggerType,
    status,
    startedAt: timestamp,
    endedAt: timestamp,
    artifactPath,
    sourceSurfaces: cloneValue(sourceSurfaces ?? []),
    idempotencyKey,
    blockedReason,
    degradedReason,
    schedulerContext,
    warnings: cloneValue(warnings ?? []),
  };
}

function normalizeTriggerType(value) {
  if (value !== 'command' && value !== 'scheduled') {
    throw new TypeError('triggerType must be "command" or "scheduled".');
  }
  return value;
}

function normalizeTimestamp(value) {
  const candidate = value ?? new Date().toISOString();
  if (typeof candidate !== 'string' || Number.isNaN(Date.parse(candidate))) {
    throw new TypeError('now must be a valid ISO date-time string when provided.');
  }
  return candidate;
}

function normalizeSchedulerContext(value, triggerType) {
  if (triggerType !== 'scheduled') {
    return null;
  }
  if (value == null) {
    return {
      scheduledByHost: true,
      scheduledFor: null,
    };
  }
  return {
    scheduledByHost: value.scheduledByHost !== false,
    scheduledFor:
      typeof value.scheduledFor === 'string' && !Number.isNaN(Date.parse(value.scheduledFor))
        ? value.scheduledFor
        : null,
  };
}

function cloneValue(value) {
  return globalThis.structuredClone
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}
