import { spawn } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import { isDirectRun, repoRoot } from '../ci/_helpers.js';

export const SHARD_BUDGET_EXCEEDED = 'SHARD_BUDGET_EXCEEDED';

const DEFAULT_MAP_PATH = path.join(repoRoot, 'environment/tests/shards/phase9-shard-map.json');
const REVIEWED_LOOP_CLUSTER_FILE = 'environment/tests/cli/research-loop.test.js';

function fail(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  return error;
}

function normalizeProviderShardFile(file) {
  if (typeof file !== 'string' || file.length === 0) {
    throw fail('E_SHARD_FILE_UNSAFE', 'shard file must be a non-empty string');
  }
  if (path.isAbsolute(file)) {
    throw fail('E_SHARD_FILE_UNSAFE', `absolute shard file is forbidden: ${file}`);
  }
  const normalized = file.replaceAll('\\', '/');
  if (
    normalized.includes('..')
    || !normalized.startsWith('tests/')
    || !normalized.endsWith('.test.mjs')
  ) {
    throw fail('E_SHARD_FILE_UNSAFE', `unsafe shard file: ${file}`);
  }
  return normalized;
}

function normalizeLoopClusterFile(file) {
  if (file !== REVIEWED_LOOP_CLUSTER_FILE) {
    throw fail('E_SHARD_VRE_FILE_UNREVIEWED', `unreviewed VRE shard file: ${file}`);
  }
  return file;
}

function validateLoopClusterShard(shard) {
  if (shard.id !== 'loop:clusters' || shard.scriptName !== 'test:loop:clusters') {
    throw fail('E_SHARD_VRE_LOCAL_UNREVIEWED', `unreviewed VRE-local shard: ${shard.id}`);
  }
  if (shard.root !== 'vre') {
    throw fail('E_SHARD_ROOT_INVALID', 'loop:clusters must run from the VRE root');
  }
  if (!Array.isArray(shard.testNamePatterns) || shard.testNamePatterns.length === 0) {
    throw fail('E_SHARD_PATTERN_REQUIRED', 'loop:clusters requires reviewed test-name patterns');
  }
  return {
    id: shard.id,
    scriptName: shard.scriptName,
    root: 'vre',
    budgetSeconds: shard.budgetSeconds,
    files: shard.files.map(normalizeLoopClusterFile),
    testNamePatterns: shard.testNamePatterns
  };
}

function validateShard(shard) {
  if (!Number.isFinite(shard?.budgetSeconds) || shard.budgetSeconds <= 0) {
    throw fail('E_SHARD_BUDGET_INVALID', `invalid budget for ${shard?.id ?? '(unknown)'}`);
  }
  if (shard.root === 'vre' || shard.id?.startsWith('loop:') || shard.scriptName === 'test:loop:clusters') {
    return validateLoopClusterShard(shard);
  }
  if (shard.root !== 'provider') {
    throw fail('E_SHARD_ROOT_INVALID', `invalid shard root for ${shard?.id ?? '(unknown)'}`);
  }
  return {
    id: shard.id,
    scriptName: shard.scriptName,
    root: 'provider',
    budgetSeconds: shard.budgetSeconds,
    files: shard.files.map(normalizeProviderShardFile),
    testNamePatterns: []
  };
}

async function readShardMap(mapPath) {
  const map = JSON.parse(await readFile(mapPath, 'utf8'));
  if (!Array.isArray(map.shards)) {
    throw fail('E_SHARD_MAP_INVALID', 'shard map must contain shards[]');
  }
  return map;
}

function resolveExecutionRoot(shard, map, overrideProviderRoot) {
  if (shard.root === 'vre') {
    if (overrideProviderRoot != null) {
      throw fail('E_SHARD_ROOT_INVALID', 'loop:clusters cannot override the VRE root');
    }
    return repoRoot;
  }
  if (overrideProviderRoot != null) {
    const resolved = path.resolve(overrideProviderRoot);
    if (!path.isAbsolute(resolved)) {
      throw fail('E_SHARD_PROVIDER_ROOT_INVALID', 'providerRoot must resolve to an absolute path');
    }
    return resolved;
  }
  const providerPackage = map?.source?.providerPackage;
  if (providerPackage !== '../vibe-science/package.json') {
    throw fail('E_SHARD_PROVIDER_SOURCE_INVALID', 'provider package source is not reviewed');
  }
  return path.resolve(repoRoot, path.dirname(providerPackage));
}

function formatSeconds(value) {
  return Number(value.toFixed(3)).toString();
}

export async function executeNodeTestShard({ executionRoot, files, testNamePattern }) {
  return new Promise((resolve) => {
    const args = ['--test'];
    if (testNamePattern != null) {
      args.push('--test-name-pattern', testNamePattern);
    }
    args.push(...files);
    const child = spawn(
      process.execPath,
      args,
      {
        cwd: executionRoot,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe']
      }
    );
    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      resolve({
        exitCode: 1,
        stdout,
        stderr: `${stderr}${error.message}`
      });
    });
    child.on('close', (code) => {
      resolve({
        exitCode: code ?? 1,
        stdout,
        stderr
      });
    });
  });
}

