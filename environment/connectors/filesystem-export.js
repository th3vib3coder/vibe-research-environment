import { randomUUID } from 'node:crypto';
import { cp, mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';

import { resolveInside, resolveProjectRoot } from '../control/_io.js';
import { getResultsOverview } from '../flows/results-discovery.js';
import { getWritingOverview } from '../flows/writing-overview.js';
import { recordConnectorRun } from './health.js';
import { getConnectorById } from './registry.js';
import { resolveExternalTargetRoot } from './target-root.js';

export class ConnectorExportError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = new.target.name;
  }
}

export async function exportResultsBundle(projectPath, experimentId, options = {}) {
  const projectRoot = resolveProjectRoot(projectPath);
  const connector = await expectExportConnector(projectPath, 'filesystem-export');
  const timestamp = normalizeTimestamp(options.now);
  let targetRoot;
  try {
    targetRoot = resolveExternalTargetRoot(projectPath, options.targetDir, 'targetDir');
  } catch (error) {
    return failConnectorExport(projectPath, connector, {
      runKind: 'export',
      timestamp,
      sourceSurfaces: [],
      targetPath: String(options.targetDir ?? ''),
      failureKind: 'path-error',
      message: error.message,
      warnings: [],
    });
  }
  const overview = await getResultsOverview(projectRoot, {
    experimentIds: [experimentId],
    bundleLimit: null,
    digestLimit: 0,
  });
  const bundle = overview.bundles.find((entry) => entry.experimentId === experimentId) ?? null;

  if (bundle == null) {
    return failConnectorExport(projectPath, connector, {
      runKind: 'export',
      timestamp,
      sourceSurfaces: [],
      targetPath: targetRoot,
      failureKind: 'contract-error',
      message: `No packaged results bundle exists for ${experimentId}.`,
      warnings: cloneValue(overview.warnings),
    });
  }

  const sourceDir = resolveInside(projectRoot, bundle.bundleDir);
  const targetPath = path.resolve(targetRoot, 'results', 'experiments', experimentId);

  try {
    await ensureExists(sourceDir, `Results bundle directory missing for ${experimentId}.`);
    await copyIntoTarget(sourceDir, targetPath);
  } catch (error) {
    return failConnectorExport(projectPath, connector, {
      runKind: 'export',
      timestamp,
      sourceSurfaces: [bundle.bundleDir, bundle.bundleManifestPath],
      targetPath,
      failureKind: classifyTargetFailure(error),
      message: error.message,
      warnings: cloneValue(overview.warnings),
    });
  }

  const record = buildConnectorRunRecord({
    connectorId: connector.connectorId,
    runKind: 'export',
    timestamp,
    sourceSurfaces: [bundle.bundleDir, bundle.bundleManifestPath],
    targetPath,
    status: 'completed',
    failureKind: 'none',
    message: null,
    warnings: cloneValue(overview.warnings),
  });

  await recordConnectorRun(projectPath, connector.connectorId, record);

  return {
    connectorId: connector.connectorId,
    runId: record.runId,
    experimentId,
    sourceDir: bundle.bundleDir,
    targetPath,
    warnings: cloneValue(overview.warnings),
  };
}

