import { createHash } from 'node:crypto';

import {
  buildMissingSkillDegradeReport,
  evaluateSkillAvailability
} from './skill-probe.js';

export const L1_SKILL_RUNTIME_SCHEMA_VERSION =
  'phase14.l1-skill-runtime-record.v1';

export class Phase14L1SkillRuntimeError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'Phase14L1SkillRuntimeError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new Phase14L1SkillRuntimeError(code, message);
}

function assertObject(value, code, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(code, `${label} must be an object`);
  }
}

function nonBlankString(value, code, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    fail(code, `${label} must be a non-empty string`);
  }
  return value.trim();
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stableStringify(value[key])}`
    ).join(',')}}`;
  }
  return JSON.stringify(value);
}

function hashInput(value) {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function stageTable(table, stageId) {
  assertObject(table, 'E_PHASE14_L1_RUNTIME_TABLE_REQUIRED', 'table');
  if (!Array.isArray(table.stages)) {
    fail('E_PHASE14_L1_RUNTIME_TABLE_REQUIRED', 'table.stages must be an array');
  }
  const stage = table.stages.find((candidate) => candidate.stageId === stageId);
  if (!stage) {
    fail('E_PHASE14_L1_RUNTIME_STAGE_UNKNOWN', `unknown L1 stage ${stageId}`);
  }
  return {
    ...table,
    stages: [stage]
  };
}

function assertRuntimeAllowed(options) {
  if (options.autonomyTier !== 'L1') {
    fail('E_PHASE14_L1_RUNTIME_TIER_REQUIRED', 'TL1.4 requires autonomyTier L1');
  }
  if (options.runtimeMode === 'unattended-batch') {
    fail(
      'E_PHASE14_L1_RUNTIME_UNATTENDED_FORBIDDEN',
      'TL1.4 cannot run unattended'
    );
  }
  if (options.runtimeMode !== 'attended-batch') {
    fail(
      'E_PHASE14_L1_RUNTIME_MODE_REQUIRED',
      'TL1.4 requires attended-batch runtime mode'
    );
  }
}

function assertCallbacks(options) {
  if (typeof options.executor !== 'function') {
    fail('E_PHASE14_L1_RUNTIME_EXECUTOR_REQUIRED', 'executor must be injected');
  }
  if (typeof options.writeRecord !== 'function') {
    fail('E_PHASE14_L1_RUNTIME_WRITER_REQUIRED', 'writeRecord must be injected');
  }
}

function availableRows(report) {
  return report.targetResults.filter((row) => row.status === 'available');
}

function hasRequiredGap(degradeReport) {
  return Array.isArray(degradeReport.requiredGaps)
    && degradeReport.requiredGaps.length > 0;
}

function baseRecord({ stageId, invocationInput, availabilityReport, degradeReport }) {
  return {
    schemaVersion: L1_SKILL_RUNTIME_SCHEMA_VERSION,
    phase: 14,
    layer: 'L1',
    task: 'TL1.4',
    stageId,
    runtimeOpened: false,
    unattendedRuntimeOpened: false,
    providerAutomationInvoked: false,
    reviewedApiUsed: false,
    claimExportOpened: false,
    graphifyOpened: false,
    skillInstallAttempted: false,
    hostSkillDiscoveryAttempted: false,
    source: {
      tableSchemaVersion: availabilityReport.generatedFrom === 'registry-injected'
        ? 'phase13.l1-stage-skill-table.v1'
        : 'unknown',
      availabilitySchemaVersion: availabilityReport.schemaVersion,
      degradeSchemaVersion: degradeReport.schemaVersion
    },
    inputsHash: hashInput(invocationInput ?? {}),
    inputSummary: invocationInput && typeof invocationInput === 'object'
      ? Object.fromEntries(Object.keys(invocationInput).sort().map((key) => [
        key,
        typeof invocationInput[key]
      ]))
      : {},
    targetResults: availabilityReport.targetResults,
    vibeNamingStates: availabilityReport.vibeNamingStates,
    degradeReport
  };
}

function invocationRequest(row, stageId, invocationInput) {
  return {
    stageId,
    targetId: row.targetId,
    targetKind: row.targetKind,
    required: row.required === true,
    invocationInput,
    runtimeOpened: false
  };
}

export async function runL1SkillRuntime(options = {}) {
  assertObject(options, 'E_PHASE14_L1_RUNTIME_OPTIONS_REQUIRED', 'options');
  assertRuntimeAllowed(options);
  assertCallbacks(options);

  const stageId = nonBlankString(
    options.stageId,
    'E_PHASE14_L1_RUNTIME_STAGE_REQUIRED',
    'stageId'
  );
  const scopedTable = stageTable(options.table, stageId);
  const availabilityReport = evaluateSkillAvailability(scopedTable, options.registry);
  const degradeReport = buildMissingSkillDegradeReport(availabilityReport);
  const common = {
    stageId,
    invocationInput: options.invocationInput ?? {},
    availabilityReport,
    degradeReport
  };

  if (hasRequiredGap(degradeReport)) {
    const record = {
      ...baseRecord(common),
      kind: 'skill-unavailable',
      skillInvocationAttempted: false,
      invocations: []
    };
    const recordPath = await options.writeRecord(record);
    return { record: { ...record, recordPath }, recordPath };
  }

  const invocations = [];
  for (const row of availableRows(availabilityReport)) {
    const request = invocationRequest(row, stageId, options.invocationInput ?? {});
    const executorResult = await options.executor(request);
    invocations.push({
      stageId,
      targetId: row.targetId,
      targetKind: row.targetKind,
      required: row.required === true,
      runtimeOpened: false,
      executorResult
    });
  }

  const record = {
    ...baseRecord(common),
    kind: 'skill-invocation',
    skillInvocationAttempted: invocations.length > 0,
    invocations
  };
  const recordPath = await options.writeRecord(record);
  return { record: { ...record, recordPath }, recordPath };
}

export function reconstructL1SkillRuntimeRecord(record) {
  assertObject(record, 'E_PHASE14_L1_RUNTIME_RECORD_REQUIRED', 'record');
  if (record.schemaVersion !== L1_SKILL_RUNTIME_SCHEMA_VERSION) {
    fail(
      'E_PHASE14_L1_RUNTIME_RECORD_REQUIRED',
      'unknown L1 skill runtime record schema'
    );
  }
  nonBlankString(record.stageId, 'E_PHASE14_L1_RUNTIME_RECORD_REQUIRED', 'stageId');
  if (record.runtimeOpened !== false || record.unattendedRuntimeOpened !== false) {
    fail('E_PHASE14_L1_RUNTIME_RECORD_REQUIRED', 'record must preserve closed runtime');
  }
  if (!Array.isArray(record.invocations)) {
    fail('E_PHASE14_L1_RUNTIME_RECORD_REQUIRED', 'record.invocations must be an array');
  }
  assertObject(record.degradeReport, 'E_PHASE14_L1_RUNTIME_RECORD_REQUIRED', 'degradeReport');
  return record;
}
