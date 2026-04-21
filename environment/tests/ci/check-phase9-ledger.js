import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { assert, isDirectRun, normalizeSlashes, repoRoot } from './_helpers.js';

const execFileAsync = promisify(execFile);

export const PATHS = {
  vreLedger: 'phase9-vre-feature-ledger.md',
  specLedger: '../vibe-science/blueprints/private/phase9-vre-autonomous-research-loop/16-implementation-status-ledger.md',
  specReviewLog: '../vibe-science/blueprints/private/phase9-vre-autonomous-research-loop/12-spec-self-review-log.md',
  planReviewLog: '../vibe-science/blueprints/private/phase9-implementation-plan/11-plan-self-review-log.md'
};

const COVERED_VRE_PREFIXES = [
  'package.json',
  'bin/vre',
  'environment/control/',
  'environment/objectives/',
  'environment/orchestrator/',
  'environment/scheduler/',
  'environment/schemas/',
  'environment/tests/ci/',
  'environment/tests/cli/',
  'environment/tests/schemas/',
  'environment/tests/fixtures/phase9/'
];

const COVERED_VIBE_PREFIXES = [
  '../vibe-science/plugin/',
  '../vibe-science/tests/',
  '../vibe-science/.claude/settings.json',
  '../vibe-science/hooks/hooks.json',
  '../vibe-science/package.json'
];

const GO_ENTRY_PATTERN = /## Round 15 - Explicit Operator GO For Cross-Repo Work And T0\.1a Execution/u;

function repoRelativeToAbsolute(localRepoRoot, repoRelativePath) {
  return path.resolve(localRepoRoot, repoRelativePath);
}

