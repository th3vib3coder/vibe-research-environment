import { copyFile, mkdir, rename, rm, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { writeBundleManifest } from '../lib/bundle-manifest.js';
import { readFlowIndex, writeFlowIndex } from '../lib/flow-state.js';
import { readManifest } from '../lib/manifest.js';
import {
  buildBundleArtifacts,
  buildBundleFiles,
  buildWarningActions,
  buildWarnings,
} from './results-render.js';

const FLOW_NAME = 'results';
const COMMAND_NAME = '/flow-results';
const RESULT_STAGE = 'result-packaging';
const TYPE_DIRECTORIES = {
  report: 'reports',
  figure: 'figures',
  table: 'tables',
  dataset: 'datasets',
  notebook: 'notebooks',
  other: 'artifacts',
};

export class ResultsFlowError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class ResultsPackagingError extends ResultsFlowError {}

export async function packageExperimentResults(projectPath, experimentId, options = {}) {
  const projectRoot = resolveProjectRoot(projectPath);
  const manifest = await readManifest(projectRoot, experimentId);
  const timestamp = normalizeTimestamp(options.now ?? new Date().toISOString(), 'now');
  assertCompletedManifest(manifest);
  const sourceAttemptId = normalizeSourceAttemptId(
    options.sourceAttemptId ?? manifest.latestAttemptId,
  );
  const bundleDir = resolveInside(
    projectRoot,
    '.vibe-science-environment',
    'results',
    'experiments',
    manifest.experimentId,
  );

  const plannedCopies = await planCopiedArtifacts(projectRoot, manifest, bundleDir, {
    artifactMetadata: options.artifactMetadata,
  });
  const warnings = buildWarnings(manifest, plannedCopies, options);
  const bundleFiles = buildBundleFiles(manifest, plannedCopies, {
    timestamp,
    sourceAttemptId,
    datasetHash: options.datasetHash ?? null,
    warnings,
    analysisQuestion: options.analysisQuestion,
    findings: options.findings,
    caveats: options.caveats,
    statistics: options.statistics,
    comparisonQuestion: options.comparisonQuestion,
    environment: options.environment,
  });
  const bundleArtifacts = buildBundleArtifacts(bundleFiles, plannedCopies, timestamp);
  const bundleManifestPath = path.join(bundleDir, 'bundle-manifest.json');

  await rm(bundleDir, { recursive: true, force: true });
  await mkdir(bundleDir, { recursive: true });

  for (const copyPlan of plannedCopies) {
    await mkdir(path.dirname(copyPlan.targetPath), { recursive: true });
    await copyFile(copyPlan.sourcePath, copyPlan.targetPath);
  }

  for (const [relativePath, content] of Object.entries(bundleFiles)) {
    await atomicWriteText(path.join(bundleDir, relativePath), content);
  }

  const bundleManifest = await writeBundleManifest(
    bundleManifestPath,
    {
      experimentId: manifest.experimentId,
      sourceAttemptId,
      artifacts: bundleArtifacts,
      relatedClaims: cloneValue(manifest.relatedClaims ?? []),
      datasetHash: options.datasetHash ?? null,
    },
    {
      bundledAt: timestamp,
    },
  );

  const index = await syncResultsIndex(projectRoot, manifest, warnings, {
    timestamp,
    commandName: options.commandName ?? COMMAND_NAME,
  });

  return {
    experimentId: manifest.experimentId,
    bundleDir,
    bundleManifestPath,
    bundleManifest,
    warnings,
    copiedArtifacts: plannedCopies.map((entry) => ({
      sourcePath: entry.sourceRelativePath,
      bundlePath: entry.bundleRelativePath,
      type: entry.type,
      role: entry.role,
    })),
    index,
  };
}

async function syncResultsIndex(projectRoot, manifest, warnings, options = {}) {
  const timestamp = options.timestamp ?? new Date().toISOString();
  const currentIndex = await readFlowIndex(projectRoot);

  const nextActions = [
    ...buildWarningActions(manifest.experimentId, warnings),
    `review packaged bundle for ${manifest.experimentId}`,
    ...(manifest.relatedClaims?.length > 0
      ? [`check evidence linkage for ${manifest.experimentId}`]
      : []),
  ].slice(0, 5);

  const blockers = cloneValue(manifest.blockers ?? [])
    .map((entry) => `${manifest.experimentId}: ${entry}`)
    .slice(0, 5);

  const nextIndex = {
    ...currentIndex,
    schemaVersion: currentIndex.schemaVersion ?? 'vibe.flow.index.v1',
    activeFlow: FLOW_NAME,
    currentStage: RESULT_STAGE,
    nextActions: [...new Set(nextActions)],
    blockers: [...new Set(blockers)],
    lastCommand: options.commandName ?? COMMAND_NAME,
    updatedAt: timestamp,
  };

  return writeFlowIndex(projectRoot, nextIndex);
}

async function planCopiedArtifacts(projectRoot, manifest, bundleDir, options = {}) {
  const metadataByPath = normalizeArtifactMetadata(options.artifactMetadata);
  const seenTargets = new Set();
  const plans = [];

  for (const rawSourcePath of manifest.outputArtifacts ?? []) {
    const sourceRelativePath = normalizeRelativePath(rawSourcePath, 'output artifact');
    const sourcePath = resolveInside(projectRoot, sourceRelativePath);
    if (isInside(bundleDir, sourcePath)) {
      throw new ResultsPackagingError(
        `Output artifact already points inside the results bundle: ${sourceRelativePath}`,
      );
    }

    const sourceStats = await stat(sourcePath).catch((error) => {
      if (error?.code === 'ENOENT') {
        throw new ResultsPackagingError(
          `Declared output artifact is missing: ${sourceRelativePath}`,
        );
      }
      throw error;
    });

    if (!sourceStats.isFile()) {
      throw new ResultsPackagingError(
        `Declared output artifact must be a file: ${sourceRelativePath}`,
      );
    }

    const metadata = metadataByPath.get(sourceRelativePath);
    if (!metadata) {
      throw new ResultsPackagingError(
        `Output artifact ${sourceRelativePath} is missing typed packaging metadata.`,
      );
    }

    const type = normalizeArtifactType(metadata.type, sourceRelativePath);
    const role = normalizeArtifactRole(metadata.role, sourceRelativePath);
    const bundleRelativePath = buildCopiedArtifactPath(type, sourceRelativePath);
    if (seenTargets.has(bundleRelativePath)) {
      throw new ResultsPackagingError(
        `Two output artifacts resolve to the same bundle path: ${bundleRelativePath}`,
      );
    }
    seenTargets.add(bundleRelativePath);

    plans.push({
      sourceRelativePath,
      sourcePath,
      targetPath: path.join(bundleDir, ...bundleRelativePath.split('/')),
      bundleRelativePath,
      type,
      role,
      createdAt: normalizeTimestamp(
        metadata.createdAt ?? sourceStats.mtime.toISOString(),
        `createdAt for ${sourceRelativePath}`,
      ),
      size: metadata.size ?? sourceStats.size,
      purpose: metadata.purpose ?? null,
      caption: metadata.caption ?? null,
      interpretation: metadata.interpretation ?? null,
      sourceLabel: metadata.sourceLabel ?? sourceRelativePath,
    });
  }

  return plans;
}

async function atomicWriteText(targetPath, content) {
  const temporaryPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(temporaryPath, `${content}\n`, 'utf8');

  try {
    await rename(temporaryPath, targetPath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => {});
    throw error;
  }
}

function resolveProjectRoot(projectPath) {
  if (typeof projectPath !== 'string' || projectPath.trim() === '') {
    throw new ResultsPackagingError('projectPath must be a non-empty string.');
  }

  return path.resolve(projectPath);
}

function resolveInside(baseDir, ...segments) {
  const target = path.resolve(baseDir, ...segments);
  const relative = path.relative(baseDir, target);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new ResultsPackagingError(`Resolved path escapes the project root: ${target}`);
  }

  return target;
}

