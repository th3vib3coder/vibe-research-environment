import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { assert, isDirectRun, normalizeSlashes, repoRoot, runValidator } from './_helpers.js';

const execFileAsync = promisify(execFile);
const PHASE13_FEATURE_LEDGER = 'phase13-vre-feature-ledger.md';
const PHASE13_LEDGER_INDEX = 'phase13-vre-feature-ledger-index.md';
const REQUIRED_TRACE_FIELDS = Object.freeze([
  'who:',
  'when:',
  'why:',
  'what:',
  'verification:',
  'reviewer:'
]);

const REQUIRED_FILES = Object.freeze([
  PHASE13_FEATURE_LEDGER,
  PHASE13_LEDGER_INDEX,
  'environment/autonomous/ENTRYPOINTS.json',
  'environment/autonomous/gate.js',
  'environment/tests/ci/validate-edition-isolation.js',
  'environment/tests/ci/check-phase13-ledger.js'
]);

function normalizeChangedPath(input, localRepoRoot) {
  if (input == null) return null;
  const trimmed = String(input).trim().replace(/^['"]|['"]$/gu, '');
  if (!trimmed) return null;
  if (path.isAbsolute(trimmed)) {
    const relative = normalizeSlashes(path.relative(localRepoRoot, path.resolve(trimmed)));
    return relative.startsWith('../') ? null : relative;
  }
  return normalizeSlashes(trimmed.replace(/^\.\//u, ''));
}

async function gitFiles(repoPath, args) {
  try {
    const { stdout } = await execFileAsync('git', args, { cwd: repoPath });
    return stdout
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => normalizeSlashes(line));
  } catch {
    return [];
  }
}

async function collectGitChangedFiles(localRepoRoot) {
  return [...new Set([
    ...(await gitFiles(localRepoRoot, ['diff', '--name-only'])),
    ...(await gitFiles(localRepoRoot, ['diff', '--cached', '--name-only'])),
    ...(await gitFiles(localRepoRoot, ['ls-files', '--others', '--exclude-standard']))
  ])].sort();
}

function parseChangedFilesFromArgs(argv) {
  const changedFiles = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--changed-file') {
      assert(argv[index + 1], '--changed-file requires a value');
      changedFiles.push(argv[index + 1]);
      index += 1;
    } else if (token.startsWith('--changed-file=')) {
      changedFiles.push(token.slice('--changed-file='.length));
    }
  }
  return changedFiles;
}

function parseEnvChangedFiles() {
  const raw = process.env.PHASE13_CHANGED_FILES;
  if (!raw) return [];
  return raw.split(/[;\n]/u).map((value) => value.trim()).filter(Boolean);
}

function isPhase13CoveredPath(pathValue) {
  return pathValue === 'package.json'
    || pathValue.startsWith('.github/workflows/')
    || pathValue === 'bin/vre'
    || pathValue === PHASE13_FEATURE_LEDGER
    || pathValue === PHASE13_LEDGER_INDEX
    || pathValue.startsWith('environment/autonomous/')
    || pathValue.startsWith('environment/tests/autonomous/')
    || pathValue.startsWith('environment/tests/ci/validate-edition-isolation')
    || pathValue.startsWith('environment/tests/ci/check-phase13-ledger')
    || pathValue === 'environment/tests/ci/validate-counts.js'
    || pathValue === 'environment/tests/ci/run-all.js';
}

async function pathExists(localRepoRoot, repoRelativePath) {
  try {
    await readFile(path.resolve(localRepoRoot, repoRelativePath), 'utf8');
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

function includesPath(markdown, changedPath) {
  return markdown.includes(changedPath)
    || markdown.includes(`vibe-research-environment/${changedPath}`);
}

function assertTraceFields(markdown) {
  const lowered = markdown.toLowerCase();
  for (const field of REQUIRED_TRACE_FIELDS) {
    assert(lowered.includes(field), `E_PHASE13_TRACE_FIELD_MISSING ${field}`);
  }
}

async function validateRequiredFiles(localRepoRoot) {
  for (const requiredPath of REQUIRED_FILES) {
    assert(
      await pathExists(localRepoRoot, requiredPath),
      `E_PHASE13_REQUIRED_FILE_MISSING ${requiredPath}`
    );
  }
}

export default async function checkPhase13Ledger(options = {}) {
  const localRepoRoot = options.repoRoot ?? repoRoot;
  const parsedChangedFiles = parseChangedFilesFromArgs(options.argv ?? process.argv.slice(2));
  const envChangedFiles = parseEnvChangedFiles();
  const explicitChangedFiles = options.changedFiles ?? (
    parsedChangedFiles.length > 0 ? parsedChangedFiles : envChangedFiles
  );
  const changedFiles = (explicitChangedFiles.length > 0
    ? explicitChangedFiles
    : await collectGitChangedFiles(localRepoRoot))
    .map((file) => normalizeChangedPath(file, localRepoRoot))
    .filter(Boolean)
    .filter(isPhase13CoveredPath);

  if (options.skipRequiredFiles !== true) {
    await validateRequiredFiles(localRepoRoot);
  }

  const featureLedger = options.featureLedgerText
    ?? await readFile(path.resolve(localRepoRoot, PHASE13_FEATURE_LEDGER), 'utf8');

  assertTraceFields(featureLedger);

  for (const changedPath of changedFiles) {
    assert(
      includesPath(featureLedger, changedPath),
      `E_PHASE13_TRACE_MISSING ${changedPath} in ${PHASE13_FEATURE_LEDGER}`
    );
  }
}

if (isDirectRun(import.meta)) {
  await runValidator('check-phase13-ledger', () => checkPhase13Ledger());
}
