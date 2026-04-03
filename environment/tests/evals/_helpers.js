import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const PHASE1_EXPECTED_TASK_FILES = [
  'flow-status-resume.json',
  'flow-literature-register.json',
  'flow-experiment-register.json',
  'degraded-kernel-mode.json'
];

export const PHASE2_EXPECTED_TASK_FILES = [
  'sync-memory-refresh.json',
  'flow-status-stale-memory.json',
  'flow-results-package.json',
  'flow-status-results-findability.json'
];

export const PHASE3_EXPECTED_TASK_FILES = [
  'flow-writing-export-eligibility-positive.json',
  'flow-writing-default-mode-blocked.json',
  'flow-writing-snapshot-export.json',
  'flow-writing-advisor-pack.json',
  'flow-writing-rebuttal-pack.json',
  'flow-writing-warning-replay.json',
  'flow-results-export-policy.json'
];

export const EXPECTED_TASK_FILES = [
  ...PHASE1_EXPECTED_TASK_FILES,
  ...PHASE2_EXPECTED_TASK_FILES,
  ...PHASE3_EXPECTED_TASK_FILES
];

export const EXPECTED_METRIC_FILES = [
  'resume-latency.js',
  'honesty-under-degradation.js',
  'state-write-scope.js',
  'attempt-lifecycle-completeness.js',
  'snapshot-publish-success.js'
];

export const EXPECTED_METRIC_IDS = [
  'resume-latency',
  'honesty-under-degradation',
  'state-write-scope',
  'attempt-lifecycle-completeness',
  'snapshot-publish-success'
];

export const BENCHMARK_SPECS = [
  {
    benchmarkFile: 'environment/evals/benchmarks/phase1-core.benchmark.json',
    benchmarkId: 'phase1-core',
    phase: 1,
    taskFiles: PHASE1_EXPECTED_TASK_FILES
  },
  {
    benchmarkFile: 'environment/evals/benchmarks/phase2-memory-packaging.benchmark.json',
    benchmarkId: 'phase2-memory-packaging',
    phase: 2,
    taskFiles: PHASE2_EXPECTED_TASK_FILES
  },
  {
    benchmarkFile: 'environment/evals/benchmarks/phase3-writing-deliverables.benchmark.json',
    benchmarkId: 'phase3-writing-deliverables',
    phase: 3,
    taskFiles: PHASE3_EXPECTED_TASK_FILES
  }
];

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

export async function readRepoJson(repoRelativePath) {
  return JSON.parse(await readFile(path.join(repoRoot, repoRelativePath), 'utf8'));
}

export async function importRepoModule(repoRelativePath) {
  return import(pathToFileURL(path.join(repoRoot, repoRelativePath)).href);
}

export async function assertRepoPathExists(repoRelativePath) {
  await access(path.join(repoRoot, repoRelativePath));
}

export function assertSetEqual(actualValues, expectedValues, label) {
  assert.deepEqual(
    [...actualValues].sort(),
    [...expectedValues].sort(),
    label
  );
}

export function commandDocPath(commandName) {
  return `commands/${commandName.replace(/^\//u, '')}.md`;
}

export async function listSavedBenchmarkRepeats(taskId) {
  const taskRoot = path.join(
    repoRoot,
    '.vibe-science-environment',
    'operator-validation',
    'benchmarks',
    taskId
  );

  const entries = await readdir(taskRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}
