import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { isDirectRun, repoRoot } from '../ci/_helpers.js';
import { runShard } from './run-shard.js';

export const AGGREGATE_SCHEMA_VERSION = 'phase14.shard-evidence-report.v1';
export const DEFAULT_MAP_PATH = path.join(repoRoot, 'environment/tests/shards/phase9-shard-map.json');
export const DEFAULT_REPORT_PATH = path.join(repoRoot, '.tmp-vre-shards/shard-evidence.json');
export const DEFAULT_EVIDENCE_DIR = path.join(repoRoot, '.tmp-vre-shards/per-shard');

const PER_SHARD_SCHEMA_VERSION = 'phase14.shard-evidence.v1';

function fail(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  return error;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function normalizePathForReport(filePath) {
  return path.relative(repoRoot, path.resolve(filePath)).split(path.sep).join('/');
}

function shardSlug(shardId) {
  return shardId.replaceAll(':', '-').replaceAll(/[^a-zA-Z0-9._-]/gu, '-');
}

function assertShardMap(shardMap) {
  if (shardMap == null || !Array.isArray(shardMap.shards)) {
    throw fail('E_SHARD_AGGREGATE_MAP_INVALID', 'shard map must contain shards[]');
  }
  if (shardMap.shards.length === 0) {
    throw fail('E_SHARD_AGGREGATE_MAP_INVALID', 'shard map cannot be empty');
  }
}

function assertEvidenceRow(row) {
  if (row == null || typeof row !== 'object' || Array.isArray(row)) {
    throw fail('E_SHARD_AGGREGATE_ROW_INVALID', 'evidence row must be an object');
  }
  if (row.schemaVersion !== PER_SHARD_SCHEMA_VERSION) {
    throw fail('E_SHARD_AGGREGATE_ROW_INVALID', 'unexpected per-shard schemaVersion');
  }
  if (typeof row.id !== 'string' || row.id.length === 0) {
    throw fail('E_SHARD_AGGREGATE_ROW_INVALID', 'evidence row id must be a non-empty string');
  }
  if (typeof row.scriptName !== 'string' || row.scriptName.length === 0) {
    throw fail('E_SHARD_AGGREGATE_ROW_INVALID', 'evidence row scriptName must be a non-empty string');
  }
  if (typeof row.pass !== 'boolean') {
    throw fail('E_SHARD_AGGREGATE_ROW_INVALID', 'evidence row pass must be boolean');
  }
  if (!Number.isInteger(row.testExitCode) || row.testExitCode < 0) {
    throw fail('E_SHARD_AGGREGATE_ROW_INVALID', 'evidence row testExitCode must be a non-negative integer');
  }
  if (!Number.isFinite(row.elapsedSeconds) || row.elapsedSeconds < 0) {
    throw fail('E_SHARD_AGGREGATE_ROW_INVALID', 'evidence row elapsedSeconds must be a non-negative number');
  }
  if (!Number.isFinite(row.budgetSeconds) || row.budgetSeconds <= 0) {
    throw fail('E_SHARD_AGGREGATE_ROW_INVALID', 'evidence row budgetSeconds must be positive');
  }
  if (typeof row.withinBudget !== 'boolean') {
    throw fail('E_SHARD_AGGREGATE_ROW_INVALID', 'evidence row withinBudget must be boolean');
  }
  if (typeof row.timestamp !== 'string' || Number.isNaN(Date.parse(row.timestamp))) {
    throw fail('E_SHARD_AGGREGATE_ROW_INVALID', 'evidence row timestamp must be date-time');
  }
}

export function aggregateEvidence(options) {
  const {
    shardMap,
    evidenceRows,
    generatedAt = new Date().toISOString(),
    shardMapPath = DEFAULT_MAP_PATH,
    runnerPath = path.join(repoRoot, 'environment/tests/shards/run-shard.js')
  } = options ?? {};

  assertShardMap(shardMap);
  if (!Array.isArray(evidenceRows)) {
    throw fail('E_SHARD_AGGREGATE_ROW_INVALID', 'evidenceRows must be an array');
  }

  const expectedById = new Map();
  for (const shard of shardMap.shards) {
    expectedById.set(shard.id, shard);
  }

  const rowsById = new Map();
  for (const row of evidenceRows) {
    assertEvidenceRow(row);
    if (rowsById.has(row.id)) {
      throw fail('E_SHARD_AGGREGATE_DUPLICATE', `duplicate shard evidence: ${row.id}`);
    }
    if (!expectedById.has(row.id)) {
      throw fail('E_SHARD_AGGREGATE_UNKNOWN', `unknown shard evidence: ${row.id}`);
    }
    rowsById.set(row.id, row);
  }

  for (const shard of shardMap.shards) {
    const row = rowsById.get(shard.id);
    if (row == null) {
      throw fail('E_SHARD_AGGREGATE_MISSING', `missing shard evidence: ${shard.id}`);
    }
    if (row.scriptName !== shard.scriptName) {
      throw fail('E_SHARD_AGGREGATE_SCRIPT_MISMATCH', `script mismatch for ${shard.id}`);
    }
  }

  const rows = shardMap.shards.map((shard) => rowsById.get(shard.id));
  return {
    schemaVersion: AGGREGATE_SCHEMA_VERSION,
    generatedAt,
    source: {
      shardMap: normalizePathForReport(shardMapPath),
      runner: normalizePathForReport(runnerPath)
    },
    shardIds: shardMap.shards.map((shard) => shard.id),
    allPass: rows.every((row) => row.pass === true),
    allWithinBudget: rows.every((row) => row.withinBudget === true),
    shards: rows
  };
}

export async function runShardEvidenceReport(options = {}) {
  const {
    mapPath = DEFAULT_MAP_PATH,
    shardMap,
    reportOut = DEFAULT_REPORT_PATH,
    evidenceDir = DEFAULT_EVIDENCE_DIR,
    runShardImpl = runShard,
    generatedAt = new Date().toISOString(),
    timestamp = new Date().toISOString()
  } = options;
  const map = shardMap ?? await readJson(mapPath);
  assertShardMap(map);

  await mkdir(evidenceDir, { recursive: true });
  const evidenceRows = [];
  const exitCodes = [];

  for (const shard of map.shards) {
    const evidenceOut = path.join(evidenceDir, `${shardSlug(shard.id)}.json`);
    const result = await runShardImpl({
      shardId: shard.id,
      mapPath,
      evidenceOut,
      timestamp
    });
    exitCodes.push(Number.isInteger(result?.exitCode) ? result.exitCode : 1);
    evidenceRows.push(result?.evidence ?? await readJson(evidenceOut));
  }

  const report = aggregateEvidence({
    shardMap: map,
    evidenceRows,
    generatedAt,
    shardMapPath: mapPath
  });

  await mkdir(path.dirname(path.resolve(reportOut)), { recursive: true });
  await writeFile(reportOut, `${JSON.stringify(report, null, 2)}\n`);

  const exitCode = exitCodes.every((code) => code === 0) && report.allPass && report.allWithinBudget
    ? 0
    : 1;
  return { exitCode, report };
}

function parseCliArgs(argv) {
  if (argv.length === 0) {
    return { reportOut: DEFAULT_REPORT_PATH };
  }
  const [flag, reportOut, ...rest] = argv;
  if (flag !== '--out' || reportOut == null || rest.length > 0) {
    throw fail('E_SHARD_AGGREGATE_USAGE', 'usage: node aggregate-evidence.js [--out <path>]');
  }
  return { reportOut };
}

if (isDirectRun(import.meta)) {
  try {
    const options = parseCliArgs(process.argv.slice(2));
    const { exitCode, report } = await runShardEvidenceReport(options);
    process.stdout.write(`${JSON.stringify({
      schemaVersion: report.schemaVersion,
      allPass: report.allPass,
      allWithinBudget: report.allWithinBudget,
      shardCount: report.shards.length
    })}\n`);
    process.exitCode = exitCode;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
