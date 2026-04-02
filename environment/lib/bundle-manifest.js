import { randomUUID } from 'node:crypto';
import {
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

import Ajv from 'ajv';
import addFormats from 'ajv-formats';

export const BUNDLE_SCHEMA_VERSION = 'vibe-env.experiment-bundle.v1';

const EXPERIMENT_ID_PATTERN = /^EXP-[0-9]{3}$/u;
const ATTEMPT_ID_PATTERN = /^ATT-.+$/u;
const ARTIFACT_TYPE_SET = new Set([
  'report',
  'figure',
  'table',
  'dataset',
  'notebook',
  'other',
]);

const ajv = new Ajv({
  allErrors: true,
  strict: false,
});
addFormats(ajv);

const [bundleSchema, bundleTemplate] = await Promise.all([
  loadJsonResource(
    new URL('../schemas/experiment-bundle-manifest.schema.json', import.meta.url),
  ),
  loadJsonResource(
    new URL('../templates/experiment-bundle-manifest.v1.json', import.meta.url),
  ),
]);

const validateBundleSchema = ajv.compile(bundleSchema);

export class BundleManifestError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class BundleManifestValidationError extends BundleManifestError {}

export async function buildBundleManifest(data, options = {}) {
  if (data == null || typeof data !== 'object' || Array.isArray(data)) {
    throw new BundleManifestValidationError('Bundle manifest data must be an object.');
  }

  if (Object.hasOwn(data, 'artifacts') && Object.hasOwn(data, 'outputArtifacts')) {
    throw new BundleManifestValidationError(
      'Provide either artifacts or outputArtifacts, not both.',
    );
  }

  const candidate = mergeValues(cloneValue(bundleTemplate), data);
  candidate.schemaVersion = BUNDLE_SCHEMA_VERSION;
  candidate.bundledAt = normalizeDateTime(
    candidate.bundledAt ?? options.bundledAt ?? new Date().toISOString(),
    'bundledAt',
  );

  ensureExperimentId(candidate.experimentId);
  ensureSourceAttemptId(candidate.sourceAttemptId);

  const rawArtifacts = Object.hasOwn(data, 'outputArtifacts')
    ? data.outputArtifacts
    : candidate.artifacts;

  candidate.artifacts = normalizeArtifacts(rawArtifacts, {
    artifactMetadata: options.artifactMetadata,
    artifactDefaults: options.artifactDefaults,
    defaultCreatedAt: options.defaultArtifactCreatedAt ?? null,
  });

  delete candidate.outputArtifacts;

  validateBundleManifest(candidate, {
    context: `Bundle manifest ${candidate.experimentId}`,
  });

  return cloneValue(candidate);
}

export function normalizeBundleArtifact(entry, options = {}) {
  const artifactDefaults = options.artifactDefaults ?? {};
  const artifactMetadata = options.artifactMetadata ?? {};
  const defaultCreatedAt = options.defaultCreatedAt ?? null;

  let artifact;
  if (typeof entry === 'string') {
    artifact = { path: entry };
  } else if (isPlainObject(entry)) {
    artifact = cloneValue(entry);
  } else {
    throw new BundleManifestValidationError(
      'Artifact entries must be strings or objects.',
    );
  }

  const rawPath =
    typeof artifact.path === 'string' && artifact.path.trim() !== ''
      ? artifact.path
      : typeof entry === 'string'
        ? entry
        : null;

  if (rawPath == null) {
    throw new BundleManifestValidationError('Artifact entry is missing a path.');
  }

  const normalizedPath = normalizeArtifactPath(rawPath);
  const metadataPatch = resolveArtifactMetadata(artifactMetadata, normalizedPath);

  const merged = mergeValues(
    mergeValues(cloneValue(artifactDefaults), metadataPatch ?? {}),
    artifact,
  );

  merged.path = normalizedPath;

  if (
    merged.createdAt == null &&
    typeof defaultCreatedAt === 'string' &&
    defaultCreatedAt.trim() !== ''
  ) {
    merged.createdAt = defaultCreatedAt;
  }

  if (typeof merged.type !== 'string' || !ARTIFACT_TYPE_SET.has(merged.type)) {
    throw new BundleManifestValidationError(
      `Artifact ${normalizedPath} is missing a valid type.`,
    );
  }

  if (typeof merged.role !== 'string' || merged.role.trim() === '') {
    throw new BundleManifestValidationError(
      `Artifact ${normalizedPath} is missing a non-empty role.`,
    );
  }

  merged.role = merged.role.trim();
  merged.createdAt = normalizeDateTime(
    merged.createdAt,
    `artifact ${normalizedPath} createdAt`,
  );

  if (merged.size !== undefined && merged.size !== null) {
    if (!Number.isInteger(merged.size) || merged.size < 0) {
      throw new BundleManifestValidationError(
        `Artifact ${normalizedPath} size must be a non-negative integer when present.`,
      );
    }
  }

  return cloneValue(merged);
}

export function validateBundleManifest(manifest, options = {}) {
  const isValid = validateBundleSchema(manifest);
  if (isValid) {
    return;
  }

  const context = options.context ?? 'Bundle manifest';
  const details = (validateBundleSchema.errors ?? [])
    .map((error) => {
      const location = error.instancePath || '/';
      return `${location} ${error.message}`.trim();
    })
    .join('; ');

  throw new BundleManifestValidationError(
    `${context} failed schema validation: ${details}`,
  );
}

export async function writeBundleManifest(targetPath, data, options = {}) {
  if (typeof targetPath !== 'string' || targetPath.trim() === '') {
    throw new BundleManifestValidationError(
      'targetPath must be a non-empty string.',
    );
  }

  const manifest = await buildBundleManifest(data, options);
  const resolvedTargetPath = path.resolve(targetPath);

  await mkdir(path.dirname(resolvedTargetPath), { recursive: true });
  await atomicWriteJson(resolvedTargetPath, manifest);

  return cloneValue(manifest);
}

function normalizeArtifacts(entries, options = {}) {
  if (!Array.isArray(entries)) {
    throw new BundleManifestValidationError('artifacts must be an array.');
  }

  return entries.map((entry) => normalizeBundleArtifact(entry, options));
}

function ensureExperimentId(experimentId) {
  if (typeof experimentId !== 'string' || !EXPERIMENT_ID_PATTERN.test(experimentId)) {
    throw new BundleManifestValidationError(
      'experimentId must be a string matching EXP-XXX.',
    );
  }
}

function ensureSourceAttemptId(sourceAttemptId) {
  if (
    typeof sourceAttemptId !== 'string' ||
    sourceAttemptId.trim() === '' ||
    !ATTEMPT_ID_PATTERN.test(sourceAttemptId)
  ) {
    throw new BundleManifestValidationError(
      'sourceAttemptId must be a string matching ATT-....',
    );
  }
}

function normalizeDateTime(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new BundleManifestValidationError(`${label} must be a non-empty ISO date-time.`);
  }

  return value.trim();
}

function normalizeArtifactPath(rawPath) {
  if (typeof rawPath !== 'string' || rawPath.trim() === '') {
    throw new BundleManifestValidationError('Artifact path must be a non-empty string.');
  }

  const normalizedPath = rawPath.replaceAll('\\', '/').trim();
  if (path.posix.isAbsolute(normalizedPath)) {
    throw new BundleManifestValidationError(
      `Artifact path must stay relative: ${normalizedPath}`,
    );
  }

  const segments = normalizedPath.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new BundleManifestValidationError(
      `Artifact path contains unsupported segments: ${normalizedPath}`,
    );
  }

  return normalizedPath;
}

function resolveArtifactMetadata(artifactMetadata, normalizedPath) {
  if (!isPlainObject(artifactMetadata)) {
    throw new BundleManifestValidationError(
      'artifactMetadata must be an object keyed by artifact path when provided.',
    );
  }

  if (!Object.hasOwn(artifactMetadata, normalizedPath)) {
    return null;
  }

  const metadata = artifactMetadata[normalizedPath];
  if (!isPlainObject(metadata)) {
    throw new BundleManifestValidationError(
      `artifactMetadata for ${normalizedPath} must be an object.`,
    );
  }

  return metadata;
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
