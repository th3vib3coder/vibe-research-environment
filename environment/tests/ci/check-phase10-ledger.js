import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { assert, isDirectRun, normalizeSlashes, repoRoot, runValidator } from './_helpers.js';
import {
  generatePhase10SurfaceIndex,
  PHASE10_SURFACE_INDEX_PATH,
  validatePhase10SurfaceIndexShape
} from './phase10-surface-index.js';

const execFileAsync = promisify(execFile);

export const PHASE10_PATHS = {
  featureLedger: 'phase10-vre-feature-ledger.md',
  forbiddenFeatureLedger: 'phase10-feature-ledger.md',
  surfaceIndex: PHASE10_SURFACE_INDEX_PATH,
  claimEdgeSchema: 'environment/schemas/phase9-claim-edge.schema.json',
  claimEdgeStore: 'environment/claims/edges.js',
  surfaceIndexGenerator: 'environment/tests/ci/phase10-surface-index.js',
  surfaceIndexTest: 'environment/tests/ci/phase10-surface-index.test.js',
  ledgerCheck: 'environment/tests/ci/check-phase10-ledger.js',
  ledgerCheckTest: 'environment/tests/ci/check-phase10-ledger.test.js',
  binVre: 'bin/vre',
  phase9ObjectiveSchema: 'environment/schemas/phase9-objective.schema.json',
  claimEdgeProjection: 'environment/phase10/claim-edge-projection.js',
  claimEdgeProjectionValidator: 'environment/tests/ci/phase10-claim-edge-projection.js',
  claimEdgeProjectionTest: 'environment/tests/ci/phase10-claim-edge-projection.test.js',
  agentOrchestration: 'environment/orchestrator/agent-orchestration.js',
  curatorRole: 'environment/phase10/curator-role.js',
  curatorRoleValidator: 'environment/tests/ci/phase10-curator-role.js',
  curatorRoleTest: 'environment/tests/ci/phase10-curator-role.test.js',
  domainLifecycle: 'environment/phase10/domain-lifecycle.js',
  domainCliTest: 'environment/tests/cli/domain-cli.test.js',
  law13Bridge: 'environment/phase10/law13-bridge.js',
  law13BridgeValidator: 'environment/tests/ci/phase10-law13-bridge.js',
  law13BridgeTest: 'environment/tests/ci/phase10-law13-bridge.test.js',
  rawZone: 'environment/phase10/raw-zone.js',
  rawZoneValidator: 'environment/tests/ci/phase10-raw-zone.js',
  rawZoneTest: 'environment/tests/ci/phase10-raw-zone.test.js',
  curatorWikiLintTask: 'environment/orchestrator/task-registry/phase10-wiki-lint.json',
  curatorWikiCompileTask: 'environment/orchestrator/task-registry/phase10-wiki-compile.json',
  implementationLog: '../vibe-science/blueprints/private/phase10-implementation-plan/phase10-implementation-log.md',
  schemaRegistry: '../vibe-science/blueprints/private/phase10-implementation-plan/phase10-schema-registry.md',
  lintCheckLedger: '../vibe-science/blueprints/private/phase10-implementation-plan/phase10-lint-check-ledger.md',
  roleBudgetLedger: '../vibe-science/blueprints/private/phase10-implementation-plan/phase10-role-budget-ledger.md',
  exportGuardLedger: '../vibe-science/blueprints/private/phase10-implementation-plan/phase10-export-guard-ledger.md',
  fileChangeLedger: '../vibe-science/blueprints/private/phase10-implementation-plan/phase10-file-change-ledger.md',
  changeTraceLedger: '../vibe-science/blueprints/private/phase10-implementation-plan/phase10-change-trace-ledger.md',
  maintenanceNotes: '../vibe-science/blueprints/private/phase10-implementation-plan/phase10-maintenance-notes.md',
  wikiLog: '../vibe-science/blueprints/private/WIKI_VRE/log.md'
};

const REQUIRED_FILES = [
  PHASE10_PATHS.featureLedger,
  PHASE10_PATHS.surfaceIndex,
  PHASE10_PATHS.claimEdgeSchema,
  PHASE10_PATHS.claimEdgeStore,
  PHASE10_PATHS.surfaceIndexGenerator,
  PHASE10_PATHS.surfaceIndexTest,
  PHASE10_PATHS.ledgerCheck,
  PHASE10_PATHS.ledgerCheckTest,
  PHASE10_PATHS.binVre,
  PHASE10_PATHS.phase9ObjectiveSchema,
  PHASE10_PATHS.claimEdgeProjection,
  PHASE10_PATHS.claimEdgeProjectionValidator,
  PHASE10_PATHS.claimEdgeProjectionTest,
  PHASE10_PATHS.agentOrchestration,
  PHASE10_PATHS.curatorRole,
  PHASE10_PATHS.curatorRoleValidator,
  PHASE10_PATHS.curatorRoleTest,
  PHASE10_PATHS.domainLifecycle,
  PHASE10_PATHS.domainCliTest,
  PHASE10_PATHS.law13Bridge,
  PHASE10_PATHS.law13BridgeValidator,
  PHASE10_PATHS.law13BridgeTest,
  PHASE10_PATHS.rawZone,
  PHASE10_PATHS.rawZoneValidator,
  PHASE10_PATHS.rawZoneTest,
  PHASE10_PATHS.curatorWikiLintTask,
  PHASE10_PATHS.curatorWikiCompileTask,
  PHASE10_PATHS.implementationLog,
  PHASE10_PATHS.schemaRegistry,
  PHASE10_PATHS.lintCheckLedger,
  PHASE10_PATHS.roleBudgetLedger,
  PHASE10_PATHS.exportGuardLedger,
  PHASE10_PATHS.fileChangeLedger,
  PHASE10_PATHS.changeTraceLedger,
  PHASE10_PATHS.maintenanceNotes,
  PHASE10_PATHS.wikiLog
];