async function pathExists(localRepoRoot, repoRelativePath) {
  try {
    await access(repoRelativeToAbsolute(localRepoRoot, repoRelativePath));
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

async function readText(localRepoRoot, repoRelativePath) {
  return readFile(repoRelativeToAbsolute(localRepoRoot, repoRelativePath), 'utf8');
}

function normalizeChangedPath(input, localRepoRoot, workspaceRoot) {
  if (input == null) {
    return null;
  }

  const trimmed = String(input).trim().replace(/^['"]|['"]$/gu, '');
  if (!trimmed) {
    return null;
  }

  if (path.isAbsolute(trimmed)) {
    const absolute = path.resolve(trimmed);
    const repoRelative = normalizeSlashes(path.relative(localRepoRoot, absolute));
    if (repoRelative && !repoRelative.startsWith('../')) {
      return repoRelative;
    }

    const workspaceRelative = normalizeSlashes(path.relative(workspaceRoot, absolute));
    if (workspaceRelative.startsWith('vibe-research-environment/')) {
      return workspaceRelative.slice('vibe-research-environment/'.length);
    }
    if (workspaceRelative.startsWith('vibe-science/')) {
      return `../${workspaceRelative}`;
    }

    return repoRelative;
  }

  const normalized = normalizeSlashes(trimmed.replace(/^\.\//u, ''));
  if (normalized.startsWith('vibe-research-environment/')) {
    return normalized.slice('vibe-research-environment/'.length);
  }
  if (normalized.startsWith('vibe-science/')) {
    return `../${normalized}`;
  }
  return normalized;
}

function parseChangedFilesFromArgs(argv) {
  const changedFiles = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--changed-file') {
      const next = argv[index + 1];
      assert(next, '--changed-file requires a value');
      changedFiles.push(next);
      index += 1;
      continue;
    }

    if (token.startsWith('--changed-file=')) {
      changedFiles.push(token.slice('--changed-file='.length));
    }
  }

  return changedFiles;
}

function parseEnvChangedFiles() {
  const raw = process.env.PHASE9_CHANGED_FILES;
  if (!raw) {
    return [];
  }

  return raw
    .split(/\r?\n|;/u)
    .flatMap((part) => part.split(','))
    .map((value) => value.trim())
    .filter(Boolean);
}

function parseGitStatusPaths(stdout, prefix = '') {
  return stdout
    .split(/\r?\n/u)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const payload = line.slice(3).trim();
      const currentPath = payload.includes(' -> ')
        ? payload.split(' -> ').at(-1)
        : payload;
      return `${prefix}${normalizeSlashes(currentPath)}`;
    });
}

async function commandSucceeds(command, args) {
  try {
    await execFileAsync(command, args, { encoding: 'utf8' });
    return true;
  } catch {
    return false;
  }
}

// Checks whether the spec ledger path is gitignored in its host repository.
// Phase 9 v1 keeps the spec-side ledger under `blueprints/private/`, which is
// gitignored in the vibe-science repo. Git discovery cannot see gitignored
// files, so discovered mode would produce false reds if we required the
// spec ledger to appear in the discovered changed set.
async function isSpecLedgerInGitignoredTree(localRepoRoot, specLedgerRelativePath) {
  const absolutePath = path.resolve(localRepoRoot, specLedgerRelativePath);
  let dir = path.dirname(absolutePath);
  // Walk upward until we find a `.git` directory (the host repo root).
  while (true) {
    const parent = path.dirname(dir);
    if (parent === dir) {
      return false; // No git repo found upward.
    }
    try {
      await access(path.join(dir, '.git'));
      // Found host repo. Ask git if the file is ignored.
      try {
        await execFileAsync('git', ['-C', dir, 'check-ignore', path.relative(dir, absolutePath)], {
          encoding: 'utf8'
        });
        return true; // check-ignore exited 0 → path is ignored.
      } catch {
        return false; // check-ignore exited non-zero → not ignored.
      }
    } catch {
      // No .git here, keep walking up.
      dir = parent;
    }
  }
}

async function collectGitChangedFiles(repoPath, prefix = '') {
  const changed = new Set();

  if (!(await pathExists(repoPath, '.git'))) {
    return changed;
  }

  const baseRef = process.env.PHASE9_GIT_BASE ?? 'HEAD~1';
  if (await commandSucceeds('git', ['-C', repoPath, 'rev-parse', '--verify', baseRef])) {
    const { stdout } = await execFileAsync(
      'git',
      ['-C', repoPath, 'diff', '--name-only', '--diff-filter=ACMRTUXB', `${baseRef}..HEAD`],
      { encoding: 'utf8' }
    );
    for (const line of stdout.split(/\r?\n/u).map((value) => value.trim()).filter(Boolean)) {
      changed.add(`${prefix}${normalizeSlashes(line)}`);
    }
  }

  const { stdout: statusStdout } = await execFileAsync(
    'git',
    ['-C', repoPath, 'status', '--porcelain', '--untracked-files=all'],
    { encoding: 'utf8' }
  );
  for (const file of parseGitStatusPaths(statusStdout, prefix)) {
    changed.add(file);
  }

  return changed;
}

function pathMatches(pathValue, prefixes) {
  return prefixes.some((prefix) => pathValue === prefix || pathValue.startsWith(prefix));
}

export function isCoveredVrePath(pathValue) {
  return pathMatches(pathValue, COVERED_VRE_PREFIXES);
}

export function isCoveredVibeSciencePath(pathValue) {
  return pathMatches(pathValue, COVERED_VIBE_PREFIXES);
}

async function resolveChangedFiles(options) {
  const localRepoRoot = options.repoRoot ?? repoRoot;
  const workspaceRoot = options.workspaceRoot ?? path.resolve(localRepoRoot, '..');

  // Test injection: force discovered-mode with an explicit file set.
  // Used by the discovered-mode regression tests so the fail-closed path
  // does not depend on a live git workspace.
  if (options.discoveryOverride) {
    return {
      mode: 'discovered',
      files: [...new Set([...options.discoveryOverride]
        .map((value) => normalizeChangedPath(value, localRepoRoot, workspaceRoot))
        .filter(Boolean))].sort()
    };
  }

  const explicitChangedFiles = options.changedFiles
    ?? parseChangedFilesFromArgs(options.argv ?? process.argv.slice(2))
    ?? [];
  const envChangedFiles = explicitChangedFiles.length === 0 ? parseEnvChangedFiles() : [];

  if (explicitChangedFiles.length > 0 || envChangedFiles.length > 0) {
    return {
      mode: 'explicit',
      files: [...new Set([...explicitChangedFiles, ...envChangedFiles]
        .map((value) => normalizeChangedPath(value, localRepoRoot, workspaceRoot))
        .filter(Boolean))].sort()
    };
  }

  const changed = new Set();
  for (const file of await collectGitChangedFiles(localRepoRoot, '')) {
    changed.add(normalizeChangedPath(file, localRepoRoot, workspaceRoot));
  }

  const siblingVibeScienceRoot = path.join(workspaceRoot, 'vibe-science');
  for (const file of await collectGitChangedFiles(siblingVibeScienceRoot, '../vibe-science/')) {
    changed.add(normalizeChangedPath(file, localRepoRoot, workspaceRoot));
  }

  return {
    mode: 'discovered',
    files: [...changed].filter(Boolean).sort()
  };
}

function hasGoEntry(markdown) {
  return GO_ENTRY_PATTERN.test(markdown);
}

export default async function checkPhase9Ledger(options = {}) {
  const localRepoRoot = options.repoRoot ?? repoRoot;
  const { files: changedFiles, mode } = await resolveChangedFiles(options);
  const changedSet = new Set(changedFiles);
  const violations = [];

  const ledgerExists = await pathExists(localRepoRoot, PATHS.vreLedger);
  if (ledgerExists) {
    const [specReviewLog, planReviewLog] = await Promise.all([
      readText(localRepoRoot, PATHS.specReviewLog),
      readText(localRepoRoot, PATHS.planReviewLog)
    ]);

    if (!hasGoEntry(specReviewLog) || !hasGoEntry(planReviewLog)) {
      violations.push(
        'E_PHASE9_LEDGER_GO_MISSING phase9-vre-feature-ledger.md exists but Round 15 / T0.1a GO entry is missing in one or both review logs'
      );
    }
  }

  const coveredVreChanges = changedFiles.filter(isCoveredVrePath);
  const coveredVibeChanges = changedFiles.filter(isCoveredVibeSciencePath);

  if (coveredVreChanges.length > 0 && !changedSet.has(PATHS.vreLedger)) {
    violations.push(
      `E_VRE_LEDGER_UPDATE_REQUIRED covered VRE files changed without updating ${PATHS.vreLedger}: ${coveredVreChanges.join(', ')}`
    );
  }

  // Spec-side ledger enforcement fires strictly in explicit mode (CI).
  // In discovered mode, the spec ledger may be gitignored in its host repo
  // (Phase 9 v1 keeps it under blueprints/private/), in which case git
  // discovery cannot see its change and the check would be a false red.
  // When gitignored, we emit a loud diagnostic to stderr and skip only the
  // spec-ledger requirement. The diagnostic is NOT a silent pass: the
  // operator sees it, and CI (explicit mode) remains the strict wall.
  // See Round 17 review log entry (+ Round 17 refinement) for history.
  if ((coveredVreChanges.length > 0 || coveredVibeChanges.length > 0) && !changedSet.has(PATHS.specLedger)) {
    let skipDueToGitignore = false;
    if (mode === 'discovered') {
      if (await isSpecLedgerInGitignoredTree(localRepoRoot, PATHS.specLedger)) {
        skipDueToGitignore = true;
        process.stderr.write(
          `[check-phase9-ledger] NOTE: ${PATHS.specLedger} is gitignored in its host repo. Discovered mode cannot verify its update via git. ` +
          `Phase 9 v1 keeps the spec-side ledger under blueprints/private/ by design. ` +
          `Strict enforcement happens in CI (explicit mode) or when you run "npm run check:phase9-ledger -- --changed-file=..." explicitly.\n`
        );
      }
    }

    if (!skipDueToGitignore) {
      const triggering = [...coveredVreChanges, ...coveredVibeChanges];
      violations.push(
        `E_SPEC_LEDGER_UPDATE_REQUIRED covered Phase 9 work changed without updating ${PATHS.specLedger} (mode=${mode}; triggering paths: ${triggering.join(', ')})`
      );
    }
  }

  assert(violations.length === 0, violations.join('\n'));
}

if (isDirectRun(import.meta)) {
  const { runValidator } = await import('./_helpers.js');
  await runValidator('check-phase9-ledger', () => checkPhase9Ledger());
}
