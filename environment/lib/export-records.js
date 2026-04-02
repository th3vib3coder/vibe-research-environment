import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import Ajv from 'ajv';
import addFormats from 'ajv-formats';

export const EXPORT_RECORD_SCHEMA_VERSION = 'vibe-env.export-record.v1';
export const EXPORT_ALERT_SCHEMA_VERSION = 'vibe-env.export-alert-record.v1';

const EXPORTS_RELATIVE_DIR = path.join(
  '.vibe-science-environment',
  'writing',
  'exports',
);
const RECORDS_PATH = path.join(EXPORTS_RELATIVE_DIR, 'export-log.jsonl');
const ALERTS_PATH = path.join(EXPORTS_RELATIVE_DIR, 'export-alerts.jsonl');

const ajv = new Ajv({
  allErrors: true,
  strict: false,
});
addFormats(ajv);

const [exportRecordSchema, exportAlertSchema] = await Promise.all([
  loadJsonResource(new URL('../schemas/export-record.schema.json', import.meta.url)),
  loadJsonResource(
    new URL('../schemas/export-alert-record.schema.json', import.meta.url),
  ),
]);

const validateExportRecordSchema = ajv.compile(exportRecordSchema);
const validateExportAlertSchema = ajv.compile(exportAlertSchema);

export class ExportRecordsError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class ExportRecordsValidationError extends ExportRecordsError {}

export async function buildExportRecord(data, options = {}) {
  if (data == null || typeof data !== 'object' || Array.isArray(data)) {
    throw new ExportRecordsValidationError('Export record data must be an object.');
  }

  const candidate = cloneValue(data);
  candidate.schemaVersion = EXPORT_RECORD_SCHEMA_VERSION;
  candidate.exportedAt = normalizeIsoDateTime(
    candidate.exportedAt ?? options.exportedAt ?? new Date().toISOString(),
    'exportedAt',
  );

  validateExportRecord(candidate, {
    context: `Export record ${candidate.claimId ?? '(unknown claim)'}`,
  });

  return cloneValue(candidate);
}

export async function buildExportAlertRecord(data, options = {}) {
  if (data == null || typeof data !== 'object' || Array.isArray(data)) {
    throw new ExportRecordsValidationError(
      'Export alert record data must be an object.',
    );
  }

  const candidate = cloneValue(data);
  candidate.schemaVersion = EXPORT_ALERT_SCHEMA_VERSION;
  candidate.detectedAt = normalizeIsoDateTime(
    candidate.detectedAt ?? options.detectedAt ?? new Date().toISOString(),
    'detectedAt',
  );

  validateExportAlertRecord(candidate, {
    context: `Export alert ${candidate.alertId ?? '(unknown alert)'}`,
  });

  return cloneValue(candidate);
}

export function buildExportAlertReplayKey(alertRecord) {
  if (alertRecord == null || typeof alertRecord !== 'object') {
    throw new ExportRecordsValidationError(
      'alertRecord must be an object to build a replay key.',
    );
  }

  return [
    alertRecord.snapshotId ?? '',
    alertRecord.claimId ?? '',
    alertRecord.kind ?? '',
    alertRecord.citationId ?? '',
  ].join('::');
}

export async function appendExportRecord(projectPath, data, options = {}) {
  const record = await buildExportRecord(data, options);
  const targetPath = path.join(resolveProjectPath(projectPath), RECORDS_PATH);
  await appendJsonLine(targetPath, record);
  return cloneValue(record);
}

export async function appendExportAlert(projectPath, data, options = {}) {
  const record = await buildExportAlertRecord(data, options);
  const targetPath = path.join(resolveProjectPath(projectPath), ALERTS_PATH);
  await appendJsonLine(targetPath, record);
  return cloneValue(record);
}

export function validateExportRecord(record, options = {}) {
  const valid = validateExportRecordSchema(record);
  if (valid) {
    return;
  }

  const details = (validateExportRecordSchema.errors ?? [])
    .map((error) => `${error.instancePath || '/'} ${error.message}`.trim())
    .join('; ');
  throw new ExportRecordsValidationError(
    `${options.context ?? 'Export record'} failed schema validation: ${details}`,
  );
}

export function validateExportAlertRecord(record, options = {}) {
  const valid = validateExportAlertSchema(record);
  if (valid) {
    return;
  }

  const details = (validateExportAlertSchema.errors ?? [])
    .map((error) => `${error.instancePath || '/'} ${error.message}`.trim())
    .join('; ');
  throw new ExportRecordsValidationError(
    `${options.context ?? 'Export alert record'} failed schema validation: ${details}`,
  );
}

async function appendJsonLine(targetPath, value) {
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, `${JSON.stringify(value)}\n`, {
    encoding: 'utf8',
    flag: 'a',
  });
}

async function loadJsonResource(resourceUrl) {
  const contents = await readFile(resourceUrl, 'utf8');
  return JSON.parse(contents);
}

function normalizeIsoDateTime(value, label) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new ExportRecordsValidationError(
      `${label} must be a valid ISO date-time.`,
    );
  }

  return value;
}

function resolveProjectPath(projectPath) {
  if (typeof projectPath !== 'string' || projectPath.trim() === '') {
    throw new ExportRecordsValidationError(
      'projectPath must be a non-empty string.',
    );
  }

  return path.resolve(projectPath);
}

function cloneValue(value) {
  return globalThis.structuredClone
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}
