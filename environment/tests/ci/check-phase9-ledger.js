import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { assert, isDirectRun, normalizeSlashes, repoRoot } from './_helpers.js';
import {
  generatePhase9SurfaceIndex,
  SURFACE_INDEX_PATH,
  validateSurfaceIndexShape
} from './phase9-surface-index.js';

const execFileAsync = promisify(execFile);

export const PATHS = {
  vreLedger: 'phase9-vre-feature-ledger.md',
  ledgerIndex: 'phase9-vre-feature-ledger-index.md',
  surfaceIndex: SURFACE_INDEX_PATH,
  specLedger: '../vibe-science/blueprints/private/phase9-vre-autonomous-research-loop/16-implementation-status-ledger.md',
  specReviewLog: '../vibe-science/blueprints/private/phase9-vre-autonomous-research-loop/12-spec-self-review-log.md',
  planReviewLog: '../vibe-science/blueprints/private/phase9-implementation-plan/11-plan-self-review-log.md'
};

const COVERED_VRE_PREFIXES = [
  'package.json',
  '.github/workflows/',
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

function parseMarkdownTable(markdown, heading) {
  const lines = markdown.replace(/\r\n/gu, '\n').split('\n');
  const headingIndex = lines.findIndex((line) => line.trim() === heading);
  if (headingIndex === -1) {
    return [];
  }

  const tableLines = [];
  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (!trimmed) {
      if (tableLines.length > 0) {
        break;
      }
      continue;
    }
    if (!trimmed.startsWith('|')) {
      if (tableLines.length > 0) {
        break;
      }
      continue;
    }
    tableLines.push(trimmed);
  }

  if (tableLines.length < 3) {
    return [];
  }

  const headers = tableLines[0]
    .split('|')
    .slice(1, -1)
    .map((value) => value.trim());

  return tableLines
    .slice(2)
    .map((line) => line.split('|').slice(1, -1).map((value) => value.trim()))
    .map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
}

