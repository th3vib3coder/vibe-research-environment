import { randomUUID } from 'node:crypto';
import { cp, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';

import { resolveInside, resolveProjectRoot } from '../control/_io.js';
import { recordConnectorRun } from './health.js';
import { getConnectorById } from './registry.js';
import { resolveExternalTargetRoot } from './target-root.js';

export class ObsidianExportError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = new.target.name;
  }
}

const MIRROR_FILE_BY_KIND = Object.freeze({
  projectOverview: 'project-overview.md',
  decisionLog: 'decision-log.md',
});

export async function exportMemoryMirror(projectPath, options = {}) {
  const projectRoot = resolveProjectRoot(projectPath);
  const connector = await expectExportConnector(projectPath, 'obsidian-export');
  const timestamp = normalizeTimestamp(options.now);
  let targetRoot;
  try {
    targetRoot = resolveExternalTargetRoot(projectPath, options.vaultDir, 'vaultDir');
  } catch (error) {
    const record = buildConnectorRunRecord({
      connectorId: connector.connectorId,
      timestamp,
      sourceSurfaces: [],
      targetPath: String(options.vaultDir ?? ''),
      status: 'failed',
      failureKind: 'path-error',
      message: error.message,
    });
    await recordConnectorRun(projectPath, connector.connectorId, record);
    throw new ObsidianExportError(error.message);
  }
  const mirrorKind = normalizeMirrorKind(options.mirrorKind);
  const fileName = MIRROR_FILE_BY_KIND[mirrorKind];
  const sourcePath = resolveInside(
    projectRoot,
    '.vibe-science-environment',
    'memory',
    fileName,
  );
  const sourceRelativePath = `.vibe-science-environment/memory/${fileName}`;
  const targetPath = path.resolve(targetRoot, 'VRE', fileName);

  try {
    await ensureExists(sourcePath, `${fileName} is not available for export.`);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await cp(sourcePath, targetPath, { force: true });
  } catch (error) {
    const record = buildConnectorRunRecord({
      connectorId: connector.connectorId,
      timestamp,
      sourceSurfaces: [sourceRelativePath],
      targetPath,
      status: 'failed',
      failureKind: classifyFailure(error),
      message: error.message,
    });
    await recordConnectorRun(projectPath, connector.connectorId, record);
    throw new ObsidianExportError(error.message);
  }

  const record = buildConnectorRunRecord({
    connectorId: connector.connectorId,
    timestamp,
    sourceSurfaces: [sourceRelativePath],
    targetPath,
    status: 'completed',
    failureKind: 'none',
    message: null,
  });
  await recordConnectorRun(projectPath, connector.connectorId, record);

  return {
    connectorId: connector.connectorId,
    runId: record.runId,
    mirrorKind,
    sourcePath: sourceRelativePath,
    targetPath,
  };
}

async function expectExportConnector(projectPath, connectorId) {
  const connector = await getConnectorById(projectPath, connectorId);
  if (connector.direction !== 'export') {
    throw new ObsidianExportError(`Connector ${connectorId} is not an export connector.`);
  }
  return connector;
}

function buildConnectorRunRecord({
  connectorId,
  timestamp,
  sourceSurfaces,
  targetPath,
  status,
  failureKind,
  message,
}) {
  return {
    schemaVersion: 'vibe-env.connector-run-record.v1',
    runId: `CONN-RUN-${timestamp.replaceAll(':', '').replaceAll('.', '').replaceAll('T', '-').replaceAll('Z', '')}-${randomUUID().slice(0, 8)}`,
    connectorId,
    runKind: 'export',
    status,
    startedAt: timestamp,
    endedAt: timestamp,
    sourceSurfaces,
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
    warnings: [],
  };
}

function normalizeTimestamp(value) {
  const candidate = value ?? new Date().toISOString();
  if (typeof candidate !== 'string' || Number.isNaN(Date.parse(candidate))) {
    throw new TypeError('now must be a valid ISO date-time string when provided.');
  }
  return candidate;
}

function normalizeMirrorKind(value) {
  if (!Object.hasOwn(MIRROR_FILE_BY_KIND, value)) {
    throw new TypeError('mirrorKind must be "projectOverview" or "decisionLog".');
  }
  return value;
}

async function ensureExists(targetPath, message) {
  await stat(targetPath).catch((error) => {
    if (error?.code === 'ENOENT') {
      throw new ObsidianExportError(message);
    }
    throw error;
  });
}

function classifyFailure(error) {
  if (error instanceof ObsidianExportError) {
    return 'contract-error';
  }
  return 'external-unavailable';
}
