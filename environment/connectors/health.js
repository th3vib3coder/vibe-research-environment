import {
  getConnectorById,
  getConnectorRegistry,
} from './registry.js';
import {
  appendConnectorRunRecord,
  listConnectorRunRecords,
  publishConnectorStatus,
  readConnectorStatus,
} from './manifest.js';

export async function recordConnectorRun(projectPath, connectorId, record) {
  const manifest = await getConnectorById(projectPath, connectorId);
  await appendConnectorRunRecord(projectPath, connectorId, record);

  const summary = await publishConnectorStatus(
    projectPath,
    connectorId,
    buildConnectorStatusSummary(manifest, record),
  );

  return {
    record,
    summary,
  };
}

export async function getConnectorHealthOverview(projectPath, options = {}) {
  try {
    const registry = await getConnectorRegistry(projectPath);
    const warnings = [...registry.warnings];
    const summaries = [];

    for (const connector of registry.connectors) {
      const health = await getConnectorHealth(projectPath, connector.connectorId);
      warnings.push(...health.warnings);
      summaries.push({
        connectorId: connector.connectorId,
        displayName: connector.displayName,
        direction: connector.direction,
        capabilitiesProvided: cloneValue(connector.capabilitiesProvided ?? []),
        summaryPath: connector.failureSurface.summaryPath,
        runLogPath: connector.failureSurface.runLogPath,
        surfacedInStatus: connector.failureSurface.surfacedInStatus,
        healthStatus: health.healthStatus,
        lastRunId: health.lastRunId,
        lastRunStatus: health.lastRunStatus,
        lastRunAt: health.lastRunAt,
        failureMessage: health.failureMessage,
        totalRuns: health.totalRuns,
      });
    }

    return {
      runtimeInstalled: registry.runtimeInstalled,
      totalConnectors: summaries.length,
      connectors: summaries,
      warnings,
    };
  } catch (error) {
    return {
      runtimeInstalled: true,
      totalConnectors: 0,
      connectors: [],
      warnings: [`Connector registry unavailable: ${error.message}`],
    };
  }
}

export async function getConnectorHealth(projectPath, connectorId) {
  let status = null;
  const warnings = [];

  try {
    status = await readConnectorStatus(projectPath, connectorId);
  } catch (error) {
    warnings.push(`Ignoring invalid connector status for ${connectorId}: ${error.message}`);
  }

  const records = await listConnectorRunRecords(projectPath, connectorId);
  const latestRun = records.items[0] ?? null;
  const lastRunAt = latestRun?.endedAt ?? latestRun?.startedAt ?? status?.updatedAt ?? null;
  const failureMessage = latestRun?.visibleFailure?.message ?? status?.lastFailureMessage ?? null;

  return {
    healthStatus: status?.status ?? deriveHealthStatus(latestRun),
    lastRunId: latestRun?.runId ?? status?.lastRunId ?? null,
    lastRunStatus: latestRun?.status ?? status?.lastRunStatus ?? null,
    lastRunAt,
    failureMessage,
    totalRuns: records.total,
    warnings: [...warnings, ...records.warnings],
  };
}

function buildConnectorStatusSummary(manifest, record) {
  return {
    connectorId: manifest.connectorId,
    displayName: manifest.displayName,
    status: deriveHealthStatus(record),
    lastRunId: record.runId,
    lastRunStatus: record.status,
    lastRunKind: record.runKind,
    lastFailureKind: record.visibleFailure.failureKind,
    lastFailureMessage: record.visibleFailure.message,
    surfacedInStatus: manifest.failureSurface.surfacedInStatus,
  };
}

function deriveHealthStatus(record) {
  if (record == null) {
    return 'unknown';
  }

  if (record.status === 'completed') {
    return 'ok';
  }

  if (record.visibleFailure?.failureKind === 'external-unavailable') {
    return 'unavailable';
  }

  return 'degraded';
}

function cloneValue(value) {
  return globalThis.structuredClone
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}
