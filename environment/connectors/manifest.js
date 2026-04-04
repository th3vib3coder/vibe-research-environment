import { appendFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';

import {
  assertValid,
  atomicWriteJson,
  loadValidator,
  now,
  readJson,
  readJsonl,
  resolveInside,
  resolveProjectRoot,
  withLock,
} from '../control/_io.js';

const CONNECTORS_CORE_BUNDLE = 'connectors-core';
const CONNECTOR_MANIFEST_SCHEMA = 'connector-manifest.schema.json';
const CONNECTOR_RUN_RECORD_SCHEMA = 'connector-run-record.schema.json';
const CONNECTOR_STATUS_SCHEMA = 'connector-status.schema.json';
const CONNECTOR_MANIFEST_SUFFIX = '.connector.json';
const CONNECTOR_MANIFESTS_SEGMENTS = ['environment', 'connectors', 'manifests'];
const CONNECTOR_STATE_SEGMENTS = ['.vibe-science-environment', 'connectors'];

export function connectorManifestsDir(projectPath) {
  return resolveInside(resolveProjectRoot(projectPath), ...CONNECTOR_MANIFESTS_SEGMENTS);
}

export function connectorsStateDir(projectPath) {
  return resolveInside(resolveProjectRoot(projectPath), ...CONNECTOR_STATE_SEGMENTS);
}

export function connectorStateDir(projectPath, connectorId) {
  return resolveInside(connectorsStateDir(projectPath), connectorId);
}

export function connectorStatusPath(projectPath, connectorId) {
  return resolveInside(connectorStateDir(projectPath, connectorId), 'status.json');
}

export function connectorRunLogPath(projectPath, connectorId) {
  return resolveInside(connectorStateDir(projectPath, connectorId), 'run-log.jsonl');
}

export async function ensureConnectorStateDir(projectPath, connectorId) {
  const targetDir = connectorStateDir(projectPath, connectorId);
  await mkdir(targetDir, { recursive: true });
  return targetDir;
}

export async function readInstalledBundles(projectPath) {
  const installStatePath = resolveInside(
    resolveProjectRoot(projectPath),
    '.vibe-science-environment',
    '.install-state.json',
  );

  try {
    const installState = await readJson(installStatePath);
    return Array.isArray(installState.bundles) ? [...installState.bundles] : [];
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

export async function isConnectorsCoreInstalled(projectPath) {
  return (await readInstalledBundles(projectPath)).includes(CONNECTORS_CORE_BUNDLE);
}

export async function listConnectorManifestFiles(projectPath) {
  if (!(await isConnectorsCoreInstalled(projectPath))) {
    return [];
  }

  const entries = await readdir(connectorManifestsDir(projectPath), {
    withFileTypes: true,
  });

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(CONNECTOR_MANIFEST_SUFFIX))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

export async function readConnectorManifest(projectPath, fileName) {
  const manifest = await readJson(resolveInside(connectorManifestsDir(projectPath), fileName));
  await validateConnectorManifest(projectPath, manifest, {
    context: `Connector manifest ${fileName}`,
  });
  const expectedConnectorId = fileName.slice(0, -CONNECTOR_MANIFEST_SUFFIX.length);
  if (manifest.connectorId !== expectedConnectorId) {
    throw new Error(
      `Connector manifest file name mismatch: ${fileName} declares connectorId ${manifest.connectorId}.`,
    );
  }
  return manifest;
}

export async function validateConnectorManifest(projectPath, manifest, options = {}) {
  const validate = await loadValidator(projectPath, CONNECTOR_MANIFEST_SCHEMA);
  assertValid(validate, manifest, options.context ?? 'connector manifest');
  return manifest;
}

export async function validateConnectorRunRecord(projectPath, record, options = {}) {
  const validate = await loadValidator(projectPath, CONNECTOR_RUN_RECORD_SCHEMA);
  assertValid(validate, record, options.context ?? 'connector run record');
  return record;
}

export async function validateConnectorStatusRecord(projectPath, record, options = {}) {
  const validate = await loadValidator(projectPath, CONNECTOR_STATUS_SCHEMA);
  assertValid(validate, record, options.context ?? 'connector status record');
  return record;
}

export async function appendConnectorRunRecord(projectPath, connectorId, record) {
  await ensureConnectorStateDir(projectPath, connectorId);
  await validateConnectorRunRecord(projectPath, record, {
    context: `connector run record ${record.runId ?? connectorId}`,
  });
  const targetPath = connectorRunLogPath(projectPath, connectorId);
  await withLock(
    projectPath,
    `connector-run-log-${connectorId}`,
    async () => {
      await appendFile(targetPath, `${JSON.stringify(record)}\n`, 'utf8');
    },
  );
  return targetPath;
}

export async function listConnectorRunRecords(projectPath, connectorId) {
  const records = await readJsonl(connectorRunLogPath(projectPath, connectorId));
  const warnings = [];
  const validRecords = [];

  for (const record of records) {
    try {
      await validateConnectorRunRecord(projectPath, record, {
        context: `connector run record ${record?.runId ?? connectorId}`,
      });
      validRecords.push(record);
    } catch (error) {
      warnings.push(`Ignoring invalid connector run record for ${connectorId}: ${error.message}`);
    }
  }

  validRecords.sort(compareRunRecordsDesc);
  return {
    total: validRecords.length,
    items: validRecords,
    warnings,
  };
}

export async function publishConnectorStatus(projectPath, connectorId, summary) {
  await ensureConnectorStateDir(projectPath, connectorId);
  const payload = {
    schemaVersion: 'vibe-env.connector-status.v1',
    connectorId,
    updatedAt: now(),
    displayName: summary.displayName,
    status: summary.status,
    lastRunId: summary.lastRunId ?? null,
    lastRunStatus: summary.lastRunStatus ?? null,
    lastRunKind: summary.lastRunKind ?? null,
    lastFailureKind: summary.lastFailureKind ?? null,
    lastFailureMessage: summary.lastFailureMessage ?? null,
    surfacedInStatus: summary.surfacedInStatus,
  };
  await validateConnectorStatusRecord(projectPath, payload, {
    context: `connector status record ${connectorId}`,
  });
  await atomicWriteJson(connectorStatusPath(projectPath, connectorId), payload);
  return payload;
}

export async function readConnectorStatus(projectPath, connectorId) {
  try {
    const payload = await readJson(connectorStatusPath(projectPath, connectorId));
    await validateConnectorStatusRecord(projectPath, payload, {
      context: `connector status record ${connectorId}`,
    });
    return payload;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export function toProjectRelativePath(...segments) {
  return path.posix.join(
    ...segments.map((segment) => String(segment).replaceAll('\\', '/')),
  );
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
