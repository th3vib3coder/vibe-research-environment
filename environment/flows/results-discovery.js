import { readdir } from 'node:fs/promises';
import path from 'node:path';

import { validateBundleManifest } from '../lib/bundle-manifest.js';
import { getResultsDomainPresets } from '../domain-packs/resolver.js';
import {
  assertValid,
  loadValidator,
  readJson,
  resolveInside,
  resolveProjectRoot,
} from '../control/_io.js';

const EXPERIMENT_ID_PATTERN = /^EXP-[0-9]{3}$/u;
const BUNDLE_ROOT_SEGMENTS = ['.vibe-science-environment', 'results', 'experiments'];
const SUMMARIES_ROOT_SEGMENTS = ['.vibe-science-environment', 'results', 'summaries'];
const MANIFEST_ROOT_SEGMENTS = ['.vibe-science-environment', 'experiments', 'manifests'];
const BUNDLE_MANIFEST_FILE = 'bundle-manifest.json';
const SESSION_DIGEST_JSON = 'session-digest.json';
const SESSION_DIGEST_MARKDOWN = 'session-digest.md';

export async function discoverBundlesByExperiment(projectPath, experimentIds) {
  const normalizedIds = uniqueExperimentIds(experimentIds ?? []);
  const overview = await getResultsOverview(projectPath, {
    experimentIds: normalizedIds,
    bundleLimit: null,
    digestLimit: null,
  });

  const bundlesByExperiment = new Map();
  for (const experimentId of normalizedIds) {
    const bundle = overview.bundles.find((entry) => entry.experimentId === experimentId) ?? null;
    bundlesByExperiment.set(experimentId, bundle);
  }

  return {
    bundlesByExperiment,
    warnings: overview.warnings,
  };
}

export async function getResultsOverview(projectPath, options = {}) {
  const projectRoot = resolveProjectRoot(projectPath);
  const experimentIds = options.experimentIds == null
    ? null
    : uniqueExperimentIds(options.experimentIds);

  const [digestData, domain] = await Promise.all([
    listSessionDigests(projectRoot, {
      experimentIds,
      limit: normalizeLimit(options.digestLimit),
    }),
    getResultsDomainPresets(projectPath),
  ]);
  const bundleData = await listResultBundles(projectRoot, {
    experimentIds,
    limit: normalizeLimit(options.bundleLimit),
    latestDigestByExperiment: digestData.latestDigestByExperiment,
  });

  return {
    domain,
    totalBundles: bundleData.totalBundles,
    bundles: bundleData.bundles,
    totalSessionDigests: digestData.totalDigests,
    sessionDigests: digestData.digests,
    warnings: [...digestData.warnings, ...bundleData.warnings],
  };
}

async function listResultBundles(projectRoot, options = {}) {
  const warnings = [];
  const experimentIds = options.experimentIds == null
    ? null
    : new Set(uniqueExperimentIds(options.experimentIds));
  const latestDigestByExperiment = options.latestDigestByExperiment ?? new Map();
  const bundleRoot = resolveInside(projectRoot, ...BUNDLE_ROOT_SEGMENTS);

  let entries;
  try {
    entries = await readdir(bundleRoot, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return {
        totalBundles: 0,
        bundles: [],
        warnings,
      };
    }
    throw error;
  }

  const bundles = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || !EXPERIMENT_ID_PATTERN.test(entry.name)) {
      continue;
    }

    if (experimentIds && !experimentIds.has(entry.name)) {
      continue;
    }

    const bundleDirPath = resolveInside(bundleRoot, entry.name);
    const bundleManifestPath = resolveInside(bundleDirPath, BUNDLE_MANIFEST_FILE);
    let bundleManifest;

    try {
      bundleManifest = await readJson(bundleManifestPath);
      validateBundleManifest(bundleManifest, {
        context: `Bundle manifest ${entry.name}`,
      });
    } catch (error) {
      if (error?.code === 'ENOENT') {
        continue;
      }

      warnings.push(`Unable to read result bundle for ${entry.name}: ${error.message}`);
      continue;
    }

    bundles.push(
      buildBundleSummary(projectRoot, entry.name, bundleManifest, latestDigestByExperiment.get(entry.name) ?? null),
    );
  }

  bundles.sort(compareByTimestampDesc('bundledAt', 'experimentId'));

  return {
    totalBundles: bundles.length,
    bundles: applyLimit(bundles, options.limit),
    warnings,
  };
}

