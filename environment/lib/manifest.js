import { randomUUID } from 'node:crypto';
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const MANIFESTS_RELATIVE_DIR = path.join(
  '.vibe-science-environment',
  'experiments',
  'manifests',
);
const EXPERIMENT_ID_PATTERN = /^EXP-[0-9]{3}$/u;
const SCHEMA_VERSION = 'vibe.experiment.manifest.v1';
const TERMINAL_IMMUTABLE_STATUS = 'completed';

const STATUS_TRANSITIONS = new Map([
  ['planned', new Set(['planned', 'active'])],
  ['active', new Set(['active', 'completed', 'failed', 'blocked', 'obsolete'])],
  ['blocked', new Set(['blocked', 'active'])],
  ['failed', new Set(['failed'])],
  ['obsolete', new Set(['obsolete'])],
  ['completed', new Set(['completed'])],
]);

const ajv = new Ajv({
  allErrors: true,
  strict: false,
});
addFormats(ajv);

const [manifestSchema, manifestTemplate] = await Promise.all([
  loadJsonResource(new URL('../schemas/experiment-manifest.schema.json', import.meta.url)),
  loadJsonResource(new URL('../templates/experiment-manifest.v1.json', import.meta.url)),
]);

const validateManifestSchema = ajv.compile(manifestSchema);

export class ManifestError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class ManifestValidationError extends ManifestError {}

export class ManifestNotFoundError extends ManifestError {}

export class ManifestAlreadyExistsError extends ManifestError {}

export class ManifestTransitionError extends ManifestError {}

export class ImmutableManifestError extends ManifestError {}

export async function createManifest(projectPath, data) {
  const projectRoot = resolveProjectPath(projectPath);
  const candidate = mergeValues(cloneValue(manifestTemplate), data ?? {});
  const manifest = normalizeManifest(candidate, { mode: 'create' });
  const manifestPath = resolveManifestPath(projectRoot, manifest.experimentId);

  try {
    await readFile(manifestPath, 'utf8');
    throw new ManifestAlreadyExistsError(
      `Manifest already exists for ${manifest.experimentId}.`,
    );
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }

  await writeManifestFile(manifestPath, manifest);
  return cloneValue(manifest);
}

export async function readManifest(projectPath, experimentId) {
  const manifestPath = resolveManifestPath(resolveProjectPath(projectPath), experimentId);

  let rawManifest;
  try {
    rawManifest = await readFile(manifestPath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new ManifestNotFoundError(`Manifest not found for ${experimentId}.`);
    }

    throw error;
  }

  let manifest;
  try {
    manifest = JSON.parse(rawManifest);
  } catch (error) {
    throw new ManifestValidationError(
      `Manifest ${experimentId} contains invalid JSON.`,
      { cause: error },
    );
  }

  validateManifest(manifest, { context: `Manifest ${experimentId}` });
  return cloneValue(manifest);
}

export async function updateManifest(projectPath, experimentId, patch) {
  const projectRoot = resolveProjectPath(projectPath);
  const existing = await readManifest(projectRoot, experimentId);

  if (existing.status === TERMINAL_IMMUTABLE_STATUS) {
    throw new ImmutableManifestError(
      `Manifest ${experimentId} is immutable after completion.`,
    );
  }

  if (patch == null || typeof patch !== 'object' || Array.isArray(patch)) {
    throw new ManifestValidationError('Manifest patch must be an object.');
  }

  if (
    Object.hasOwn(patch, 'experimentId') &&
    patch.experimentId !== undefined &&
    patch.experimentId !== existing.experimentId
  ) {
    throw new ManifestValidationError('experimentId cannot be changed.');
  }

  if (
    Object.hasOwn(patch, 'schemaVersion') &&
    patch.schemaVersion !== undefined &&
    patch.schemaVersion !== existing.schemaVersion
  ) {
    throw new ManifestValidationError('schemaVersion cannot be changed.');
  }

  const candidate = mergeValues(existing, patch);
  const manifest = normalizeManifest(candidate, {
    mode: 'update',
    previousStatus: existing.status,
  });
  const manifestPath = resolveManifestPath(projectRoot, experimentId);

  await writeManifestFile(manifestPath, manifest);
  return cloneValue(manifest);
}

export async function listManifests(projectPath, filters = {}) {
  const projectRoot = resolveProjectPath(projectPath);
  const manifestDir = resolveManifestDir(projectRoot);

  let entries;
  try {
    entries = await readdir(manifestDir, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return [];
    }

    throw error;
  }

  const manifests = [];
  const fileEntries = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of fileEntries) {
    const experimentId = entry.name.replace(/\.json$/u, '');
    const manifest = await readManifest(projectRoot, experimentId);

    if (filters.status && manifest.status !== filters.status) {
      continue;
    }

    if (filters.claimId && !manifest.relatedClaims.includes(filters.claimId)) {
      continue;
    }

    manifests.push(manifest);
  }

  return manifests;
}

