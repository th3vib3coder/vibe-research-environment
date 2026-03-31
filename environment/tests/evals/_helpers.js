import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const EXPECTED_TASK_FILES = [
  'flow-status-resume.json',
  'flow-literature-register.json',
  'flow-experiment-register.json',
  'degraded-kernel-mode.json'
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

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

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
