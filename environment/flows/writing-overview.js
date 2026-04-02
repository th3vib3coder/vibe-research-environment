import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { resolveInside, resolveProjectRoot } from '../control/_io.js';
import { validateExportAlertRecord, validateExportRecord } from '../lib/export-records.js';
import { validateExportSnapshot } from '../lib/export-snapshot.js';

const SNAPSHOTS_SEGMENTS = ['.vibe-science-environment', 'writing', 'exports', 'snapshots'];
const EXPORTS_SEGMENTS = ['.vibe-science-environment', 'writing', 'exports'];
const ADVISOR_PACKS_SEGMENTS = ['.vibe-science-environment', 'writing', 'advisor-packs'];
const REBUTTAL_PACKS_SEGMENTS = ['.vibe-science-environment', 'writing', 'rebuttal'];

export async function getWritingOverview(projectPath, options = {}) {
  const projectRoot = resolveProjectRoot(projectPath);
  const snapshotData = await listSnapshots(projectRoot, normalizeLimit(options.snapshotLimit));
  const exportData = await listJsonlRecords(
    resolveInside(projectRoot, ...EXPORTS_SEGMENTS, 'export-log.jsonl'),
    validateExportRecord,
    'export record',
    normalizeLimit(options.exportLimit),
  );
  const alertData = await listJsonlRecords(
    resolveInside(projectRoot, ...EXPORTS_SEGMENTS, 'export-alerts.jsonl'),
    validateExportAlertRecord,
    'export alert',
    normalizeLimit(options.alertLimit),
  );
  const advisorPackData = await listPackDirectories(
    resolveInside(projectRoot, ...ADVISOR_PACKS_SEGMENTS),
    'advisor',
    normalizeLimit(options.packLimit),
  );
  const rebuttalPackData = await listPackDirectories(
    resolveInside(projectRoot, ...REBUTTAL_PACKS_SEGMENTS),
    'rebuttal',
    normalizeLimit(options.packLimit),
  );

  return {
    totalSnapshots: snapshotData.total,
    snapshots: snapshotData.items,
    totalExports: exportData.total,
    exports: exportData.items,
    totalAlerts: alertData.total,
    alerts: alertData.items,
    totalAdvisorPacks: advisorPackData.total,
    advisorPacks: advisorPackData.items,
    totalRebuttalPacks: rebuttalPackData.total,
    rebuttalPacks: rebuttalPackData.items,
    warnings: [
      ...snapshotData.warnings,
      ...exportData.warnings,
      ...alertData.warnings,
      ...advisorPackData.warnings,
      ...rebuttalPackData.warnings,
    ],
  };
}

export async function getWritingSignalSummary(projectPath) {
  const overview = await getWritingOverview(projectPath, {
    snapshotLimit: 0,
    exportLimit: 0,
    alertLimit: 0,
    packLimit: 0,
  });

  return {
    totalAlerts: overview.totalAlerts,
    warnings: overview.warnings,
  };
}

async function listSnapshots(root, limit) {
  const targetDir = resolveInside(root, ...SNAPSHOTS_SEGMENTS);
  const warnings = [];
  let entries;

  try {
    entries = await readdir(targetDir, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return { total: 0, items: [], warnings };
    }
    throw error;
  }

  const items = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) {
      continue;
    }

    const absolutePath = resolveInside(targetDir, entry.name);
    try {
      const snapshot = JSON.parse(await readFile(absolutePath, 'utf8'));
      validateExportSnapshot(snapshot, {
        context: `Export snapshot ${entry.name}`,
      });
      items.push({
        snapshotId: snapshot.snapshotId,
        createdAt: snapshot.createdAt,
        claimIds: cloneValue(snapshot.claimIds ?? []),
        eligibleClaimCount: Array.isArray(snapshot.claims)
          ? snapshot.claims.filter((item) => item?.eligible).length
          : 0,
        warningCount: Array.isArray(snapshot.warnings) ? snapshot.warnings.length : 0,
        warnings: cloneValue(snapshot.warnings ?? []),
        seedDir: toProjectRelativePath(
          ...EXPORTS_SEGMENTS,
          'seeds',
          snapshot.snapshotId,
        ),
      });
    } catch (error) {
      warnings.push(`Ignoring invalid export snapshot ${entry.name}: ${error.message}`);
    }
  }

  items.sort(compareByTimestampDesc('createdAt', 'snapshotId'));
  return {
    total: items.length,
    items: applyLimit(items, limit),
    warnings,
  };
}

async function listJsonlRecords(targetPath, validate, label, limit) {
  const warnings = [];
  let contents;

  try {
    contents = await readFile(targetPath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return { total: 0, items: [], warnings };
    }
    throw error;
  }

  const items = [];
  for (const line of contents.split(/\r?\n/u)) {
    if (line.trim() === '') {
      continue;
    }

    try {
      const parsed = JSON.parse(line);
      validate(parsed, {
        context: label,
      });
      items.push(cloneValue(parsed));
    } catch (error) {
      warnings.push(`Ignoring invalid ${label}: ${error.message}`);
    }
  }

  const timestampField = label === 'export record' ? 'exportedAt' : 'detectedAt';
  const fallbackField = label === 'export record' ? 'claimId' : 'alertId';
  items.sort(compareByTimestampDesc(timestampField, fallbackField));

  return {
    total: items.length,
    items: applyLimit(items, limit),
    warnings,
  };
}

async function listPackDirectories(targetDir, kind, limit) {
  const warnings = [];
  let entries;

  try {
    entries = await readdir(targetDir, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return { total: 0, items: [], warnings };
    }
    throw error;
  }

  const items = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const absolutePath = resolveInside(targetDir, entry.name);
    try {
      const childEntries = await readdir(absolutePath, { withFileTypes: true });
      const metadata = await stat(absolutePath);
      const files = childEntries
        .filter((child) => child.isFile())
        .map((child) => child.name)
        .sort((left, right) => left.localeCompare(right));
      const figureCount = childEntries.some((child) => child.isDirectory() && child.name === 'figures')
        ? await countFiles(resolveInside(absolutePath, 'figures'))
        : 0;
      const baseSegments = kind === 'advisor' ? ADVISOR_PACKS_SEGMENTS : REBUTTAL_PACKS_SEGMENTS;

      items.push({
        packId: entry.name,
        kind,
        dir: toProjectRelativePath(
          ...baseSegments,
          entry.name,
        ),
        updatedAt: metadata.mtime.toISOString(),
        files,
        figureCount,
      });
    } catch (error) {
      warnings.push(`Unable to inspect ${kind} pack ${entry.name}: ${error.message}`);
    }
  }

  items.sort(compareByTimestampDesc('updatedAt', 'packId'));
  return {
    total: items.length,
    items: applyLimit(items, limit),
    warnings,
  };
}

async function countFiles(targetDir) {
  let entries;
  try {
    entries = await readdir(targetDir, { withFileTypes: true });
  } catch {
    return 0;
  }

  let count = 0;
  for (const entry of entries) {
    if (entry.isFile()) {
      count += 1;
      continue;
    }
    if (entry.isDirectory()) {
      count += await countFiles(resolveInside(targetDir, entry.name));
    }
  }

  return count;
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