const REQUIRED_PACKAGE_SCRIPTS = {
  'build:phase10-surface-index': 'phase10-surface-index.js',
  'check:phase10-ledger': 'check-phase10-ledger.js',
  'phase10:dependency-check': 'check-phase10-ledger.js',
  'phase10:claim-edge-projection': 'phase10-claim-edge-projection.js',
  'phase10:curator-role': 'phase10-curator-role.js',
  'phase10:domain-lifecycle': 'domain-cli.test.js',
  'phase10:law13-bridge': 'phase10-law13-bridge.js',
  'phase10:law13-lint': 'phase10-law13-lint.js',
  'phase10:raw-zone': 'phase10-raw-zone.js',
  'test:phase10-scaffold': 'phase10-surface-index.test.js'
};

const REQUIRED_TRACE_FIELDS = ['who:', 'when:', 'why:', 'what:', 'verification:', 'reviewer:'];

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
  if (input == null) return null;
  const trimmed = String(input).trim().replace(/^['"]|['"]$/gu, '');
  if (!trimmed) return null;

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
  return normalized;
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
  const raw = process.env.PHASE10_CHANGED_FILES;
  if (!raw) return [];
  return raw.split(/[;\n]/u).map((value) => value.trim()).filter(Boolean);
}

async function gitFiles(repoPath, args, prefix = '') {
  try {
    const { stdout } = await execFileAsync('git', args, { cwd: repoPath });
    return stdout
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => `${prefix}${normalizeSlashes(line)}`);
  } catch {
    return [];
  }
}

async function collectGitChangedFiles(localRepoRoot, workspaceRoot) {
  const vibeRoot = path.join(workspaceRoot, 'vibe-science');
  const vreFiles = [
    ...(await gitFiles(localRepoRoot, ['diff', '--name-only'])),
    ...(await gitFiles(localRepoRoot, ['diff', '--cached', '--name-only'])),
    ...(await gitFiles(localRepoRoot, ['ls-files', '--others', '--exclude-standard']))
  ];
  const vibeFiles = [
    ...(await gitFiles(vibeRoot, ['diff', '--name-only'], '../vibe-science/')),
    ...(await gitFiles(vibeRoot, ['diff', '--cached', '--name-only'], '../vibe-science/'))
  ];
  return [...new Set([...vreFiles, ...vibeFiles])].sort();
}

async function resolveChangedFiles(options, localRepoRoot, workspaceRoot) {
  const explicit = options.changedFiles
    ?? parseChangedFilesFromArgs(options.argv ?? process.argv.slice(2))
    ?? parseEnvChangedFiles();
  const source = explicit.length > 0 ? explicit : await collectGitChangedFiles(localRepoRoot, workspaceRoot);
  return [...new Set(source.map((file) => normalizeChangedPath(file, localRepoRoot, workspaceRoot)).filter(Boolean))].sort();
}

function isPhase10CoveredPath(pathValue) {
  return pathValue === 'package.json'
    || pathValue === PHASE10_PATHS.binVre
    || pathValue === PHASE10_PATHS.phase9ObjectiveSchema
    || pathValue === PHASE10_PATHS.domainCliTest
    || pathValue.startsWith('phase10-')
    || pathValue.startsWith('environment/tests/ci/phase10-')
    || pathValue.startsWith('environment/tests/ci/check-phase10-')
    || pathValue.startsWith('environment/schemas/phase10-')
    || pathValue.startsWith('environment/tests/schemas/phase10-')
    || pathValue.startsWith('environment/phase10/')
    || pathValue === PHASE10_PATHS.agentOrchestration
    || pathValue.startsWith('environment/orchestrator/task-registry/phase10-')
    || pathValue.startsWith('../vibe-science/blueprints/private/phase10-implementation-plan/phase10-')
    || pathValue.startsWith('../vibe-science/blueprints/private/WIKI_VRE/');
}

function includesPath(markdown, changedPath) {
  return markdown.includes(changedPath)
    || markdown.includes(`vibe-research-environment/${changedPath}`)
    || (changedPath.startsWith('../vibe-science/') && markdown.includes(changedPath.slice('../'.length)));
}

