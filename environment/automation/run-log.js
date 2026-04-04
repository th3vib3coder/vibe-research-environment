import { randomUUID } from 'node:crypto';
import { appendFile, mkdir } from 'node:fs/promises';

import {
  assertValid,
  loadValidator,
  readJsonl,
  withLock,
} from '../control/_io.js';
import {
  automationRunLogPath,
  automationRunsDir,
} from './definitions.js';

const AUTOMATION_RUN_RECORD_SCHEMA = 'automation-run-record.schema.json';

export async function validateAutomationRunRecord(projectPath, record, options = {}) {
  const validate = await loadValidator(projectPath, AUTOMATION_RUN_RECORD_SCHEMA);
  assertValid(validate, record, options.context ?? 'automation run record');
  return record;
}

export async function appendAutomationRunRecord(projectPath, automationId, record) {
  await mkdir(automationRunsDir(projectPath), { recursive: true });
  await validateAutomationRunRecord(projectPath, record, {
    context: `automation run record ${record.runId ?? automationId}`,
  });
  const targetPath = automationRunLogPath(projectPath, automationId);
  await withLock(
    projectPath,
    `automation-run-log-${automationId}`,
    async () => {
      await appendFile(targetPath, `${JSON.stringify(record)}\n`, 'utf8');
    },
  );
  return targetPath;
}

export async function listAutomationRunRecords(projectPath, automationId) {
  const records = await readJsonl(automationRunLogPath(projectPath, automationId));
  const warnings = [];
  const validRecords = [];

  for (const record of records) {
    try {
      await validateAutomationRunRecord(projectPath, record, {
        context: `automation run record ${record?.runId ?? automationId}`,
      });
      validRecords.push(record);
    } catch (error) {
      warnings.push(`Ignoring invalid automation run record for ${automationId}: ${error.message}`);
    }
  }

  validRecords.sort(compareRunRecordsDesc);
  return {
    total: validRecords.length,
    items: validRecords,
    warnings,
  };
}

export function buildAutomationRunId(timestamp) {
  return `AUTO-RUN-${timestamp.replaceAll(':', '').replaceAll('.', '').replaceAll('T', '-').replaceAll('Z', '')}-${randomUUID().slice(0, 8)}`;
}

export function findLatestRunForIdempotency(records = [], idempotencyKey) {
  if (typeof idempotencyKey !== 'string' || idempotencyKey.trim() === '') {
    return null;
  }

  return records.find(
    (record) =>
      record.idempotencyKey === idempotencyKey &&
      record.status !== 'failed',
  ) ?? null;
}

function compareRunRecordsDesc(left, right) {
  const leftTimestamp = String(left.endedAt ?? left.startedAt ?? '');
  const rightTimestamp = String(right.endedAt ?? right.startedAt ?? '');
  const byTimestamp = rightTimestamp.localeCompare(leftTimestamp);
  if (byTimestamp !== 0) {
    return byTimestamp;
  }

  return String(left.runId ?? '').localeCompare(String(right.runId ?? ''));
}