async function executeReviewedShard({ executeShard, executionRoot, reviewedShard }) {
  const patterns = reviewedShard.testNamePatterns.length > 0
    ? reviewedShard.testNamePatterns
    : [null];
  let exitCode = 0;
  let stdout = '';
  let stderr = '';

  for (const testNamePattern of patterns) {
    const result = await executeShard({
      executionRoot,
      providerRoot: executionRoot,
      files: reviewedShard.files,
      shard: reviewedShard,
      testNamePattern
    });
    stdout += result.stdout ?? '';
    stderr += result.stderr ?? '';
    const resultExit = Number.isInteger(result.exitCode) && result.exitCode >= 0
      ? result.exitCode
      : 1;
    if (resultExit !== 0 && exitCode === 0) {
      exitCode = resultExit;
    }
  }

  return { exitCode, stdout, stderr };
}

async function assertLoopClusterFileExists(reviewedShard, executionRoot) {
  if (reviewedShard.id !== 'loop:clusters') {
    return;
  }
  try {
    await access(path.resolve(executionRoot, REVIEWED_LOOP_CLUSTER_FILE));
  } catch {
    throw fail('LOOP_SUITE_UNAVAILABLE', 'reviewed research-loop test file is unavailable');
  }
}

export async function runShard(options) {
  const {
    shardId,
    mapPath = DEFAULT_MAP_PATH,
    evidenceOut,
    providerRoot,
    executeShard = executeNodeTestShard,
    nowMs = () => performance.now(),
    timestamp = new Date().toISOString()
  } = options ?? {};

  if (typeof shardId !== 'string' || shardId.length === 0) {
    throw fail('E_SHARD_ID_REQUIRED', 'a shard id is required');
  }
  if (typeof evidenceOut !== 'string' || evidenceOut.length === 0) {
    throw fail('E_SHARD_EVIDENCE_OUT_REQUIRED', 'explicit --evidence-out is required');
  }

  const map = await readShardMap(mapPath);
  const shard = map.shards.find((candidate) => candidate.id === shardId);
  if (shard == null) {
    throw fail('E_SHARD_UNKNOWN', `unknown shard id: ${shardId}`);
  }
  const reviewedShard = validateShard(shard);
  const executionRoot = resolveExecutionRoot(reviewedShard, map, providerRoot);
  await assertLoopClusterFileExists(reviewedShard, executionRoot);

  const startMs = nowMs();
  const execution = await executeReviewedShard({
    executeShard,
    executionRoot,
    reviewedShard
  });
  const endMs = nowMs();
  const elapsedSeconds = Number(((endMs - startMs) / 1000).toFixed(3));
  const testExitCode = Number.isInteger(execution.exitCode) && execution.exitCode >= 0
    ? execution.exitCode
    : 1;
  const withinBudget = elapsedSeconds <= reviewedShard.budgetSeconds;
  const pass = testExitCode === 0 && withinBudget;
  const budgetLine = withinBudget
    ? ''
    : `${SHARD_BUDGET_EXCEEDED} ${reviewedShard.id} ${formatSeconds(elapsedSeconds)}s > ${formatSeconds(reviewedShard.budgetSeconds)}s`;
  const stderr = [execution.stderr, budgetLine].filter(Boolean).join('\n');
  const exitCode = pass ? 0 : (testExitCode === 0 ? 1 : testExitCode);
  const evidence = {
    schemaVersion: 'phase14.shard-evidence.v1',
    id: reviewedShard.id,
    scriptName: reviewedShard.scriptName,
    pass,
    testExitCode,
    elapsedSeconds,
    budgetSeconds: reviewedShard.budgetSeconds,
    withinBudget,
    timestamp
  };

  await mkdir(path.dirname(path.resolve(evidenceOut)), { recursive: true });
  await writeFile(evidenceOut, `${JSON.stringify(evidence, null, 2)}\n`);

  return {
    exitCode,
    stdout: execution.stdout ?? '',
    stderr,
    evidence
  };
}

function parseCliArgs(argv) {
  const [shardId, flag, evidenceOut, ...rest] = argv;
  if (rest.length > 0 || flag !== '--evidence-out' || evidenceOut == null) {
    throw fail('E_SHARD_USAGE', 'usage: node run-shard.js <shard-id> --evidence-out <path>');
  }
  return { shardId, evidenceOut };
}

if (isDirectRun(import.meta)) {
  try {
    const options = parseCliArgs(process.argv.slice(2));
    const result = await runShard(options);
    if (result.stdout) {
      process.stdout.write(result.stdout);
    }
    if (result.stderr) {
      process.stderr.write(`${result.stderr}\n`);
    }
    process.exitCode = result.exitCode;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
