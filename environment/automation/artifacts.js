import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { resolveInside, resolveProjectRoot } from '../control/_io.js';
import { getAutomationById, getAutomationRegistry } from './definitions.js';
import { listAutomationRunRecords } from './run-log.js';

export async function resolveAutomationArtifactPath(projectPath, automationId, fileName) {
  const definition = await getAutomationById(projectPath, automationId);
  return resolveInside(
    resolveProjectRoot(projectPath),
    ...definition.artifactDirectory.split('/').filter(Boolean),
    fileName,
  );
}

export async function writeAutomationArtifact(projectPath, automationId, fileName, content) {
  if (typeof fileName !== 'string' || fileName.trim() === '') {
    throw new TypeError('fileName must be a non-empty string.');
  }
  if (typeof content !== 'string' || content.trim() === '') {
    throw new TypeError('content must be a non-empty string.');
  }

  const projectRoot = resolveProjectRoot(projectPath);
  const targetPath = await resolveAutomationArtifactPath(projectPath, automationId, fileName);
  const targetDir = path.dirname(targetPath);
  const relativePath = toProjectRelativePath(path.relative(projectRoot, targetPath));

  await mkdir(targetDir, { recursive: true });

  const tempPath = path.join(
    targetDir,
    `.${path.basename(targetPath)}.${process.pid}.${Date.now()}.tmp`,
  );
  try {
    await writeFile(tempPath, `${content.trimEnd()}\n`, 'utf8');
    await rename(tempPath, targetPath);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }

  return {
    absolutePath: targetPath,
    relativePath,
  };
}

export async function getAutomationOverview(projectPath, options = {}) {
  try {
    const registry = await getAutomationRegistry(projectPath);
    const warnings = [...registry.warnings];
    const automations = [];

    for (const definition of registry.automations) {
      const records = await listAutomationRunRecords(projectPath, definition.automationId);
      warnings.push(...records.warnings);

      const latestRun = records.items[0] ?? null;
      const lastSuccessfulRun =
        records.items.find((record) => record.status === 'completed') ?? null;

      automations.push({
        automationId: definition.automationId,
        displayName: definition.displayName,
        purpose: definition.purpose,
        commandSurface: definition.commandSurface,
        triggerType: definition.triggerType,
        schedule: cloneValue(definition.schedule ?? null),
        status: latestRun?.status ?? 'ready',
        lastRunId: latestRun?.runId ?? null,
        lastRunAt: latestRun?.endedAt ?? latestRun?.startedAt ?? null,
        lastSuccessfulAt: lastSuccessfulRun?.endedAt ?? lastSuccessfulRun?.startedAt ?? null,
        latestArtifactPath: latestRun?.artifactPath ?? lastSuccessfulRun?.artifactPath ?? null,
        blockedReason: latestRun?.status === 'blocked' ? latestRun.blockedReason : null,
        degradedReason:
          latestRun?.status === 'degraded'
            ? latestRun.degradedReason
            : latestRun?.status === 'failed'
              ? latestRun.warnings?.[0] ?? null
              : null,
        nextDueAt: computeNextDueAt(
          definition.schedule ?? null,
          lastSuccessfulRun ?? latestRun,
          options.now,
        ),
        totalRuns: records.total,
      });
    }

    automations.sort(compareAutomationSummaries);

    return {
      runtimeInstalled: registry.runtimeInstalled,
      totalAutomations: automations.length,
      automations,
      warnings,
    };
  } catch (error) {
    return {
      runtimeInstalled: true,
      totalAutomations: 0,
      automations: [],
      warnings: [`Automation registry unavailable: ${error.message}`],
    };
  }
}

function computeNextDueAt(schedule, latestRun, nowValue) {
  if (schedule == null || schedule.hostNative !== true || latestRun == null) {
    return null;
  }

  const baseTimestamp = Date.parse(latestRun.endedAt ?? latestRun.startedAt ?? '');
  if (Number.isNaN(baseTimestamp)) {
    return null;
  }

  const cadence = String(schedule.cadence ?? '').trim().toLowerCase();
  if (cadence === 'daily') {
    return new Date(baseTimestamp + 24 * 60 * 60 * 1000).toISOString();
  }
  if (cadence === 'weekly') {
    return new Date(baseTimestamp + 7 * 24 * 60 * 60 * 1000).toISOString();
  }

  const fallbackNow =
    typeof nowValue === 'string' && !Number.isNaN(Date.parse(nowValue))
      ? Date.parse(nowValue)
      : null;
  return fallbackNow == null ? null : new Date(fallbackNow).toISOString();
}

function compareAutomationSummaries(left, right) {
  const leftStatus = scoreStatus(left.status);
  const rightStatus = scoreStatus(right.status);
  if (leftStatus !== rightStatus) {
    return leftStatus - rightStatus;
  }

  const leftTimestamp = String(left.lastRunAt ?? '');
  const rightTimestamp = String(right.lastRunAt ?? '');
  const byTimestamp = rightTimestamp.localeCompare(leftTimestamp);
  if (byTimestamp !== 0) {
    return byTimestamp;
  }

  return String(left.automationId).localeCompare(String(right.automationId));
}

function scoreStatus(status) {
  switch (status) {
    case 'failed':
      return 0;
    case 'degraded':
      return 1;
    case 'blocked':
      return 2;
    case 'completed':
      return 3;
    default:
      return 4;
  }
}

function toProjectRelativePath(relativePath) {
  return relativePath.replaceAll('\\', '/');
}

function cloneValue(value) {
  return globalThis.structuredClone
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}