function assertTraceFields(markdown) {
  const lowered = markdown.toLowerCase();
  for (const field of REQUIRED_TRACE_FIELDS) {
    assert(lowered.includes(field), `E_PHASE10_TRACE_FIELD_MISSING ${field}`);
  }
}

async function validateRequiredFiles(localRepoRoot) {
  for (const requiredPath of REQUIRED_FILES) {
    if (!(await pathExists(localRepoRoot, requiredPath))) {
      const code = requiredPath === PHASE10_PATHS.claimEdgeSchema || requiredPath === PHASE10_PATHS.claimEdgeStore
        ? 'E_PHASE10_DEPENDENCY_MISSING'
        : 'E_PHASE10_REQUIRED_FILE_MISSING';
      throw new Error(`${code} ${requiredPath}`);
    }
  }

  if (await pathExists(localRepoRoot, PHASE10_PATHS.forbiddenFeatureLedger)) {
    throw new Error(`E_PHASE10_DUPLICATE_FEATURE_LEDGER ${PHASE10_PATHS.forbiddenFeatureLedger}`);
  }
}

async function validatePackageScripts(localRepoRoot) {
  const packageJson = JSON.parse(await readText(localRepoRoot, 'package.json'));
  const scripts = packageJson.scripts ?? {};
  for (const [scriptName, expectedFragment] of Object.entries(REQUIRED_PACKAGE_SCRIPTS)) {
    assert(
      typeof scripts[scriptName] === 'string' && scripts[scriptName].includes(expectedFragment),
      `E_PHASE10_PACKAGE_SCRIPT_MISSING ${scriptName}`
    );
  }
}

async function validateSurfaceIndex(localRepoRoot, workspaceRoot) {
  const persisted = JSON.parse(await readText(localRepoRoot, PHASE10_PATHS.surfaceIndex));
  validatePhase10SurfaceIndexShape(persisted);
  const live = await generatePhase10SurfaceIndex({ repoRoot: localRepoRoot, workspaceRoot });
  assert(
    JSON.stringify(persisted) === JSON.stringify(live),
    'E_PHASE10_SURFACE_INDEX_STALE run npm run build:phase10-surface-index'
  );
}

async function validateTrace(localRepoRoot, changedFiles) {
  const covered = changedFiles.filter(isPhase10CoveredPath);
  if (covered.length === 0) {
    return;
  }

  const featureLedger = await readText(localRepoRoot, PHASE10_PATHS.featureLedger);
  const implementationLog = await readText(localRepoRoot, PHASE10_PATHS.implementationLog);
  const fileChangeLedger = await readText(localRepoRoot, PHASE10_PATHS.fileChangeLedger);
  const changeTraceLedger = await readText(localRepoRoot, PHASE10_PATHS.changeTraceLedger);
  const maintenanceNotes = await readText(localRepoRoot, PHASE10_PATHS.maintenanceNotes);
  const wikiLog = await readText(localRepoRoot, PHASE10_PATHS.wikiLog);

  assertTraceFields(changeTraceLedger);

  for (const changedPath of covered) {
    assert(includesPath(fileChangeLedger, changedPath), `E_PHASE10_TRACE_MISSING ${changedPath} in ${PHASE10_PATHS.fileChangeLedger}`);
    assert(includesPath(changeTraceLedger, changedPath), `E_PHASE10_TRACE_MISSING ${changedPath} in ${PHASE10_PATHS.changeTraceLedger}`);
    assert(includesPath(implementationLog, changedPath), `E_PHASE10_TRACE_MISSING ${changedPath} in ${PHASE10_PATHS.implementationLog}`);
    assert(includesPath(featureLedger, changedPath), `E_PHASE10_TRACE_MISSING ${changedPath} in ${PHASE10_PATHS.featureLedger}`);
    assert(includesPath(maintenanceNotes, changedPath), `E_PHASE10_TRACE_MISSING ${changedPath} in ${PHASE10_PATHS.maintenanceNotes}`);
    assert(includesPath(wikiLog, changedPath), `E_PHASE10_WIKI_TRACE_MISSING ${changedPath} in ${PHASE10_PATHS.wikiLog}`);
  }
}

export default async function checkPhase10Ledger(options = {}) {
  const localRepoRoot = options.repoRoot ?? repoRoot;
  const workspaceRoot = options.workspaceRoot ?? path.resolve(localRepoRoot, '..');

  await validateRequiredFiles(localRepoRoot);
  await validatePackageScripts(localRepoRoot);
  await validateSurfaceIndex(localRepoRoot, workspaceRoot);
  const changedFiles = await resolveChangedFiles(options, localRepoRoot, workspaceRoot);
  await validateTrace(localRepoRoot, changedFiles);
}

if (isDirectRun(import.meta)) {
  await runValidator('check-phase10-ledger', () => checkPhase10Ledger());
}