async function listSessionDigests(projectRoot, options = {}) {
  const warnings = [];
  const experimentIds = options.experimentIds == null
    ? null
    : new Set(uniqueExperimentIds(options.experimentIds));
  const summariesRoot = resolveInside(projectRoot, ...SUMMARIES_ROOT_SEGMENTS);
  const validateDigest = await loadValidator(projectRoot, 'session-digest.schema.json');

  let entries;
  try {
    entries = await readdir(summariesRoot, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return {
        totalDigests: 0,
        digests: [],
        warnings,
        latestDigestByExperiment: new Map(),
      };
    }
    throw error;
  }

  const digests = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const digestDirPath = resolveInside(summariesRoot, entry.name);
    const digestJsonPath = resolveInside(digestDirPath, SESSION_DIGEST_JSON);
    let digest;

    try {
      digest = await readJson(digestJsonPath);
      assertValid(validateDigest, digest, `session digest ${entry.name}`);
    } catch (error) {
      if (error?.code === 'ENOENT') {
        continue;
      }

      warnings.push(`Unable to read session digest ${entry.name}: ${error.message}`);
      continue;
    }

    if (
      experimentIds &&
      !Array.isArray(digest.experimentIds) &&
      experimentIds.size > 0
    ) {
      continue;
    }

    if (
      experimentIds &&
      Array.isArray(digest.experimentIds) &&
      !digest.experimentIds.some((experimentId) => experimentIds.has(experimentId))
    ) {
      continue;
    }

    digests.push(buildSessionDigestSummary(projectRoot, digest));
  }

  digests.sort(compareByTimestampDesc('generatedAt', 'digestId'));

  const latestDigestByExperiment = new Map();
  for (const digest of digests) {
    for (const experimentId of digest.experimentIds) {
      if (!latestDigestByExperiment.has(experimentId)) {
        latestDigestByExperiment.set(experimentId, digest);
      }
    }
  }

  return {
    totalDigests: digests.length,
    digests: applyLimit(digests, options.limit),
    warnings,
    latestDigestByExperiment,
  };
}

function buildBundleSummary(projectRoot, experimentId, bundleManifest, latestSessionDigest) {
  const bundleDir = toProjectRelativePath(...BUNDLE_ROOT_SEGMENTS, experimentId);
  const artifactPaths = new Set(
    Array.isArray(bundleManifest.artifacts)
      ? bundleManifest.artifacts.map((entry) => entry.path)
      : [],
  );

  return {
    hasBundle: true,
    experimentId,
    manifestPath: toProjectRelativePath(...MANIFEST_ROOT_SEGMENTS, `${experimentId}.json`),
    bundleDir,
    bundleManifestPath: toProjectRelativePath(bundleDir, BUNDLE_MANIFEST_FILE),
    bundledAt: bundleManifest.bundledAt ?? null,
    sourceAttemptId: bundleManifest.sourceAttemptId ?? null,
    relatedClaims: cloneValue(bundleManifest.relatedClaims ?? []),
    datasetHash: bundleManifest.datasetHash ?? null,
    artifactCount: Array.isArray(bundleManifest.artifacts) ? bundleManifest.artifacts.length : 0,
    analysisReportPath: artifactPaths.has('analysis-report.md')
      ? toProjectRelativePath(bundleDir, 'analysis-report.md')
      : null,
    statsAppendixPath: artifactPaths.has('stats-appendix.md')
      ? toProjectRelativePath(bundleDir, 'stats-appendix.md')
      : null,
    figureCatalogPath: artifactPaths.has('figure-catalog.md')
      ? toProjectRelativePath(bundleDir, 'figure-catalog.md')
      : null,
    latestSessionDigest: latestSessionDigest == null
      ? null
      : {
          digestId: latestSessionDigest.digestId,
          generatedAt: latestSessionDigest.generatedAt,
          jsonPath: latestSessionDigest.jsonPath,
          markdownPath: latestSessionDigest.markdownPath,
        },
  };
}

function buildSessionDigestSummary(projectRoot, digest) {
  const digestDir = toProjectRelativePath(...SUMMARIES_ROOT_SEGMENTS, digest.digestId);

  return {
    digestId: digest.digestId,
    digestDir,
    jsonPath: toProjectRelativePath(digestDir, SESSION_DIGEST_JSON),
    markdownPath: toProjectRelativePath(digestDir, SESSION_DIGEST_MARKDOWN),
    generatedAt: digest.generatedAt ?? null,
    sourceSessionId: digest.sourceSessionId ?? null,
    experimentIds: cloneValue(digest.experimentIds ?? []),
    attemptIds: cloneValue(digest.attemptIds ?? []),
    warnings: cloneValue(digest.warnings ?? []),
  };
}

function normalizeLimit(value) {
  if (value == null) {
    return null;
  }

  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError('limit must be a non-negative integer when provided.');
  }

  return value;
}

function applyLimit(values, limit) {
  return limit == null ? values : values.slice(0, limit);
}

function uniqueExperimentIds(values) {
  const normalizedIds = values.map((value) => normalizeExperimentId(value));
  return [...new Set(normalizedIds)];
}

function normalizeExperimentId(value) {
  if (typeof value !== 'string' || !EXPERIMENT_ID_PATTERN.test(value)) {
    throw new TypeError('experimentId must match EXP-XXX.');
  }

  return value;
}

function compareByTimestampDesc(field, fallbackField) {
  return (left, right) => {
    const leftTimestamp = typeof left[field] === 'string' ? left[field] : '';
    const rightTimestamp = typeof right[field] === 'string' ? right[field] : '';
    const byTimestamp = rightTimestamp.localeCompare(leftTimestamp);
    if (byTimestamp !== 0) {
      return byTimestamp;
    }

    return String(left[fallbackField] ?? '').localeCompare(String(right[fallbackField] ?? ''));
  };
}

function toProjectRelativePath(...segments) {
  return path.posix.join(
    ...segments.map((segment) => String(segment).replaceAll('\\', '/')),
  );
}

function cloneValue(value) {
  return globalThis.structuredClone
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}
