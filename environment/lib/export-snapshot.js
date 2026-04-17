import { randomUUID } from 'node:crypto';
import { link, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import Ajv from 'ajv';
import addFormats from 'ajv-formats';

export const EXPORT_SNAPSHOT_SCHEMA_VERSION = 'vibe-env.export-snapshot.v1';

const SNAPSHOT_ID_PATTERN = /^WEXP-.+$/u;
const SNAPSHOTS_RELATIVE_DIR = path.join(
  '.vibe-science-environment',
  'writing',
  'exports',
  'snapshots',
);

const ajv = new Ajv({
  allErrors: true,
  strict: false,
});
addFormats(ajv);

const snapshotSchema = JSON.parse(
  await readFile(
    new URL('../schemas/export-snapshot.schema.json', import.meta.url),
    'utf8',
  ),
);
const validateSnapshotSchema = ajv.compile(snapshotSchema);

export class ExportSnapshotError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class ExportSnapshotValidationError extends ExportSnapshotError {}

export class ExportSnapshotAlreadyExistsError extends ExportSnapshotError {
  constructor(message, details = {}) {
    super(message);
    this.code = 'EXPORT_SNAPSHOT_ALREADY_EXISTS';
    this.snapshotId = details.snapshotId ?? null;
    this.existingCreatedAt = details.existingCreatedAt ?? null;
    this.attemptedAt = details.attemptedAt ?? null;
  }
}

export async function buildExportSnapshot(data, options = {}) {
  if (data == null || typeof data !== 'object' || Array.isArray(data)) {
    throw new ExportSnapshotValidationError(
      'Export snapshot data must be an object.',
    );
  }

  const candidate = cloneValue(data);
  candidate.schemaVersion = EXPORT_SNAPSHOT_SCHEMA_VERSION;
  candidate.snapshotId = normalizeSnapshotId(
    candidate.snapshotId ?? options.snapshotId,
  );
  candidate.createdAt = normalizeIsoDateTime(
    candidate.createdAt ?? options.createdAt ?? new Date().toISOString(),
    'createdAt',
  );
  candidate.claimIds = normalizeClaimIds(candidate.claimIds, candidate.claims);
  candidate.claims = normalizeArray(candidate.claims, 'claims');
  candidate.citations = normalizeArray(candidate.citations, 'citations');
  candidate.warnings = normalizeWarnings(candidate.warnings);

  validateExportSnapshot(candidate, {
    context: `Export snapshot ${candidate.snapshotId}`,
  });

  return cloneValue(candidate);
}

export function validateExportSnapshot(snapshot, options = {}) {
  const valid = validateSnapshotSchema(snapshot);
  if (valid) {
    return;
  }

  const details = (validateSnapshotSchema.errors ?? [])
    .map((error) => `${error.instancePath || '/'} ${error.message}`.trim())
    .join('; ');
  throw new ExportSnapshotValidationError(
    `${options.context ?? 'Export snapshot'} failed schema validation: ${details}`,
  );
}

export async function writeExportSnapshot(projectPath, data, options = {}) {
  const projectRoot = resolveProjectPath(projectPath);
  const snapshot = await buildExportSnapshot(data, options);
  const targetPath = resolveExportSnapshotPath(projectRoot, snapshot.snapshotId);

  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeSnapshotOnce(targetPath, snapshot);

  return cloneValue(snapshot);
}

export function resolveExportSnapshotPath(projectPath, snapshotId) {
  const projectRoot = resolveProjectPath(projectPath);
  const normalizedSnapshotId = normalizeSnapshotId(snapshotId);
  return path.join(projectRoot, SNAPSHOTS_RELATIVE_DIR, `${normalizedSnapshotId}.json`);
}

function normalizeSnapshotId(snapshotId) {
  if (typeof snapshotId !== 'string' || !SNAPSHOT_ID_PATTERN.test(snapshotId)) {
    throw new ExportSnapshotValidationError(
      'snapshotId must be a string matching WEXP-....',
    );
  }

  return snapshotId;
}

function normalizeClaimIds(claimIds, claims) {
  if (claimIds == null) {
    if (!Array.isArray(claims)) {
      throw new ExportSnapshotValidationError(
        'claimIds must be provided when claims are unavailable.',
      );
    }

    return claims.map((claim) => claim?.claimId);
  }

  if (!Array.isArray(claimIds)) {
    throw new ExportSnapshotValidationError('claimIds must be an array.');
  }

  return cloneValue(claimIds);
}

function normalizeArray(value, label) {
  if (!Array.isArray(value)) {
    throw new ExportSnapshotValidationError(`${label} must be an array.`);
  }

  return cloneValue(value);
}

function normalizeWarnings(warnings) {
  if (warnings == null) {
    return [];
  }

  if (!Array.isArray(warnings)) {
    throw new ExportSnapshotValidationError('warnings must be an array.');
  }

  return cloneValue(warnings);
}

function normalizeIsoDateTime(value, label) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new ExportSnapshotValidationError(
      `${label} must be a valid ISO date-time.`,
    );
  }

  return value;
}

function resolveProjectPath(projectPath) {
  if (typeof projectPath !== 'string' || projectPath.trim() === '') {
    throw new ExportSnapshotValidationError(
      'projectPath must be a non-empty string.',
    );
  }

  return path.resolve(projectPath);
}

async function writeSnapshotOnce(targetPath, snapshot) {
  const serialized = `${JSON.stringify(snapshot, null, 2)}\n`;
  const tempPath = `${targetPath}.tmp-${process.pid}-${randomUUID()}`;

  try {
    await writeFile(tempPath, serialized, {
      encoding: 'utf8',
      flag: 'wx',
    });
    await link(tempPath, targetPath);
  } catch (error) {
    if (error?.code === 'EEXIST') {
      let existingCreatedAt = null;
      try {
        const existing = JSON.parse(await readFile(targetPath, 'utf8'));
        existingCreatedAt = existing?.createdAt ?? null;
      } catch {
        existingCreatedAt = null;
      }

      throw new ExportSnapshotAlreadyExistsError(
        `Export snapshot ${snapshot.snapshotId} already exists (createdAt=${existingCreatedAt ?? 'unknown'}); refusing to overwrite.`,
        {
          snapshotId: snapshot.snapshotId,
          existingCreatedAt,
          attemptedAt: snapshot.createdAt,
        },
      );
    }

    throw error;
  } finally {
    try {
      await unlink(tempPath);
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  const persisted = JSON.parse(await readFile(targetPath, 'utf8'));
  validateExportSnapshot(persisted, {
    context: `Export snapshot ${snapshot.snapshotId}`,
  });
}

function cloneValue(value) {
  return globalThis.structuredClone
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}