export async function exportWritingPack(projectPath, options = {}) {
  const projectRoot = resolveProjectRoot(projectPath);
  const connector = await expectExportConnector(projectPath, 'filesystem-export');
  const timestamp = normalizeTimestamp(options.now);
  let targetRoot;
  try {
    targetRoot = resolveExternalTargetRoot(projectPath, options.targetDir, 'targetDir');
  } catch (error) {
    return failConnectorExport(projectPath, connector, {
      runKind: 'export',
      timestamp,
      sourceSurfaces: [],
      targetPath: String(options.targetDir ?? ''),
      failureKind: 'path-error',
      message: error.message,
      warnings: [],
    });
  }
  const kind = normalizePackKind(options.kind);
  const packId = normalizeNonEmptyString(options.packId, 'packId');
  const overview = await getWritingOverview(projectRoot, {
    snapshotLimit: 0,
    exportLimit: 0,
    alertLimit: 0,
    packLimit: null,
  });
  const candidateList = kind === 'advisor' ? overview.advisorPacks : overview.rebuttalPacks;
  const pack = candidateList.find((entry) => entry.packId === packId) ?? null;

  if (pack == null) {
    return failConnectorExport(projectPath, connector, {
      runKind: 'export',
      timestamp,
      sourceSurfaces: [],
      targetPath: targetRoot,
      failureKind: 'contract-error',
      message: `No ${kind} pack exists for ${packId}.`,
      warnings: cloneValue(overview.warnings),
    });
  }

  const sourceDir = resolveInside(projectRoot, pack.dir);
  const targetPath = path.resolve(
    targetRoot,
    'writing',
    kind === 'advisor' ? 'advisor-packs' : 'rebuttal',
    packId,
  );

  try {
    await ensureExists(sourceDir, `${kind} pack directory missing for ${packId}.`);
    await copyIntoTarget(sourceDir, targetPath);
  } catch (error) {
    return failConnectorExport(projectPath, connector, {
      runKind: 'export',
      timestamp,
      sourceSurfaces: [pack.dir],
      targetPath,
      failureKind: classifyTargetFailure(error),
      message: error.message,
      warnings: cloneValue(overview.warnings),
    });
  }

  const record = buildConnectorRunRecord({
    connectorId: connector.connectorId,
    runKind: 'export',
    timestamp,
    sourceSurfaces: [pack.dir],
    targetPath,
    status: 'completed',
    failureKind: 'none',
    message: null,
    warnings: cloneValue(overview.warnings),
  });

  await recordConnectorRun(projectPath, connector.connectorId, record);

  return {
    connectorId: connector.connectorId,
    runId: record.runId,
    kind,
    packId,
    sourceDir: pack.dir,
    targetPath,
    warnings: cloneValue(overview.warnings),
  };
}

async function expectExportConnector(projectPath, connectorId) {
  const connector = await getConnectorById(projectPath, connectorId);
  if (connector.direction !== 'export') {
    throw new ConnectorExportError(`Connector ${connectorId} is not an export connector.`);
  }
  return connector;
}

async function failConnectorExport(projectPath, connector, options) {
  const record = buildConnectorRunRecord({
    connectorId: connector.connectorId,
    runKind: options.runKind,
    timestamp: options.timestamp,
    sourceSurfaces: options.sourceSurfaces,
    targetPath: options.targetPath,
    status: 'failed',
    failureKind: options.failureKind,
    message: options.message,
    warnings: options.warnings,
  });

  await recordConnectorRun(projectPath, connector.connectorId, record);
  throw new ConnectorExportError(options.message);
}

function buildConnectorRunRecord({
  connectorId,
  runKind,
  timestamp,
  sourceSurfaces,
  targetPath,
  status,
  failureKind,
  message,
  warnings,
}) {
  const endedAt = timestamp;
  return {
    schemaVersion: 'vibe-env.connector-run-record.v1',
    runId: buildRunId(timestamp),
    connectorId,
    runKind,
    status,
    startedAt: endedAt,
    endedAt,
    sourceSurfaces: cloneValue(sourceSurfaces),
    target: {
      kind: 'external',
      path: String(targetPath),
    },
    healthCheck: null,
    visibleFailure: {
      surfacedInStatus: true,
      failureKind,
      message,
    },
    warnings: cloneValue(warnings ?? []),
  };
}

function buildRunId(timestamp) {
  return `CONN-RUN-${timestamp.replaceAll(':', '').replaceAll('.', '').replaceAll('T', '-').replaceAll('Z', '')}-${randomUUID().slice(0, 8)}`;
}

function normalizeTimestamp(value) {
  const candidate = value ?? new Date().toISOString();
  if (typeof candidate !== 'string' || Number.isNaN(Date.parse(candidate))) {
    throw new TypeError('now must be a valid ISO date-time string when provided.');
  }
  return candidate;
}

function normalizePackKind(value) {
  if (value !== 'advisor' && value !== 'rebuttal') {
    throw new TypeError('kind must be either "advisor" or "rebuttal".');
  }
  return value;
}

function normalizeNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${label} must be a non-empty string.`);
  }
  return value.trim();
}

async function ensureExists(targetPath, message) {
  await stat(targetPath).catch((error) => {
    if (error?.code === 'ENOENT') {
      throw new ConnectorExportError(message);
    }
    throw error;
  });
}

async function copyIntoTarget(sourcePath, targetPath) {
  await mkdir(path.dirname(targetPath), { recursive: true });
  await rm(targetPath, {
    recursive: true,
    force: true,
  });
  await cp(sourcePath, targetPath, {
    recursive: true,
    force: true,
  });
}

function classifyTargetFailure(error) {
  if (error instanceof ConnectorExportError) {
    return 'contract-error';
  }
  return 'path-error';
}

function cloneValue(value) {
  return globalThis.structuredClone
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}