function normalizeArtifactMetadata(artifactMetadata) {
  if (artifactMetadata == null) {
    return new Map();
  }
  if (!isPlainObject(artifactMetadata)) {
    throw new ResultsPackagingError('artifactMetadata must be an object keyed by source path.');
  }

  return new Map(
    Object.entries(artifactMetadata).map(([rawPath, metadata]) => [
      normalizeRelativePath(rawPath, 'artifactMetadata key'),
      metadata,
    ]),
  );
}

function normalizeRelativePath(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ResultsPackagingError(`${label} must be a non-empty relative path.`);
  }

  const normalized = value.trim().replaceAll('\\', '/').replace(/^\.\/+/u, '');
  const segments = normalized.split('/');
  if (
    normalized === '' ||
    path.posix.isAbsolute(normalized) ||
    /^[A-Za-z]:\//u.test(normalized) ||
    segments.some((segment) => segment === '' || segment === '.' || segment === '..')
  ) {
    throw new ResultsPackagingError(`${label} must stay inside the project workspace.`);
  }

  return normalized;
}

function buildCopiedArtifactPath(type, sourceRelativePath) {
  const directory = TYPE_DIRECTORIES[type];
  return sourceRelativePath.startsWith(`${directory}/`)
    ? sourceRelativePath
    : `${directory}/${sourceRelativePath}`;
}

function normalizeArtifactType(value, sourceRelativePath) {
  if (typeof value !== 'string' || !Object.hasOwn(TYPE_DIRECTORIES, value)) {
    throw new ResultsPackagingError(
      `Output artifact ${sourceRelativePath} is missing a supported type.`,
    );
  }
  return value;
}

function normalizeArtifactRole(value, sourceRelativePath) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ResultsPackagingError(
      `Output artifact ${sourceRelativePath} is missing a non-empty role.`,
    );
  }
  return value.trim();
}

function normalizeSourceAttemptId(value) {
  if (typeof value !== 'string' || !/^ATT-.+$/u.test(value)) {
    throw new ResultsPackagingError(
      'Results packaging requires a sourceAttemptId or manifest.latestAttemptId matching ATT-....',
    );
  }
  return value;
}

function normalizeTimestamp(value, label) {
  if (typeof value !== 'string' || value.trim() === '' || Number.isNaN(Date.parse(value))) {
    throw new ResultsPackagingError(`${label} must be an ISO date-time string.`);
  }
  return value.trim();
}

function assertCompletedManifest(manifest) {
  if (manifest.status !== 'completed') {
    throw new ResultsPackagingError(
      `Results packaging requires a completed manifest, got ${manifest.status}.`,
    );
  }
}

function isInside(baseDir, targetPath) {
  const relative = path.relative(baseDir, targetPath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function cloneValue(value) {
  return globalThis.structuredClone
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}