function stripMarkdownTicks(value) {
  return value.replace(/`/gu, '').trim();
}

function parseLedgerPaths(cell) {
  const tickMatches = [...cell.matchAll(/`([^`]+)`/gu)].map((match) => match[1].trim()).filter(Boolean);
  if (tickMatches.length > 0) {
    return [...new Set(tickMatches)];
  }

  return cell
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function parseLedgerRows(markdown) {
  return parseMarkdownTable(markdown, '## Ledger').map((row) => ({
    seq: stripMarkdownTicks(row.seq ?? ''),
    featureId: stripMarkdownTicks(row['feature id'] ?? ''),
    paths: parseLedgerPaths(row.paths ?? ''),
    status: stripMarkdownTicks(row.status ?? '')
  }));
}

function parseIndexRows(markdown) {
  return parseMarkdownTable(markdown, '## Index').map((row) => ({
    file: stripMarkdownTicks(row.file ?? ''),
    status: stripMarkdownTicks(row.status ?? ''),
    seqRange: stripMarkdownTicks(row['seq range'] ?? ''),
    closed: stripMarkdownTicks(row.closed ?? '')
  }));
}

function parseSeqRange(seqRange) {
  const normalized = seqRange.replace(/…/gu, '...').trim();
  const [startRaw, endRaw] = normalized.split(/[–-]/u).map((value) => value.trim());
  const start = /^\d+$/u.test(startRaw) ? Number(startRaw) : null;
  const end = endRaw === '...' ? null : (/^\d+$/u.test(endRaw) ? Number(endRaw) : null);
  return {
    start,
    end,
    openEnded: endRaw === '...'
  };
}

function isInventoryTrackablePath(pathValue) {
  // Round 22: tightened to align with isCoveredVrePath. The previous rule
  // (any path under environment/**) was too loose: it made every
  // implemented/verified ledger row touching library code (e.g.
  // environment/lib/, environment/tests/lib/, environment/tests/integration/)
  // look "inventory-eligible", even when the row is a bridge-contract or
  // library-test fix that legitimately does not introduce a
  // machine-discoverable surface. That in turn forced the Round 21
  // surfaceBackedLedgerRows pre-filter, which silently skipped orphan
  // detection for ANY row that failed to match a surface — including
  // rows that were actually broken (code deleted, row left behind).
  //
  // By tightening the eligibility set to exactly the Phase 9 covered
  // VRE prefixes, non-surface library rows become naturally ineligible
  // and the strict orphan check can be restored without false reds.
  return pathValue === PATHS.surfaceIndex || isCoveredVrePath(pathValue);
}

function isInventoryEligibleLedgerRow(row) {
  return (row.status === 'implemented' || row.status === 'verified')
    && row.paths.some(isInventoryTrackablePath);
}

const DISPATCHER_ONLY_SHARED_PATHS = new Set(['bin/vre']);
const DISPATCHER_ONLY_TRANSITION_SEQ = 41;

function parseLedgerSeq(row) {
  const parsed = Number.parseInt(String(row.seq), 10);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

function sharedPathsBetweenRowAndSurface(row, surface) {
  return row.paths.filter((pathValue) => surface.paths.includes(pathValue));
}

function isDispatcherOnlySharedFallback(row, sharedPaths) {
  return sharedPaths.length > 0
    && sharedPaths.every((pathValue) => DISPATCHER_ONLY_SHARED_PATHS.has(pathValue))
    && row.paths.every((pathValue) => DISPATCHER_ONLY_SHARED_PATHS.has(pathValue));
}

function liveSurfaceMatchesLedgerRow(surface, row) {
  if (surface.featureId) {
    return row.featureId === surface.featureId;
  }

  return sharedPathsBetweenRowAndSurface(row, surface).length > 0;
}

function ledgerRowMatchesLiveSurface(row, surface) {
  if (row.featureId && surface.featureId && row.featureId === surface.featureId) {
    return true;
  }

  const sharedPaths = sharedPathsBetweenRowAndSurface(row, surface);
  if (sharedPaths.length === 0) {
    return false;
  }

  // Round 29: the last known shared-path lenience was specific to dispatcher-
  // only rows on `bin/vre`. A fake post-Wave-0 row with a fresh featureId and
  // only `bin/vre` in `paths` could still masquerade as "matched" merely
  // because every CLI surface shares the dispatcher file. We close that
  // loophole without rewriting the Wave 0 history:
  //   - legacy Wave 0 dispatcher-only correction/hardening rows (`seq < 041`)
  //     keep the old fallback so already-landed rows like seq 034 do not
  //     become false reds;
  //   - new dispatcher-only rows (`seq >= 041`) must match a live surface by
  //     featureId, not by dispatcher-path overlap alone.
  if (isDispatcherOnlySharedFallback(row, sharedPaths)) {
    return parseLedgerSeq(row) < DISPATCHER_ONLY_TRANSITION_SEQ;
  }

  return true;
}

function surfaceKey(surface) {
  return [
    surface.kind,
    surface.name,
    surface.featureId ?? 'null',
    [...surface.paths].sort().join(',')
  ].join('|');
}

function validateLedgerIndexRows(rows) {
  const violations = [];
  const activeRows = rows.filter((row) => row.status === 'active');
  if (activeRows.length !== 1) {
    violations.push(
      `E_LEDGER_INDEX_INCONSISTENT expected exactly one active ledger row, found ${activeRows.length}`
    );
  }

  for (const row of rows) {
    if (row.status === 'archived' && (!row.closed || row.closed === '—')) {
      violations.push(
        `E_LEDGER_INDEX_INCONSISTENT archived ledger row ${row.file} is missing a closed date`
      );
    }
  }

  for (let index = 1; index < rows.length; index += 1) {
    const previous = parseSeqRange(rows[index - 1].seqRange);
    const current = parseSeqRange(rows[index].seqRange);
    if (previous.end != null && current.start != null && previous.end + 1 !== current.start) {
      violations.push(
        `E_LEDGER_INDEX_INCONSISTENT seq range gap between ${rows[index - 1].file} and ${rows[index].file}`
      );
    }
  }

  return violations;
}

export default async function checkPhase9Ledger(options = {}) {
  const localRepoRoot = options.repoRoot ?? repoRoot;
  const { files: changedFiles, mode } = await resolveChangedFiles(options);
  const changedSet = new Set(changedFiles);
  const violations = [];

  const ledgerExists = await pathExists(localRepoRoot, PATHS.vreLedger);
  if (ledgerExists) {
    const [specReviewLogExists, planReviewLogExists] = await Promise.all([
      pathExists(localRepoRoot, PATHS.specReviewLog),
      pathExists(localRepoRoot, PATHS.planReviewLog)
    ]);

    // Round 25: the two Phase 9 review logs live under
    // vibe-science/blueprints/private/ which is gitignored in the host
    // repo and is therefore absent from a vibe-research-environment-only
    // CI checkout (GitHub Actions runs `check-phase9-ledger` against the
    // VRE repo alone). When either log cannot be read from the sibling,
    // emit a loud stderr diagnostic and skip the GO-entry check instead
    // of throwing ENOENT. Strict enforcement still applies whenever both
    // sibling files are present (local dev, combined workspace CI).
    if (!specReviewLogExists || !planReviewLogExists) {
      const missing = [
        !specReviewLogExists ? PATHS.specReviewLog : null,
        !planReviewLogExists ? PATHS.planReviewLog : null
      ].filter(Boolean);
      process.stderr.write(
        `[check-phase9-ledger] NOTE: Phase 9 review log(s) absent: ${missing.join(', ')}. ` +
        `Phase 9 v1 keeps these logs under vibe-science/blueprints/private/ by design ` +
        `(gitignored). In CI runs of vibe-research-environment alone the sibling repo ` +
        `is not checked out, so the Round 15 / T0.1a GO entry cannot be verified here. ` +
        `Strict enforcement still applies when both sibling review logs are present ` +
        `(local dev with sibling checkout, or combined-workspace CI).\n`
      );
    } else {
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
      // Round 25: three cases where discovered mode cannot verify the
      // spec-side ledger update via git, all emit a loud stderr diagnostic
      // and skip the requirement. Strict enforcement still applies in
      // explicit mode (CI --changed-file=... or combined-workspace CI).
      //   (1) sibling vibe-science repo absent entirely — happens on a
      //       vibe-research-environment-only CI checkout (GitHub Actions);
      //   (2) sibling present but the spec ledger file is gitignored
      //       there (Round 17 refinement);
      //   (3) neither — fall through to strict enforcement.
      const specLedgerExists = await pathExists(localRepoRoot, PATHS.specLedger);
      if (!specLedgerExists) {
        skipDueToGitignore = true;
        process.stderr.write(
          `[check-phase9-ledger] NOTE: ${PATHS.specLedger} does not exist in the sibling workspace. ` +
          `Phase 9 v1 keeps the spec-side ledger under vibe-science/blueprints/private/ (gitignored). ` +
          `In CI runs of vibe-research-environment alone the sibling repo is not checked out, so ` +
          `this requirement cannot be verified here. Strict enforcement still applies in explicit ` +
          `mode (CI --changed-file=... or combined-workspace CI with both repos present).\n`
        );
      } else if (await isSpecLedgerInGitignoredTree(localRepoRoot, PATHS.specLedger)) {
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

  const [ledgerExistsForCrossCheck, ledgerIndexExists, surfaceIndexExists] = await Promise.all([
    pathExists(localRepoRoot, PATHS.vreLedger),
    pathExists(localRepoRoot, PATHS.ledgerIndex),
    pathExists(localRepoRoot, PATHS.surfaceIndex)
  ]);

  const [ledgerMarkdown, ledgerIndexMarkdown] = await Promise.all([
    ledgerExistsForCrossCheck ? readText(localRepoRoot, PATHS.vreLedger) : Promise.resolve(''),
    ledgerIndexExists ? readText(localRepoRoot, PATHS.ledgerIndex) : Promise.resolve('')
  ]);

  // Parsed once; reused by both the absence check below and the cross-check
  // block. An "inventory-eligible" row is implemented or verified AND has
  // at least one inventory-trackable path (bin/, environment/, package.json,
  // or the inventory file itself). Before the first eligible row lands this
  // array is empty and the downstream checks are inert.
  const eligibleLedgerRows = ledgerExistsForCrossCheck
    ? parseLedgerRows(ledgerMarkdown).filter(isInventoryEligibleLedgerRow)
    : [];

  // Round 30: E_LEDGER_PHANTOM_PATH closes the remaining mixed-path residual
  // identified during the Round 29 adversarial review. Before Round 30 a row
  // with `paths=[bin/vre, environment/orchestrator/never-landed.js]` and a
  // fresh featureId silently passed the orphan check because `bin/vre`
  // overlapped with live CLI surfaces — even though the other declared path
  // never existed on disk. The rule now: every VRE-local path declared by
  // an inventory-eligible row must exist on disk. Sibling paths
  // (`../vibe-science/...`) are skipped because the sibling repo may not be
  // checked out in CI. This rule is orthogonal to the orphan check: a row
  // can pass the orphan check (featureId or path overlap) AND still fail
  // phantom-path if it claims a non-existent VRE-local file.
  for (const row of eligibleLedgerRows) {
    const phantom = [];
    for (const p of row.paths) {
      if (p.startsWith('../')) {
        continue;
      }
      if (!(await pathExists(localRepoRoot, p))) {
        phantom.push(p);
      }
    }
    if (phantom.length > 0) {
      violations.push(
        `E_LEDGER_PHANTOM_PATH ledger row seq ${row.seq} (${row.featureId || 'no-feature-id'}) declares VRE-local path(s) that do not exist on disk: ${phantom.join(', ')}`
      );
    }
  }

  // E_LEDGER_SURFACE_INDEX_MISSING closes the loophole observed during the
  // Round 19 adversarial review: deleting phase9-vre-surface-index.json
  // silently disabled the entire cross-check block because the block is
  // gated by pathExists(surfaceIndex). Once the ledger has at least one
  // inventory-eligible row, the inventory file MUST exist. Round 20 (VRE
  // seq 007) landed this refinement.
  if (eligibleLedgerRows.length > 0 && !surfaceIndexExists) {
    violations.push(
      `E_LEDGER_SURFACE_INDEX_MISSING ledger has ${eligibleLedgerRows.length} inventory-eligible row(s) but ${PATHS.surfaceIndex} does not exist (run "npm run build:surface-index" to regenerate)`
    );
  }

  if (surfaceIndexExists) {
    let persistedInventory;
    try {
      persistedInventory = JSON.parse(await readText(localRepoRoot, PATHS.surfaceIndex));
      validateSurfaceIndexShape(persistedInventory);
    } catch (error) {
      violations.push(`E_LEDGER_MISSING_SURFACE ${PATHS.surfaceIndex} is unreadable or invalid: ${error.message}`);
      persistedInventory = [];
    }

    const liveInventory = await generatePhase9SurfaceIndex({ repoRoot: localRepoRoot });
    const persistedKeys = new Set(persistedInventory.map(surfaceKey));
    const liveKeys = new Set(liveInventory.map(surfaceKey));

    for (const surface of liveInventory) {
      if (!persistedKeys.has(surfaceKey(surface))) {
        violations.push(
          `E_LEDGER_MISSING_SURFACE ${PATHS.surfaceIndex} is missing live surface ${surface.name}`
        );
      }
    }

    for (const surface of persistedInventory) {
      if (!liveKeys.has(surfaceKey(surface))) {
        violations.push(
          `E_LEDGER_ORPHAN_ROW ${PATHS.surfaceIndex} contains stale surface ${surface.name} not present in the live codebase`
        );
      }
    }

      // Missing-surface and orphan checks are intentionally asymmetric:
      //
      // - live surface -> ledger row is STRICT when the live surface carries
      //   a featureId. This is needed for T0.3 CLI stubs, where many real
      //   surfaces share the same backing path (`bin/vre`). Without strict
      //   featureId matching in this direction, one ledger row would mask a
      //   missing sibling surface via path overlap alone.
      // - ledger row -> live surface keeps the older path-overlap fallback so
      //   correction/hardening rows that annotate an existing surface do not
      //   get misclassified as orphaned just because they use a different
      //   featureId than the original landing row.
      //
      // Round 22: the orphan check iterates every eligible ledger row again.
      // The Round 21 surfaceBackedLedgerRows pre-filter was reverted because
      // it silently skipped orphan detection for any row that did not match
    // a live or persisted surface — the exact scenario "code deleted, row
    // stays behind" would never fire. Eligibility is now correctly scoped
      // by isInventoryTrackablePath (aligned with isCoveredVrePath) so that
      // non-surface library rows never become eligible in the first place,
      // and the strict orphan rule holds for genuinely covered surfaces.
      for (const surface of liveInventory) {
        const hasLedgerMatch = eligibleLedgerRows.some((row) => liveSurfaceMatchesLedgerRow(surface, row));
        if (!hasLedgerMatch) {
          violations.push(
            `E_LEDGER_MISSING_SURFACE live surface ${surface.name} has no matching implemented/verified ledger row`
        );
      }
    }

      for (const row of eligibleLedgerRows) {
        const hasSurfaceMatch = liveInventory.some((surface) => ledgerRowMatchesLiveSurface(row, surface));
        if (!hasSurfaceMatch) {
          violations.push(
            `E_LEDGER_ORPHAN_ROW ledger row seq ${row.seq} (${row.featureId || 'no-feature-id'}) has no matching live surface`
        );
      }
    }
  }

  if (ledgerIndexExists) {
    const indexViolations = validateLedgerIndexRows(parseIndexRows(ledgerIndexMarkdown));
    violations.push(...indexViolations);
  }

  assert(violations.length === 0, violations.join('\n'));
}

if (isDirectRun(import.meta)) {
  const { runValidator } = await import('./_helpers.js');
  await runValidator('check-phase9-ledger', () => checkPhase9Ledger());
}