async function writeManifestFile(manifestPath, manifest) {
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await atomicWriteJson(manifestPath, manifest);
}

function normalizeManifest(candidate, options = {}) {
  const manifest = cloneValue(candidate);
  const mode = options.mode ?? 'update';
  const previousStatus = options.previousStatus ?? null;

  if (manifest.schemaVersion == null) {
    manifest.schemaVersion = SCHEMA_VERSION;
  }

  if (manifest.createdAt == null) {
    manifest.createdAt = new Date().toISOString();
  }

  if (typeof manifest.experimentId !== 'string' || !EXPERIMENT_ID_PATTERN.test(manifest.experimentId)) {
    throw new ManifestValidationError(
      'experimentId must be a string matching EXP-XXX.',
    );
  }

  const nextStatus = manifest.status;
  if (!STATUS_TRANSITIONS.has(nextStatus)) {
    throw new ManifestTransitionError(`Unsupported manifest status: ${nextStatus}.`);
  }

  if (mode === 'create' && nextStatus !== 'planned') {
    throw new ManifestTransitionError(
      'New manifests must start in planned status.',
    );
  }

  if (mode === 'update' && previousStatus != null) {
    ensureStatusTransition(previousStatus, nextStatus);
  }

  if (nextStatus === TERMINAL_IMMUTABLE_STATUS && manifest.completedAt == null) {
    manifest.completedAt = new Date().toISOString();
  }

  if (nextStatus !== TERMINAL_IMMUTABLE_STATUS && manifest.completedAt != null) {
    throw new ManifestValidationError(
      'completedAt may only be set when status is completed.',
    );
  }

  validateManifest(manifest, {
    context: `Manifest ${manifest.experimentId}`,
  });

  return manifest;
}

function ensureStatusTransition(previousStatus, nextStatus) {
  const allowedStatuses = STATUS_TRANSITIONS.get(previousStatus);
  if (!allowedStatuses || !allowedStatuses.has(nextStatus)) {
    throw new ManifestTransitionError(
      `Invalid status transition: ${previousStatus} -> ${nextStatus}.`,
    );
  }
}

function validateManifest(manifest, options = {}) {
  const isValid = validateManifestSchema(manifest);
  if (isValid) {
    return;
  }

  const context = options.context ?? 'Manifest';
  const details = (validateManifestSchema.errors ?? [])
    .map((error) => {
      const location = error.instancePath || '/';
      return `${location} ${error.message}`.trim();
    })
    .join('; ');

  throw new ManifestValidationError(`${context} failed schema validation: ${details}`);
}

function resolveProjectPath(projectPath) {
  if (typeof projectPath !== 'string' || projectPath.trim() === '') {
    throw new ManifestValidationError('projectPath must be a non-empty string.');
  }

  return path.resolve(projectPath);
}

function resolveManifestDir(projectRoot) {
  return path.join(projectRoot, MANIFESTS_RELATIVE_DIR);
}

function resolveManifestPath(projectRoot, experimentId) {
  if (typeof experimentId !== 'string' || !EXPERIMENT_ID_PATTERN.test(experimentId)) {
    throw new ManifestValidationError(
      'experimentId must be a string matching EXP-XXX.',
    );
  }

  return path.join(resolveManifestDir(projectRoot), `${experimentId}.json`);
}

async function atomicWriteJson(targetPath, value) {
  const temporaryPath = `${targetPath}.${process.pid}.${randomUUID()}.tmp`;
  const serialized = `${JSON.stringify(value, null, 2)}\n`;

  try {
    await writeFile(temporaryPath, serialized, 'utf8');
    await rename(temporaryPath, targetPath);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => {});
    throw error;
  }
}

async function loadJsonResource(resourceUrl) {
  const contents = await readFile(resourceUrl, 'utf8');
  return JSON.parse(contents);
}

function mergeValues(base, patch) {
  if (patch === undefined) {
    return cloneValue(base);
  }

  if (!isPlainObject(base) || !isPlainObject(patch)) {
    return cloneValue(patch);
  }

  const result = cloneValue(base);

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      continue;
    }

    const currentValue = result[key];
    if (isPlainObject(currentValue) && isPlainObject(value)) {
      result[key] = mergeValues(currentValue, value);
      continue;
    }

    result[key] = cloneValue(value);
  }

  return result;
}

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function cloneValue(value) {
  return globalThis.structuredClone
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}
